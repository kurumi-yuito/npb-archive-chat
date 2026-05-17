import { chatPlanSchema, type ChatPlan } from '@npb/schemas'
import type { H3Event } from 'h3'

export type ChatRuntimeAuthConfig = {
  allowHeaderFallback: boolean
  authSharedSecret: string
  defaultPlan: ChatPlan
  googleClientId: string
  googleClientSecret: string
  googleRedirectUrl: string
  googleAuthConfigured: boolean
}

export type ChatRuntimeStripeBillingConfig = {
  billingConfigured: boolean
  secretKey: string
  webhookSecret: string
  proPriceId: string
  successUrl: string
  cancelUrl: string
  portalReturnUrl: string
}

type ChatRuntimeConfigSource = {
  npbAuthHeaderFallback?: unknown
  npbAuthSharedSecret?: unknown
  npbDefaultPlan?: unknown
  npbGoogleClientId?: unknown
  npbGoogleClientSecret?: unknown
  npbGoogleRedirectUrl?: unknown
  npbStripeSecretKey?: unknown
  npbStripeWebhookSecret?: unknown
  npbStripeProPriceId?: unknown
  npbStripeCheckoutSuccessUrl?: unknown
  npbStripeCheckoutCancelUrl?: unknown
  npbStripePortalReturnUrl?: unknown
}

type CloudflareRuntimeEnv = {
  NPB_AUTH_HEADER_FALLBACK?: unknown
  NPB_AUTH_SHARED_SECRET?: unknown
  NPB_DEFAULT_PLAN?: unknown
  NPB_GOOGLE_CLIENT_ID?: unknown
  NPB_GOOGLE_CLIENT_SECRET?: unknown
  NPB_GOOGLE_REDIRECT_URL?: unknown
  NPB_STRIPE_SECRET_KEY?: unknown
  NPB_STRIPE_WEBHOOK_SECRET?: unknown
  NPB_STRIPE_PRO_PRICE_ID?: unknown
  NPB_STRIPE_CHECKOUT_SUCCESS_URL?: unknown
  NPB_STRIPE_CHECKOUT_CANCEL_URL?: unknown
  NPB_STRIPE_PORTAL_RETURN_URL?: unknown
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
  const googleClientId = stringValue(env?.NPB_GOOGLE_CLIENT_ID ?? config.npbGoogleClientId)
  const googleClientSecret = stringValue(env?.NPB_GOOGLE_CLIENT_SECRET ?? config.npbGoogleClientSecret)
  const googleRedirectUrl = stringValue(env?.NPB_GOOGLE_REDIRECT_URL ?? config.npbGoogleRedirectUrl)
  return {
    allowHeaderFallback: parseBoolean(env?.NPB_AUTH_HEADER_FALLBACK ?? config.npbAuthHeaderFallback),
    authSharedSecret:
      typeof env?.NPB_AUTH_SHARED_SECRET === 'string'
        ? env.NPB_AUTH_SHARED_SECRET
        : typeof config.npbAuthSharedSecret === 'string'
          ? config.npbAuthSharedSecret
          : '',
    defaultPlan: chatPlanSchema.catch('free').parse(env?.NPB_DEFAULT_PLAN ?? config.npbDefaultPlan),
    googleClientId,
    googleClientSecret,
    googleRedirectUrl,
    googleAuthConfigured: Boolean(googleClientId && googleClientSecret),
  }
}

export function resolveChatRuntimeStripeBillingConfig(
  config: ChatRuntimeConfigSource,
  event?: ChatRuntimeConfigEvent,
): ChatRuntimeStripeBillingConfig {
  const env = event?.context.cloudflare?.env
  const secretKey =
    typeof env?.NPB_STRIPE_SECRET_KEY === 'string'
      ? env.NPB_STRIPE_SECRET_KEY
      : typeof config.npbStripeSecretKey === 'string'
        ? config.npbStripeSecretKey
        : ''
  const webhookSecret =
    typeof env?.NPB_STRIPE_WEBHOOK_SECRET === 'string'
      ? env.NPB_STRIPE_WEBHOOK_SECRET
      : typeof config.npbStripeWebhookSecret === 'string'
        ? config.npbStripeWebhookSecret
        : ''
  const proPriceId =
    typeof env?.NPB_STRIPE_PRO_PRICE_ID === 'string'
      ? env.NPB_STRIPE_PRO_PRICE_ID
      : typeof config.npbStripeProPriceId === 'string'
        ? config.npbStripeProPriceId
        : ''
  const successUrl =
    typeof env?.NPB_STRIPE_CHECKOUT_SUCCESS_URL === 'string'
      ? env.NPB_STRIPE_CHECKOUT_SUCCESS_URL
      : typeof config.npbStripeCheckoutSuccessUrl === 'string'
        ? config.npbStripeCheckoutSuccessUrl
        : ''
  const cancelUrl =
    typeof env?.NPB_STRIPE_CHECKOUT_CANCEL_URL === 'string'
      ? env.NPB_STRIPE_CHECKOUT_CANCEL_URL
      : typeof config.npbStripeCheckoutCancelUrl === 'string'
        ? config.npbStripeCheckoutCancelUrl
        : ''
  const portalReturnUrl =
    typeof env?.NPB_STRIPE_PORTAL_RETURN_URL === 'string'
      ? env.NPB_STRIPE_PORTAL_RETURN_URL
      : typeof config.npbStripePortalReturnUrl === 'string'
        ? config.npbStripePortalReturnUrl
        : ''

  return {
    billingConfigured: Boolean(secretKey && webhookSecret && proPriceId && successUrl && cancelUrl && portalReturnUrl),
    secretKey,
    webhookSecret,
    proPriceId,
    successUrl,
    cancelUrl,
    portalReturnUrl,
  }
}

export function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
