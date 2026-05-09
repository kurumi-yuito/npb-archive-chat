import { chatPlanSchema, type ChatPlan } from '@npb/schemas'
import type { H3Event } from 'h3'

export type ChatRuntimeAuthConfig = {
  allowHeaderFallback: boolean
  authSharedSecret: string
  billingConfigured: boolean
  defaultPlan: ChatPlan
}

type ChatRuntimeConfigSource = {
  npbAuthHeaderFallback?: unknown
  npbAuthSharedSecret?: unknown
  npbBillingConfigured?: unknown
  npbDefaultPlan?: unknown
}

type CloudflareRuntimeEnv = {
  NPB_AUTH_HEADER_FALLBACK?: unknown
  NPB_AUTH_SHARED_SECRET?: unknown
  NPB_BILLING_CONFIGURED?: unknown
  NPB_DEFAULT_PLAN?: unknown
  CHAT_QUERY_LLM_BASE_URL?: unknown
  CHAT_QUERY_LLM_API_KEY?: unknown
  CHAT_QUERY_LLM_MODEL?: unknown
  CHAT_ANSWER_LLM_BASE_URL?: unknown
  CHAT_ANSWER_LLM_API_KEY?: unknown
  CHAT_ANSWER_LLM_MODEL?: unknown
}

type ChatRuntimeConfigEvent = H3Event & {
  context?: {
    cloudflare?: {
      env?: CloudflareRuntimeEnv
    }
  }
}

export function resolveChatRuntimeAuthConfig(
  config: ChatRuntimeConfigSource,
  event?: ChatRuntimeConfigEvent,
): ChatRuntimeAuthConfig {
  const env = event?.context.cloudflare?.env
  return {
    allowHeaderFallback: parseBoolean(env?.NPB_AUTH_HEADER_FALLBACK ?? config.npbAuthHeaderFallback),
    authSharedSecret:
      typeof env?.NPB_AUTH_SHARED_SECRET === 'string'
        ? env.NPB_AUTH_SHARED_SECRET
        : typeof config.npbAuthSharedSecret === 'string'
          ? config.npbAuthSharedSecret
          : '',
    billingConfigured: parseBoolean(env?.NPB_BILLING_CONFIGURED ?? config.npbBillingConfigured),
    defaultPlan: chatPlanSchema.catch('free').parse(env?.NPB_DEFAULT_PLAN ?? config.npbDefaultPlan),
  }
}

export function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}
