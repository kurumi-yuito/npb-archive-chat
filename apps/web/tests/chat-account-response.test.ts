import { describe, expect, it } from 'vitest'
import { isEffectivePro } from '../server/utils/chat-account-response'

describe('isEffectivePro', () => {
  it('plan=pro + billing_status=active → pro access', () => {
    expect(isEffectivePro({ plan: 'pro', billingStatus: 'active' })).toBe(true)
  })

  it('plan=pro + billing_status=trialing → pro access', () => {
    expect(isEffectivePro({ plan: 'pro', billingStatus: 'trialing' })).toBe(true)
  })

  it('plan=pro + billing_status=past_due → free (enforce limits)', () => {
    expect(isEffectivePro({ plan: 'pro', billingStatus: 'past_due' })).toBe(false)
  })

  it('plan=pro + billing_status=unpaid → free (enforce limits)', () => {
    expect(isEffectivePro({ plan: 'pro', billingStatus: 'unpaid' })).toBe(false)
  })

  it('plan=pro + billing_status=paused → free (enforce limits)', () => {
    expect(isEffectivePro({ plan: 'pro', billingStatus: 'paused' })).toBe(false)
  })

  it('plan=pro + billing_status=canceled → free (enforce limits)', () => {
    expect(isEffectivePro({ plan: 'pro', billingStatus: 'canceled' })).toBe(false)
  })

  it('plan=pro + billing_status=incomplete → free (enforce limits)', () => {
    expect(isEffectivePro({ plan: 'pro', billingStatus: 'incomplete' })).toBe(false)
  })

  it('plan=free + billing_status=active → free (plan overrides)', () => {
    expect(isEffectivePro({ plan: 'free', billingStatus: 'active' })).toBe(false)
  })
})
