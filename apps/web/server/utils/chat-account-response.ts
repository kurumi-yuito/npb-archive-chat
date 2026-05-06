import type { ChatAccount, ChatPlan } from '@npb/schemas'
import type { ChatAccountRow, QueryDatabase } from '@npb/db'
import { getOrCreateChatAccount } from '@npb/db'

export async function getEffectiveChatAccount(
  database: QueryDatabase,
  userId: string,
  seedPlan: ChatPlan,
  billingConfigured: boolean,
): Promise<ChatAccount> {
  return buildChatAccountResponse(
    await getOrCreateChatAccount(database, userId, seedPlan),
    billingConfigured,
  )
}

export function buildChatAccountResponse(
  row: ChatAccountRow,
  billingConfigured: boolean,
): ChatAccount {
  return {
    userId: row.userId,
    email: row.email,
    displayName: row.displayName,
    plan: row.plan,
    billingStatus: row.billingStatus,
    billingProvider: row.billingProvider,
    billingConfigured,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
