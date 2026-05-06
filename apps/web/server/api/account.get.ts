import { chatAccountSchema } from '@npb/schemas'
import { resolveChatRuntimeAuthConfig } from '../utils/chat-runtime-config'
import { getEffectiveChatAccount } from '../utils/chat-account-response'
import { parseChatIdentity } from '../utils/parse-chat-identity'
import { createPublicApiError } from '../utils/public-api-error'
import { getServerDatabase } from '../utils/server-database'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  try {
    const authConfig = resolveChatRuntimeAuthConfig(config)
    const identity = parseChatIdentity(event, authConfig)
    const database = await getServerDatabase(event, config.npbSqlitePath)
    return chatAccountSchema.parse(
      await getEffectiveChatAccount(database, identity.userId, authConfig.defaultPlan ?? 'free', authConfig.billingConfigured),
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('not set')) {
      throw createPublicApiError(503, 'missing_env', error.message)
    }
    throw error
  }
})
