import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mapStripeSubscriptionStatusToBillingStatus, verifyStripeWebhookSignature } from '../server/utils/stripe-billing'

describe('stripe-billing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('verifies Stripe webhook signatures', () => {
    const payload = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' })
    const timestamp = '1710000000'
    const secret = 'whsec_test'
    const digest = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
    const signature = `t=${timestamp},v1=${digest}`

    vi.stubGlobal('Date', {
      now: () => Number(timestamp) * 1000,
    } as typeof Date)

    expect(verifyStripeWebhookSignature(payload, signature, secret)).toBe(true)
    expect(verifyStripeWebhookSignature(payload, signature, 'wrong')).toBe(false)
  })

  it('maps Stripe subscription statuses to billing statuses', () => {
    expect(mapStripeSubscriptionStatusToBillingStatus('active')).toBe('active')
    expect(mapStripeSubscriptionStatusToBillingStatus('trialing')).toBe('trialing')
    expect(mapStripeSubscriptionStatusToBillingStatus('canceled')).toBe('canceled')
    expect(mapStripeSubscriptionStatusToBillingStatus('unexpected')).toBe('incomplete')
  })
})
