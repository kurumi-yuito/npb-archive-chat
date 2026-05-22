import type { ChatAccount, ChatPlan } from '@npb/schemas'
import type { ChatAccountRow, QueryDatabase } from '@npb/db'
import { getOrCreateChatAccount } from '@npb/db'
import { getBillingPlanDetails } from './billing-plans'

const PRO_ACTIVE_BILLING_STATUSES = ['active', 'trialing'] as const

/** Returns true only when plan=pro AND billing is in an active state. */
export function isEffectivePro(account: Pick<ChatAccount, 'plan' | 'billingStatus'>): boolean {
  if (account.plan !== 'pro') return false
  return (PRO_ACTIVE_BILLING_STATUSES as readonly string[]).includes(account.billingStatus)
}

export async function getEffectiveChatAccount(
  database: QueryDatabase,
  userId: string,
  seedPlan: ChatPlan,
  billingConfigured: boolean,
  googleAuthConfigured = false,
): Promise<ChatAccount> {
  return buildChatAccountResponse(
    await getOrCreateChatAccount(database, userId, seedPlan),
    billingConfigured,
    googleAuthConfigured,
  )
}

export function buildChatAccountResponse(
  row: ChatAccountRow,
  billingConfigured: boolean,
  googleAuthConfigured = false,
): ChatAccount {
  return {
    userId: row.userId,
    authProvider: row.authProvider,
    authEmailVerified: Boolean(row.authEmailVerified),
    email: row.email,
    displayName: row.displayName,
    plan: row.plan,
    billingStatus: row.billingStatus,
    billingProvider: row.billingProvider,
    billingConfigured,
    googleAuthConfigured,
    billingPlan: getBillingPlanDetails(row.plan),
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
