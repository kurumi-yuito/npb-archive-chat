import { readBody } from 'h3'
import { ZodError } from 'zod'
import {
  FREE_CHAT_MONTHLY_LIMIT,
  currentUsageMonthKey,
  getChatUsageCount,
  incrementChatUsageForFreeUser,
} from '@npb/db'
import { chatResponseSchema } from '@npb/schemas'
import { createChatService } from '../services/chat-service'
import {
  createChatFinalAnswerLlm,
  hasChatFinalAnswerLlmConfig,
} from '../services/chat-final-answer-llm'
import { createChatQueryParser } from '../services/chat-query-parser'
import {
  buildFreeUsageInfo,
  buildFreeUsageSnapshot,
  buildProUsageInfo,
} from '../utils/build-chat-usage'
import { resolveChatRuntimeAuthConfig } from '../utils/chat-runtime-config'
import { getEffectiveChatAccount } from '../utils/chat-account-response'
import { parseChatIdentity } from '../utils/parse-chat-identity'
import { parseChatRequestBody } from '../utils/parse-chat-request'
import { createPublicApiError } from '../utils/public-api-error'
import { getServerChatQueryService, getServerDatabase } from '../utils/server-database'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  try {
    const authConfig = resolveChatRuntimeAuthConfig(config)
    const identity = parseChatIdentity(event, authConfig)
    const database = await getServerDatabase(event, config.npbSqlitePath)
    const account = await getEffectiveChatAccount(database, identity.userId, authConfig.defaultPlan ?? 'free', authConfig.billingConfigured)
    const month = currentUsageMonthKey()

    if (account.plan === 'free') {
      const used = await getChatUsageCount(database, identity.userId, month)
      if (used >= FREE_CHAT_MONTHLY_LIMIT) {
        throw createPublicApiError(429, 'usage_limit_exceeded', 'Monthly chat limit reached for free plan', {
          usage: buildFreeUsageSnapshot(month, used),
        })
      }
    }

    const body = parseChatRequestBody(await readBody(event))
    const queryService = await getServerChatQueryService(
      event,
      String(config.npbSqlitePath ?? ''),
      typeof config.npbSqliteDir === 'string' ? config.npbSqliteDir : '',
    )
    const service = createChatService(queryService, {
      parseStructuredQueryFromMessage: createChatQueryParser({
        baseUrl: config.chatQueryLlmBaseUrl,
        apiKey: config.chatQueryLlmApiKey,
        model: config.chatQueryLlmModel,
      }),
      generateFinalAnswer: hasChatFinalAnswerLlmConfig({
        baseUrl: config.chatAnswerLlmBaseUrl,
        apiKey: config.chatAnswerLlmApiKey,
        model: config.chatAnswerLlmModel,
      })
        ? createChatFinalAnswerLlm({
            baseUrl: config.chatAnswerLlmBaseUrl,
            apiKey: config.chatAnswerLlmApiKey,
            model: config.chatAnswerLlmModel,
          })
        : undefined,
    })
    const core = await service.answerQuestion(body.message)

    const usage =
      account.plan === 'free'
        ? await (async () => {
            await incrementChatUsageForFreeUser(database, identity.userId, month)
            const after = await getChatUsageCount(database, identity.userId, month)
            return buildFreeUsageInfo(month, after)
          })()
        : buildProUsageInfo(month)

    return chatResponseSchema.parse({ ...core, usage })
  } catch (error) {
    if (error instanceof ZodError) {
      throw createPublicApiError(400, 'invalid_request', 'Invalid chat request', {
        validation: error.flatten(),
      })
    }
    if (error instanceof Error && error.message.includes('not set')) {
      throw createPublicApiError(503, 'missing_env', error.message)
    }
    throw error
  }
})
