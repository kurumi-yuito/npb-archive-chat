import { currentUsageMonthKey, getChatUsageCount } from '@npb/db'
import { buildFreeUsageSnapshot, buildProUsageInfo } from '../../utils/build-chat-usage'
import { resolveChatRuntimeAuthConfig, resolveChatRuntimeStripeBillingConfig } from '../../utils/chat-runtime-config'
import { getEffectiveChatAccount } from '../../utils/chat-account-response'
import { parseChatIdentity } from '../../utils/parse-chat-identity'
import { createPublicApiError } from '../../utils/public-api-error'
import { getServerMetaDatabase } from '../../utils/server-database'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  try {
    const authConfig = resolveChatRuntimeAuthConfig(config, event)
    const billingConfig = resolveChatRuntimeStripeBillingConfig(config, event)
    const identity = parseChatIdentity(event, authConfig)
    const database = await getServerMetaDatabase(event, config.npbSqlitePath)
    const account = await getEffectiveChatAccount(
      database,
      identity.userId,
      authConfig.defaultPlan ?? 'free',
      billingConfig.billingConfigured,
      authConfig.googleAuthConfigured,
    )
    const month = currentUsageMonthKey()

    if (account.plan === 'pro') {
      return buildProUsageInfo(month)
    }

    const used = await getChatUsageCount(database, identity.userId, month)
    return buildFreeUsageSnapshot(month, used)
  } catch (error) {
    if (error instanceof Error && error.message.includes('not set')) {
      throw createPublicApiError(503, 'missing_env', error.message)
    }
    throw error
  }
})
