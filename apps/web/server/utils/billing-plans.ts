import type { ChatPlan } from '@npb/schemas'

export const PRO_PLAN_MONTHLY_PRICE_YEN = 980
export const BILLING_METHOD = 'stripe_subscription' as const

export function getBillingPlanDetails(plan: ChatPlan, capacity = 10, refillIntervalMinutes = 120) {
  return {
    key: plan,
    label: plan === 'pro' ? 'Pro' : 'Free',
    monthlyPriceYen: plan === 'pro' ? PRO_PLAN_MONTHLY_PRICE_YEN : 0,
    currency: 'JPY' as const,
    billingMethod: BILLING_METHOD,
    usageTokenCapacity: plan === 'pro' ? null : capacity,
    usageRefillIntervalMinutes: plan === 'pro' ? null : refillIntervalMinutes,
  }
}

export function listBillingPlans(capacity = 10, refillIntervalMinutes = 120): Array<ReturnType<typeof getBillingPlanDetails>> {
  return [getBillingPlanDetails('free', capacity, refillIntervalMinutes), getBillingPlanDetails('pro', capacity, refillIntervalMinutes)]
}

export type BillingPlanDetails = ReturnType<typeof getBillingPlanDetails>
