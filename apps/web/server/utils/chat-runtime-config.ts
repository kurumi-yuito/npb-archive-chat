import { chatPlanSchema, type ChatPlan } from '@npb/schemas'

export type ChatRuntimeAuthConfig = {
  allowHeaderFallback: boolean
  authSharedSecret: string
  billingConfigured: boolean
  defaultPlan: ChatPlan
}

export function resolveChatRuntimeAuthConfig(config: {
  npbAuthHeaderFallback?: unknown
  npbAuthSharedSecret?: unknown
  npbBillingConfigured?: unknown
  npbDefaultPlan?: unknown
}): ChatRuntimeAuthConfig {
  return {
    allowHeaderFallback: parseBoolean(config.npbAuthHeaderFallback),
    authSharedSecret: typeof config.npbAuthSharedSecret === 'string' ? config.npbAuthSharedSecret : '',
    billingConfigured: parseBoolean(config.npbBillingConfigured),
    defaultPlan: chatPlanSchema.catch('free').parse(config.npbDefaultPlan),
  }
}

export function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}
