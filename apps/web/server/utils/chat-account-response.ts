import type { ChatAccount, ChatPlan } from '@npb/schemas'
import type { ChatAccountRow, QueryDatabase } from '@npb/db'
import { getOrCreateChatAccount } from '@npb/db'
import { getBillingPlanDetails } from './billing-plans'

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
