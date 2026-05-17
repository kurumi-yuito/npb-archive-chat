import { chatPlanSchema, type ChatPlan } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'

export type ChatAccountRow = {
  userId: string
  email: string | null
  displayName: string | null
  plan: ChatPlan
  billingStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused'
  billingProvider: 'stripe'
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  stripePriceId: string | null
  stripeCheckoutSessionId: string | null
  createdAt: string
  updatedAt: string
}

export type UpdateChatAccountInput = {
  email?: string | null
  displayName?: string | null
}

export type UpdateChatAccountBillingInput = {
  plan?: ChatPlan
  billingStatus?: ChatAccountRow['billingStatus']
  billingProvider?: ChatAccountRow['billingProvider']
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  stripePriceId?: string | null
  stripeCheckoutSessionId?: string | null
}

export async function getOrCreateChatAccount(
  database: QueryDatabase,
  userId: string,
  seedPlan: ChatPlan = 'free',
): Promise<ChatAccountRow> {
  await database
    .prepare(
      `INSERT INTO chat_accounts (
        user_id,
        plan,
        billing_status,
        billing_provider,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_price_id,
        stripe_checkout_session_id
      )
       VALUES (?, ?, 'active', 'stripe', NULL, NULL, NULL, NULL)
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
        stripe_customer_id AS stripeCustomerId,
        stripe_subscription_id AS stripeSubscriptionId,
        stripe_price_id AS stripePriceId,
        stripe_checkout_session_id AS stripeCheckoutSessionId,
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
  return updateChatAccountBillingState(database, userId, {
    plan: chatPlanSchema.parse(plan),
    billingStatus: 'active',
    billingProvider: 'stripe',
  })
}

export async function updateChatAccountBillingState(
  database: QueryDatabase,
  userId: string,
  input: UpdateChatAccountBillingInput,
): Promise<ChatAccountRow> {
  const existing = await getOrCreateChatAccount(database, userId)
  const nextPlan = input.plan ?? existing.plan
  const nextBillingStatus = input.billingStatus ?? existing.billingStatus
  const nextBillingProvider = input.billingProvider ?? existing.billingProvider
  const nextStripeCustomerId = Object.prototype.hasOwnProperty.call(input, 'stripeCustomerId')
    ? input.stripeCustomerId ?? null
    : existing.stripeCustomerId
  const nextStripeSubscriptionId = Object.prototype.hasOwnProperty.call(input, 'stripeSubscriptionId')
    ? input.stripeSubscriptionId ?? null
    : existing.stripeSubscriptionId
  const nextStripePriceId = Object.prototype.hasOwnProperty.call(input, 'stripePriceId')
    ? input.stripePriceId ?? null
    : existing.stripePriceId
  const nextStripeCheckoutSessionId = Object.prototype.hasOwnProperty.call(input, 'stripeCheckoutSessionId')
    ? input.stripeCheckoutSessionId ?? null
    : existing.stripeCheckoutSessionId

  await database
    .prepare(
      `UPDATE chat_accounts
       SET
         plan = ?,
         billing_status = ?,
         billing_provider = ?,
         stripe_customer_id = ?,
         stripe_subscription_id = ?,
         stripe_price_id = ?,
         stripe_checkout_session_id = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
    )
    .run(
      nextPlan,
      nextBillingStatus,
      nextBillingProvider,
      nextStripeCustomerId,
      nextStripeSubscriptionId,
      nextStripePriceId,
      nextStripeCheckoutSessionId,
      userId,
    )
  return (await getChatAccount(database, userId))!
}

function normalizeNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
