import { listBillingPlans } from '../../utils/billing-plans'
import { resolveChatRuntimeUsageConfig } from '../../utils/chat-runtime-config'

export default defineEventHandler(async (event) => {
  const usage = resolveChatRuntimeUsageConfig(useRuntimeConfig(event), event)
  return listBillingPlans(usage.capacity, usage.refillIntervalMinutes)
})
