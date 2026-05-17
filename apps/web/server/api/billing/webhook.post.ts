import { readRawBody, getRequestHeader } from 'h3'
import { updateChatAccountBillingState } from '@npb/db'
import { createPublicApiError } from '../../utils/public-api-error'
import { resolveChatRuntimeStripeBillingConfig } from '../../utils/chat-runtime-config'
import {
  isStripeBillingConfigured,
  mapStripeSubscriptionStatusToBillingStatus,
  verifyStripeWebhookSignature,
} from '../../utils/stripe-billing'
import { getServerMetaDatabase } from '../../utils/server-database'

type StripeWebhookEvent =
  | {
      type: 'checkout.session.completed'
      data: {
        object: {
          customer: string | null
          subscription: string | null
          metadata?: Record<string, string>
        }
      }
    }
  | {
      type: 'customer.subscription.created' | 'customer.subscription.updated' | 'customer.subscription.deleted'
      data: {
        object: {
          id: string
          customer: string
          status: string
          metadata?: Record<string, string>
        }
      }
    }

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const billingConfig = resolveChatRuntimeStripeBillingConfig(config, event)

  if (!isStripeBillingConfigured(billingConfig)) {
    throw createPublicApiError(503, 'missing_env', 'Stripe billing is not configured')
  }

  const signature = getRequestHeader(event, 'stripe-signature')
  const payload = await readRawBody(event)
  if (!signature || !payload) {
    throw createPublicApiError(400, 'invalid_request', 'Missing Stripe signature or payload')
  }
  if (!verifyStripeWebhookSignature(payload, signature, billingConfig.webhookSecret)) {
    throw createPublicApiError(400, 'invalid_signature', 'Invalid Stripe webhook signature')
  }

  const parsed = JSON.parse(payload) as StripeWebhookEvent
  const database = await getServerMetaDatabase(event, config.npbSqlitePath)

  if (parsed.type === 'checkout.session.completed') {
    const userId = parsed.data.object.metadata?.user_id
    if (!userId) {
      return { received: true }
    }
    await updateChatAccountBillingState(database, userId, {
      plan: 'pro',
      billingStatus: 'active',
      billingProvider: 'stripe',
      stripeCustomerId: parsed.data.object.customer,
      stripeSubscriptionId: parsed.data.object.subscription,
      stripePriceId: billingConfig.proPriceId,
      stripeCheckoutSessionId: null,
    })
    return {
      received: true,
      account: userId,
    }
  }

  if (
    parsed.type === 'customer.subscription.created' ||
    parsed.type === 'customer.subscription.updated' ||
    parsed.type === 'customer.subscription.deleted'
  ) {
    const userId = parsed.data.object.metadata?.user_id
    if (!userId) {
      return { received: true }
    }

    const isDeleted = parsed.type === 'customer.subscription.deleted'
    const billingStatus = isDeleted
      ? 'canceled'
      : mapStripeSubscriptionStatusToBillingStatus(parsed.data.object.status)
    await updateChatAccountBillingState(database, userId, {
      plan: isDeleted ? 'free' : 'pro',
      billingStatus,
      billingProvider: 'stripe',
      stripeCustomerId: parsed.data.object.customer,
      stripeSubscriptionId: parsed.data.object.id,
      stripePriceId: billingConfig.proPriceId,
    })
    return { received: true }
  }

  return { received: true }
})
