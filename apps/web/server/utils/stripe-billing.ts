import { createHmac, timingSafeEqual } from 'node:crypto'
import type { ChatPlan } from '@npb/schemas'
import type {
  ChatRuntimeStripeBillingConfig,
} from './chat-runtime-config'

type StripeFormValue = string | number | boolean | null | undefined

type StripeRequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: Record<string, StripeFormValue>
}

type StripeErrorResponse = {
  error?: {
    message?: string
    type?: string
  }
}

export type StripeCheckoutSessionResult = {
  id: string
  url: string
  customer: string | null
  subscription: string | null
  customer_email: string | null
}

export type StripePortalSessionResult = {
  id: string
  url: string
  customer: string
}

export type StripeCheckoutSessionWebhook = {
  id: string
  object: 'checkout.session'
  customer: string | null
  subscription: string | null
  customer_details?: { email?: string | null; name?: string | null } | null
  metadata?: Record<string, string>
}

export type StripeSubscriptionWebhook = {
  id: string
  object: 'subscription'
  customer: string
  status: string
  priceId?: string | null
  metadata?: Record<string, string>
}

const STRIPE_API_BASE = 'https://api.stripe.com/v1'
const WEBHOOK_SKEW_SECONDS = 300

export async function createStripeCheckoutSession(
  config: ChatRuntimeStripeBillingConfig,
  input: {
    userId: string
    email: string | null
    displayName: string | null
  },
): Promise<StripeCheckoutSessionResult> {
  const body: Record<string, StripeFormValue> = {
    mode: 'subscription',
    success_url: config.successUrl,
    cancel_url: config.cancelUrl,
    'line_items[0][price]': config.proPriceId,
    'line_items[0][quantity]': 1,
    'client_reference_id': input.userId,
    'metadata[user_id]': input.userId,
    'metadata[plan]': 'pro',
    'subscription_data[metadata][user_id]': input.userId,
    'subscription_data[metadata][plan]': 'pro',
  }
  if (input.email) {
    body.customer_email = input.email
  }

  return await stripeRequest(config, '/checkout/sessions', {
    method: 'POST',
    body,
  })
}

export async function createStripePortalSession(
  config: ChatRuntimeStripeBillingConfig,
  input: {
    customerId: string
  },
): Promise<StripePortalSessionResult> {
  return await stripeRequest(config, '/billing_portal/sessions', {
    method: 'POST',
    body: {
      customer: input.customerId,
      return_url: config.portalReturnUrl,
    },
  })
}

export async function retrieveStripeSubscription(
  config: ChatRuntimeStripeBillingConfig,
  subscriptionId: string,
): Promise<StripeSubscriptionWebhook> {
  return await stripeRequest(config, `/subscriptions/${subscriptionId}`, { method: 'GET' })
}

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const parts = signatureHeader.split(',').map((part) => part.trim())
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2)
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3))
    .filter(Boolean)

  if (!timestamp || signatures.length === 0) return false
  const timestampNumber = Number(timestamp)
  if (!Number.isFinite(timestampNumber)) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > WEBHOOK_SKEW_SECONDS) return false

  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  return signatures.some((signature) => {
    try {
      const actualBuffer = Buffer.from(signature, 'hex')
      return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
    } catch {
      return false
    }
  })
}

export function mapStripeSubscriptionStatusToBillingStatus(status: string): 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused' {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
    case 'incomplete':
    case 'incomplete_expired':
    case 'unpaid':
    case 'paused':
      return status
    default:
      return 'incomplete'
  }
}

async function stripeRequest<T = unknown>(
  config: ChatRuntimeStripeBillingConfig,
  path: string,
  options: StripeRequestOptions = {},
): Promise<T> {
  const url = `${STRIPE_API_BASE}${path}`
  const headers = new Headers({
    Authorization: `Bearer ${config.secretKey}`,
  })
  let body: string | undefined
  if (options.body) {
    headers.set('Content-Type', 'application/x-www-form-urlencoded')
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(options.body)) {
      if (value === undefined || value === null) continue
      params.set(key, String(value))
    }
    body = params.toString()
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body,
  })

  const text = await response.text()
  if (!response.ok) {
    const parsed = safeParseJson<StripeErrorResponse>(text)
    throw new Error(parsed?.error?.message ?? `Stripe API error (${response.status})`)
  }
  return safeParseJson<T>(text) ?? ({} as T)
}

function safeParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function normalizeStripeSubscriptionPriceId(subscription: StripeSubscriptionWebhook): string | null {
  return subscription.priceId ?? subscription.metadata?.price_id ?? null
}

export function isStripeBillingStatusActive(status: string): boolean {
  return status === 'active' || status === 'trialing'
}

export function isStripeBillingConfigured(config: ChatRuntimeStripeBillingConfig): boolean {
  return config.billingConfigured
}

export function getBillingPlanMethod(): 'stripe_subscription' {
  return 'stripe_subscription'
}

export function getBillingProvider(): 'stripe' {
  return 'stripe'
}

export function getStripePlanKey(plan: ChatPlan): ChatPlan {
  return plan
}
