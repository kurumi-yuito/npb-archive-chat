import { getHeader, readBody, setResponseHeader } from 'h3'
import { ZodError } from 'zod'
import {
  consumeChatUsageToken,
  getChatUsageBucket,
  refundChatUsageToken,
} from '@npb/db'
import { chatResponseSchema } from '@npb/schemas'
import { createChatService } from '../services/chat-service'
import {
  ChatQueryParserUnavailableError,
  createChatQueryParser,
} from '../services/chat-query-parser'
import { parseStructuredQueryFromMessageStub } from '../services/chat-query-parser-stub'
import {
  buildFreeUsageInfo,
  buildProUsageInfo,
} from '../utils/build-chat-usage'
import {
  parseBoolean,
  resolveChatRuntimeAuthConfig,
  resolveChatRuntimeUsageConfig,
  resolveChatRuntimeStripeBillingConfig,
} from '../utils/chat-runtime-config'
import { getEffectiveChatAccount, isEffectivePro } from '../utils/chat-account-response'
import { guestUsageGuardBucketKey } from '../utils/guest-usage-guard'
import { parseChatIdentity } from '../utils/parse-chat-identity'
import { parseChatRequestBody } from '../utils/parse-chat-request'
import { createPublicApiError } from '../utils/public-api-error'
import { resolveQaFixtureMode } from '../utils/qa-fixture-mode'
import { getServerChatQueryService, getServerMetaDatabase } from '../utils/server-database'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const openAiCalls = { planner: 0, answer: 0, other: 0 }
  const publishOpenAiCallCounts = () => {
    setResponseHeader(event, 'x-npb-openai-planner-calls', String(openAiCalls.planner))
    setResponseHeader(event, 'x-npb-openai-answer-calls', String(openAiCalls.answer))
    setResponseHeader(event, 'x-npb-openai-other-calls', String(openAiCalls.other))
    setResponseHeader(event, 'x-npb-openai-total-calls', String(openAiCalls.planner + openAiCalls.answer + openAiCalls.other))
  }
  let body: ReturnType<typeof parseChatRequestBody>

  try {
    body = parseChatRequestBody(await readBody(event))
  } catch (error) {
    if (error instanceof ZodError) {
      throw createPublicApiError(400, 'invalid_request', 'Invalid chat request', {
        validation: error.flatten(),
      })
    }
    throw error
  }

  try {
    const cloudflareEnv = event.context.cloudflare?.env
    const fixtureMode = resolveQaFixtureMode({
      modeHeader: getHeader(event, 'x-npb-qa-mode'),
      tokenHeader: getHeader(event, 'x-npb-qa-token'),
      expectedToken:
        typeof cloudflareEnv?.NPB_QA_REPLAY_TOKEN === 'string'
          ? cloudflareEnv.NPB_QA_REPLAY_TOKEN
          : config.npbQaReplayToken,
    })
    if (fixtureMode.error === 'disabled') {
      throw createPublicApiError(403, 'qa_fixture_disabled', 'QA fixture mode is not enabled')
    }
    if (fixtureMode.error === 'forbidden') {
      throw createPublicApiError(403, 'qa_fixture_forbidden', 'QA fixture token is invalid')
    }
    if (fixtureMode.enabled && !body.fixture_structured_query) {
      throw createPublicApiError(400, 'qa_fixture_missing_query', 'fixture_structured_query is required in QA fixture mode')
    }

    const authConfig = resolveChatRuntimeAuthConfig(config, event)
    const usageConfig = resolveChatRuntimeUsageConfig(config, event)
    const billingConfig = resolveChatRuntimeStripeBillingConfig(config, event)
    const identity = parseChatIdentity(event, authConfig)
    const metaDatabase = await getServerMetaDatabase(event, config.npbSqlitePath)
    const account = await getEffectiveChatAccount(
      metaDatabase,
      identity.userId,
      authConfig.defaultPlan ?? 'free',
      billingConfig.billingConfigured,
      authConfig.googleAuthConfigured,
      usageConfig.capacity,
      usageConfig.refillIntervalMinutes,
    )
    const now = new Date()
    const nowSeconds = Math.floor(now.getTime() / 1000)
    const accountBucketKey = `account:${identity.userId}`
    const consumedBucketKeys: string[] = []
    let effectiveBucket: { tokens: number; lastRefillAt: number } | null = null
    if (!isEffectivePro(account)) {
      const accountBucket = await consumeChatUsageToken(metaDatabase, accountBucketKey, usageConfig, nowSeconds)
      if (!accountBucket) {
        const snapshot = await getChatUsageBucket(metaDatabase, accountBucketKey, usageConfig, nowSeconds)
        throw createPublicApiError(429, 'usage_limit_exceeded', 'No chat tokens are currently available', {
          usage: buildFreeUsageInfo(snapshot, usageConfig, now),
        })
      }
      consumedBucketKeys.push(accountBucketKey)
      effectiveBucket = accountBucket

      if (identity.guestGuardEligible && usageConfig.guestGuardEnabled) {
        const guardKey = guestUsageGuardBucketKey(event, authConfig.authSharedSecret)
        const guardBucket = await consumeChatUsageToken(metaDatabase, guardKey, usageConfig, nowSeconds)
        if (!guardBucket) {
          await refundChatUsageToken(metaDatabase, accountBucketKey, usageConfig, nowSeconds)
          consumedBucketKeys.length = 0
          const snapshot = await getChatUsageBucket(metaDatabase, guardKey, usageConfig, nowSeconds)
          throw createPublicApiError(429, 'usage_limit_exceeded', 'Guest usage guard has no tokens available', {
            usage: buildFreeUsageInfo(snapshot, usageConfig, now),
          })
        }
        consumedBucketKeys.push(guardKey)
        if (guardBucket.tokens < effectiveBucket.tokens) effectiveBucket = guardBucket
      }
    }

    try {
      const chatQueryLlmConfig = {
        baseUrl:
          typeof cloudflareEnv?.CHAT_QUERY_LLM_BASE_URL === 'string'
            ? cloudflareEnv.CHAT_QUERY_LLM_BASE_URL
            : config.chatQueryLlmBaseUrl,
        apiKey:
          typeof cloudflareEnv?.CHAT_QUERY_LLM_API_KEY === 'string'
            ? cloudflareEnv.CHAT_QUERY_LLM_API_KEY
            : config.chatQueryLlmApiKey,
        model:
          typeof cloudflareEnv?.CHAT_QUERY_LLM_MODEL === 'string'
            ? cloudflareEnv.CHAT_QUERY_LLM_MODEL
            : config.chatQueryLlmModel,
      }
      const allowHeuristicFallback = parseBoolean(
        typeof cloudflareEnv?.CHAT_ALLOW_HEURISTIC_FALLBACK === 'string'
          ? cloudflareEnv.CHAT_ALLOW_HEURISTIC_FALLBACK
          : config.chatAllowHeuristicFallback,
      )
      const queryService = await getServerChatQueryService(
        event,
        String(config.npbSqlitePath ?? ''),
        typeof config.npbSqliteDir === 'string' ? config.npbSqliteDir : '',
      )
      const queryParser = fixtureMode.enabled
        ? async () => body.fixture_structured_query!
        : createChatQueryParser({
              baseUrl: chatQueryLlmConfig.baseUrl,
              apiKey: chatQueryLlmConfig.apiKey,
              model: chatQueryLlmConfig.model,
            }, {
              allowFallback: allowHeuristicFallback,
            })
      const service = createChatService(queryService, {
        parseStructuredQueryFromMessage: async (...args) => {
          if (!fixtureMode.enabled) openAiCalls.planner += 1
          return queryParser(...args)
        },
        generateFinalAnswer: undefined,
        allowFinalAnswerFallback: true,
      })
      let core: Awaited<ReturnType<typeof service.answerQuestion>>
      try {
        core = await service.answerQuestion(body.message, {
          history: body.history,
        })
      } catch (plannerExecutionError) {
        if (fixtureMode.enabled || !allowHeuristicFallback) throw plannerExecutionError
        console.error('[chat.post] planner execution failed; retrying with deterministic parser', plannerExecutionError)
        const fallbackService = createChatService(queryService, {
          parseStructuredQueryFromMessage: async (message) => parseStructuredQueryFromMessageStub(message),
          generateFinalAnswer: undefined,
          allowFinalAnswerFallback: true,
        })
        try {
          core = await fallbackService.answerQuestion(body.message, {
            history: body.history,
          })
        } catch (fallbackError) {
          console.error('[chat.post] deterministic parser recovery failed', {
            plannerExecutionError,
            fallbackError,
          })
          throw fallbackError
        }
      }

      const usage = !isEffectivePro(account) && effectiveBucket
        ? buildFreeUsageInfo(effectiveBucket, usageConfig, now)
        : buildProUsageInfo(now)

      publishOpenAiCallCounts()
      return chatResponseSchema.parse({ error: false, ...core, usage })
    } catch (innerError) {
      await Promise.all(consumedBucketKeys.map((bucketKey) =>
        refundChatUsageToken(metaDatabase, bucketKey, usageConfig, nowSeconds).catch(() => {})))
      throw innerError
    }
  } catch (error) {
    publishOpenAiCallCounts()
    console.error('[chat.post] unhandled error', error)
    if (error instanceof ZodError) {
      throw createPublicApiError(500, 'internal_validation_failed', 'Internal response validation failed', {
        validation: error.flatten(),
      })
    }
    if (error instanceof ChatQueryParserUnavailableError) {
      throw createPublicApiError(503, 'chat_llm_unavailable', error.message)
    }
    if (error instanceof Error && error.message.includes('not set')) {
      throw createPublicApiError(503, 'missing_env', error.message)
    }
    throw error
  }
})
