import { describe, expect, it } from 'vitest'
import {
  getOrCreateChatAccount,
  migrateDatabase,
  openDatabase,
  sqliteDatabaseToQuery,
  updateChatAccountPlan,
  updateChatAccountProfile,
  updateChatAccountBillingState,
} from './index'

describe('chat_accounts', () => {
  it('persists profile and subscription plan by user id', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const query = sqliteDatabaseToQuery(database)

      const created = await getOrCreateChatAccount(query, 'user-1')
      expect(created).toMatchObject({
        userId: 'user-1',
        plan: 'free',
        billingStatus: 'active',
        billingProvider: 'stripe',
      })

      const profile = await updateChatAccountProfile(query, 'user-1', {
        email: 'user@example.com',
        displayName: 'NPB User',
      })
      expect(profile).toMatchObject({
        email: 'user@example.com',
        displayName: 'NPB User',
        plan: 'free',
      })

      const subscription = await updateChatAccountPlan(query, 'user-1', 'pro')
      expect(subscription).toMatchObject({
        userId: 'user-1',
        email: 'user@example.com',
        displayName: 'NPB User',
        plan: 'pro',
      })

      const billing = await updateChatAccountBillingState(query, 'user-1', {
        billingStatus: 'trialing',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_123',
      })
      expect(billing).toMatchObject({
        billingStatus: 'trialing',
        billingProvider: 'stripe',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_123',
      })
    } finally {
      database.close()
    }
  })
})
