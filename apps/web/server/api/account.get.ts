import { chatAccountSchema } from '@npb/schemas'
import { resolveChatRuntimeAuthConfig, resolveChatRuntimeStripeBillingConfig } from '../utils/chat-runtime-config'
import { getEffectiveChatAccount } from '../utils/chat-account-response'
import { parseChatIdentity } from '../utils/parse-chat-identity'
import { createPublicApiError } from '../utils/public-api-error'
import { getServerMetaDatabase } from '../utils/server-database'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  try {
    const authConfig = resolveChatRuntimeAuthConfig(config, event)
    const billingConfig = resolveChatRuntimeStripeBillingConfig(config, event)
    const identity = parseChatIdentity(event, authConfig)
    const database = await getServerMetaDatabase(event, config.npbSqlitePath)
    return chatAccountSchema.parse(
      await getEffectiveChatAccount(
        database,
        identity.userId,
        authConfig.defaultPlan ?? 'free',
        billingConfig.billingConfigured,
        authConfig.googleAuthConfigured,
      ),
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('not set')) {
      throw createPublicApiError(503, 'missing_env', error.message)
    }
    throw error
  }
})
