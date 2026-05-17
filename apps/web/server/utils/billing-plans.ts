import type { ChatPlan } from '@npb/schemas'
import { FREE_CHAT_MONTHLY_LIMIT } from '@npb/db'

export const PRO_PLAN_MONTHLY_PRICE_YEN = 980
export const BILLING_METHOD = 'stripe_subscription' as const

export function getBillingPlanDetails(plan: ChatPlan) {
  return {
    key: plan,
    label: plan === 'pro' ? 'Pro' : 'Free',
    monthlyPriceYen: plan === 'pro' ? PRO_PLAN_MONTHLY_PRICE_YEN : 0,
    currency: 'JPY' as const,
    billingMethod: BILLING_METHOD,
    monthlyUsageLimit: plan === 'pro' ? null : FREE_CHAT_MONTHLY_LIMIT,
  }
}

export function listBillingPlans(): Array<ReturnType<typeof getBillingPlanDetails>> {
  return [getBillingPlanDetails('free'), getBillingPlanDetails('pro')]
}

export type BillingPlanDetails = ReturnType<typeof getBillingPlanDetails>
