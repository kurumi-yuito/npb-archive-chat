import { chatPlanSchema, type ChatPlan } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'

export type ChatAccountRow = {
  userId: string
  email: string | null
  displayName: string | null
  plan: ChatPlan
  billingStatus: 'active' | 'canceled'
  billingProvider: 'internal'
  createdAt: string
  updatedAt: string
}

export type UpdateChatAccountInput = {
  email?: string | null
  displayName?: string | null
}

export async function getOrCreateChatAccount(
  database: QueryDatabase,
  userId: string,
  seedPlan: ChatPlan = 'free',
): Promise<ChatAccountRow> {
  await database
    .prepare(
      `INSERT INTO chat_accounts (user_id, plan, billing_status, billing_provider)
       VALUES (?, ?, 'active', 'internal')
       ON CONFLICT(user_id) DO NOTHING`,
    )
    .run(userId, seedPlan)
  return (await getChatAccount(database, userId))!
}

export async function getChatAccount(
  database: QueryDatabase,
  userId: string,
): Promise<ChatAccountRow | null> {
  const row = await database
    .prepare(
      `SELECT
        user_id AS userId,
        email,
        display_name AS displayName,
        plan,
        billing_status AS billingStatus,
        billing_provider AS billingProvider,
        created_at AS createdAt,
        updated_at AS updatedAt
       FROM chat_accounts
       WHERE user_id = ?`,
    )
    .get(userId) as ChatAccountRow | undefined
  return row ?? null
}

export async function updateChatAccountProfile(
  database: QueryDatabase,
  userId: string,
  input: UpdateChatAccountInput,
): Promise<ChatAccountRow> {
  await getOrCreateChatAccount(database, userId)
  await database
    .prepare(
      `UPDATE chat_accounts
       SET email = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
    )
    .run(normalizeNullable(input.email), normalizeNullable(input.displayName), userId)
  return (await getChatAccount(database, userId))!
}

export async function updateChatAccountPlan(
  database: QueryDatabase,
  userId: string,
  plan: ChatPlan,
): Promise<ChatAccountRow> {
  await getOrCreateChatAccount(database, userId)
  await database
    .prepare(
      `UPDATE chat_accounts
       SET plan = ?, billing_status = 'active', billing_provider = 'internal', updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
    )
    .run(chatPlanSchema.parse(plan), userId)
  return (await getChatAccount(database, userId))!
}

function normalizeNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
