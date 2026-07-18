import { getHeader, readBody } from 'h3'
import { ZodError } from 'zod'
import {
  consumeChatUsageForFreeUser,
  currentUsageMonthKey,
  getChatUsageCount,
  refundChatUsageForFreeUser,
} from '@npb/db'
import { chatResponseSchema } from '@npb/schemas'
import { createChatService } from '../services/chat-service'
import {
  createChatFinalAnswerLlm,
  hasChatFinalAnswerLlmConfig,
} from '../services/chat-final-answer-llm'
import {
  ChatQueryParserUnavailableError,
  createChatQueryParser,
} from '../services/chat-query-parser'
import {
  buildFreeUsageInfo,
  buildFreeUsageSnapshot,
  buildProUsageInfo,
} from '../utils/build-chat-usage'
import {
  parseBoolean,
  resolveChatRuntimeAuthConfig,
  resolveChatRuntimeStripeBillingConfig,
} from '../utils/chat-runtime-config'
import { getEffectiveChatAccount, isEffectivePro } from '../utils/chat-account-response'
import { parseChatIdentity } from '../utils/parse-chat-identity'
import { parseChatRequestBody } from '../utils/parse-chat-request'
import { createPublicApiError } from '../utils/public-api-error'
import { resolveQaFixtureMode } from '../utils/qa-fixture-mode'
import { getServerChatQueryService, getServerMetaDatabase } from '../utils/server-database'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
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
    const billingConfig = resolveChatRuntimeStripeBillingConfig(config, event)
    const identity = parseChatIdentity(event, authConfig)
    const metaDatabase = await getServerMetaDatabase(event, config.npbSqlitePath)
    const account = await getEffectiveChatAccount(
      metaDatabase,
      identity.userId,
      authConfig.defaultPlan ?? 'free',
      billingConfig.billingConfigured,
      authConfig.googleAuthConfigured,
    )
    const month = currentUsageMonthKey()

    let freeUserCreditConsumed = false
    if (!isEffectivePro(account)) {
      const consumed = await consumeChatUsageForFreeUser(metaDatabase, identity.userId, month)
      if (!consumed) {
        const used = await getChatUsageCount(metaDatabase, identity.userId, month)
        throw createPublicApiError(429, 'usage_limit_exceeded', 'Monthly chat limit reached for free plan', {
          usage: buildFreeUsageSnapshot(month, used),
        })
      }
      freeUserCreditConsumed = true
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
      const chatAnswerLlmConfig = {
        baseUrl:
          typeof cloudflareEnv?.CHAT_ANSWER_LLM_BASE_URL === 'string'
            ? cloudflareEnv.CHAT_ANSWER_LLM_BASE_URL
            : config.chatAnswerLlmBaseUrl,
        apiKey:
          typeof cloudflareEnv?.CHAT_ANSWER_LLM_API_KEY === 'string'
            ? cloudflareEnv.CHAT_ANSWER_LLM_API_KEY
            : config.chatAnswerLlmApiKey,
        model:
          typeof cloudflareEnv?.CHAT_ANSWER_LLM_MODEL === 'string'
            ? cloudflareEnv.CHAT_ANSWER_LLM_MODEL
            : config.chatAnswerLlmModel,
      }
      const allowHeuristicFallback = parseBoolean(
        typeof cloudflareEnv?.CHAT_ALLOW_HEURISTIC_FALLBACK === 'string'
          ? cloudflareEnv.CHAT_ALLOW_HEURISTIC_FALLBACK
          : config.chatAllowHeuristicFallback,
      )
      const allowDeterministicAnswerFallback = parseBoolean(
        typeof cloudflareEnv?.CHAT_ALLOW_DETERMINISTIC_ANSWER_FALLBACK === 'string'
          ? cloudflareEnv.CHAT_ALLOW_DETERMINISTIC_ANSWER_FALLBACK
          : config.chatAllowDeterministicAnswerFallback,
      )
      const finalAnswerGenerator = hasChatFinalAnswerLlmConfig(chatAnswerLlmConfig)
        ? createChatFinalAnswerLlm({
            baseUrl: chatAnswerLlmConfig.baseUrl,
            apiKey: chatAnswerLlmConfig.apiKey,
            model: chatAnswerLlmConfig.model,
          })
        : undefined
      if (!fixtureMode.enabled && !finalAnswerGenerator && !allowDeterministicAnswerFallback) {
        throw createPublicApiError(
          503,
          'chat_llm_unavailable',
          'CHAT_ANSWER_LLM_API_KEY and CHAT_ANSWER_LLM_MODEL must be set',
        )
      }
      const queryService = await getServerChatQueryService(
        event,
        String(config.npbSqlitePath ?? ''),
        typeof config.npbSqliteDir === 'string' ? config.npbSqliteDir : '',
      )
      const service = createChatService(queryService, {
        parseStructuredQueryFromMessage: fixtureMode.enabled
          ? async () => body.fixture_structured_query!
          : createChatQueryParser({
              baseUrl: chatQueryLlmConfig.baseUrl,
              apiKey: chatQueryLlmConfig.apiKey,
              model: chatQueryLlmConfig.model,
            }, {
              allowFallback: allowHeuristicFallback,
            }),
        generateFinalAnswer: fixtureMode.enabled ? undefined : finalAnswerGenerator,
        allowFinalAnswerFallback: fixtureMode.enabled ? true : allowDeterministicAnswerFallback,
      })
      const core = await service.answerQuestion(body.message, {
        history: body.history,
      })

      const usage = !isEffectivePro(account)
        ? await (async () => {
            // Usage was already incremented atomically before the LLM call.
            const after = await getChatUsageCount(metaDatabase, identity.userId, month)
            return buildFreeUsageInfo(month, after)
          })()
        : buildProUsageInfo(month)

      return chatResponseSchema.parse({ ...core, usage })
    } catch (innerError) {
      if (freeUserCreditConsumed) {
        await refundChatUsageForFreeUser(metaDatabase, identity.userId, month).catch(() => {})
      }
      throw innerError
    }
  } catch (error) {
    console.error('[chat.post] unhandled error', error)
    if (error instanceof ZodError) {
      throw createPublicApiError(500, 'internal_validation_failed', 'Internal response validation failed', {
        validation: error.flatten(),
      })
    }
    if (error instanceof ChatQueryParserUnavailableError) {
      throw createPublicApiError(503, 'chat_llm_unavailable', error.message)
    }
    if (error instanceof Error && error.message.includes('CHAT_ANSWER_LLM')) {
      throw createPublicApiError(503, 'chat_llm_unavailable', error.message)
    }
    if (error instanceof Error && error.message.includes('not set')) {
      throw createPublicApiError(503, 'missing_env', error.message)
    }
    throw error
  }
})
