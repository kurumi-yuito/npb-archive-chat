import { describe, expect, it } from 'vitest'
import {
  getOrCreateChatAccount,
  migrateDatabase,
  openDatabase,
  sqliteDatabaseToQuery,
  updateChatAccountPlan,
  updateChatAccountProfile,
  updateChatAccountBillingState,
  linkOrCreateGoogleChatAccount,
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
        authProvider: 'guest',
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

  it('links a guest account to Google without losing billing state', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const query = sqliteDatabaseToQuery(database)

      await updateChatAccountBillingState(query, 'guest-1', {
        plan: 'pro',
        billingStatus: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      })

      const linked = await linkOrCreateGoogleChatAccount(query, {
        guestUserId: 'guest-1',
        googleSubject: 'google-sub-1',
        email: 'google@example.com',
        emailVerified: true,
        displayName: 'Google User',
      })

      expect(linked).toMatchObject({
        userId: 'guest-1',
        authProvider: 'google',
        authSubject: 'google-sub-1',
        authEmailVerified: 1,
        email: 'google@example.com',
        displayName: 'Google User',
        plan: 'pro',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      })
    } finally {
      database.close()
    }
  })
})
