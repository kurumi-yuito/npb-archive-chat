import { getChatUsageBucket } from '@npb/db'
import { setResponseHeaders } from 'h3'
import { buildFreeUsageInfo, buildProUsageInfo } from '../../utils/build-chat-usage'
import { resolveChatRuntimeAuthConfig, resolveChatRuntimeStripeBillingConfig, resolveChatRuntimeUsageConfig } from '../../utils/chat-runtime-config'
import { getEffectiveChatAccount, isEffectivePro } from '../../utils/chat-account-response'
import { guestUsageGuardBucketKey } from '../../utils/guest-usage-guard'
import { parseChatIdentity } from '../../utils/parse-chat-identity'
import { createPublicApiError } from '../../utils/public-api-error'
import { getServerMetaDatabase } from '../../utils/server-database'
import { CHAT_USAGE_CACHE_HEADERS } from '../../utils/chat-usage-cache'

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, CHAT_USAGE_CACHE_HEADERS)
  const config = useRuntimeConfig(event)

  try {
    const authConfig = resolveChatRuntimeAuthConfig(config, event)
    const usageConfig = resolveChatRuntimeUsageConfig(config, event)
    const billingConfig = resolveChatRuntimeStripeBillingConfig(config, event)
    const identity = parseChatIdentity(event, authConfig)
    const database = await getServerMetaDatabase(event, config.npbSqlitePath)
    const account = await getEffectiveChatAccount(
      database,
      identity.userId,
      authConfig.defaultPlan ?? 'free',
      billingConfig.billingConfigured,
      authConfig.googleAuthConfigured,
      usageConfig.capacity,
      usageConfig.refillIntervalMinutes,
    )
    const now = new Date()
    const nowSeconds = Math.floor(now.getTime() / 1000)

    if (isEffectivePro(account)) {
      return buildProUsageInfo(now)
    }
    const accountBucket = await getChatUsageBucket(database, `account:${identity.userId}`, usageConfig, nowSeconds)
    if (!identity.guestGuardEligible || !usageConfig.guestGuardEnabled) {
      return buildFreeUsageInfo(accountBucket, usageConfig, now)
    }
    const guardBucket = await getChatUsageBucket(
      database,
      guestUsageGuardBucketKey(event, authConfig.authSharedSecret),
      usageConfig,
      nowSeconds,
    )
    return buildFreeUsageInfo(
      guardBucket.tokens < accountBucket.tokens ? guardBucket : accountBucket,
      usageConfig,
      now,
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('not set')) {
      throw createPublicApiError(503, 'missing_env', error.message)
    }
    throw error
  }
})
