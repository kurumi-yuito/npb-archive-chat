import { readBody } from 'h3'
import { ZodError } from 'zod'
import { updateChatAccountProfile } from '@npb/db'
import { chatAccountSchema, updateChatAccountRequestSchema } from '@npb/schemas'
import { resolveChatRuntimeAuthConfig, resolveChatRuntimeStripeBillingConfig, resolveChatRuntimeUsageConfig } from '../utils/chat-runtime-config'
import { buildChatAccountResponse } from '../utils/chat-account-response'
import { parseChatIdentity } from '../utils/parse-chat-identity'
import { createPublicApiError } from '../utils/public-api-error'
import { getServerMetaDatabase } from '../utils/server-database'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  try {
    const authConfig = resolveChatRuntimeAuthConfig(config, event)
    const billingConfig = resolveChatRuntimeStripeBillingConfig(config, event)
    const usageConfig = resolveChatRuntimeUsageConfig(config, event)
    const identity = parseChatIdentity(event, authConfig)
    const database = await getServerMetaDatabase(event, config.npbSqlitePath)
    const body = updateChatAccountRequestSchema.parse(await readBody(event))
    const account = await updateChatAccountProfile(database, identity.userId, body)
    return chatAccountSchema.parse(
      buildChatAccountResponse(account, billingConfig.billingConfigured, authConfig.googleAuthConfigured, usageConfig.capacity, usageConfig.refillIntervalMinutes),
    )
  } catch (error) {
    if (error instanceof ZodError) {
      throw createPublicApiError(400, 'invalid_request', 'Invalid account request', {
        validation: error.flatten(),
      })
    }
    if (error instanceof Error && error.message.includes('not set')) {
      throw createPublicApiError(503, 'missing_env', error.message)
    }
    throw error
  }
})
