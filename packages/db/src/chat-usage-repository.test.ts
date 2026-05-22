import { describe, expect, it } from 'vitest'
import {
  FREE_CHAT_MONTHLY_LIMIT,
  consumeChatUsageForFreeUser,
  currentUsageMonthKey,
  getChatUsageCount,
  incrementChatUsageForFreeUser,
  refundChatUsageForFreeUser,
  migrateDatabase,
  openDatabase,
  sqliteDatabaseToQuery,
} from './index.js'

describe('chat_usage_monthly', () => {
  it('counts increments per user and month', async () => {
    const database = openDatabase()

    try {
      migrateDatabase(database)
      const q = sqliteDatabaseToQuery(database)
      const month = currentUsageMonthKey(new Date('2025-06-15T12:00:00.000Z'))
      expect(month).toBe('2025-06')

      const uid = 'test-user-1'
      expect(await getChatUsageCount(q, uid, month)).toBe(0)

      await incrementChatUsageForFreeUser(q, uid, month)
      expect(await getChatUsageCount(q, uid, month)).toBe(1)

      for (let i = 0; i < FREE_CHAT_MONTHLY_LIMIT - 1; i++) {
        await incrementChatUsageForFreeUser(q, uid, month)
      }
      expect(await getChatUsageCount(q, uid, month)).toBe(FREE_CHAT_MONTHLY_LIMIT)
    } finally {
      database.close()
    }
  })

  it('consumeChatUsageForFreeUser returns false when limit is reached and does not over-count', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const q = sqliteDatabaseToQuery(database)
      const uid = 'test-consume-1'
      const month = '2025-06'
      const limit = 3

      expect(await consumeChatUsageForFreeUser(q, uid, month, limit)).toBe(true)
      expect(await consumeChatUsageForFreeUser(q, uid, month, limit)).toBe(true)
      expect(await consumeChatUsageForFreeUser(q, uid, month, limit)).toBe(true)
      expect(await consumeChatUsageForFreeUser(q, uid, month, limit)).toBe(false)
      expect(await getChatUsageCount(q, uid, month)).toBe(limit)
    } finally {
      database.close()
    }
  })

  it('refundChatUsageForFreeUser decrements count after consume', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const q = sqliteDatabaseToQuery(database)
      const uid = 'test-refund-1'
      const month = '2025-06'

      await consumeChatUsageForFreeUser(q, uid, month)
      await consumeChatUsageForFreeUser(q, uid, month)
      expect(await getChatUsageCount(q, uid, month)).toBe(2)

      await refundChatUsageForFreeUser(q, uid, month)
      expect(await getChatUsageCount(q, uid, month)).toBe(1)
    } finally {
      database.close()
    }
  })

  it('refundChatUsageForFreeUser on count=0 is safe and does not go negative', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const q = sqliteDatabaseToQuery(database)
      const uid = 'test-refund-2'
      const month = '2025-06'

      await consumeChatUsageForFreeUser(q, uid, month)
      await refundChatUsageForFreeUser(q, uid, month)
      expect(await getChatUsageCount(q, uid, month)).toBe(0)

      // Second refund on count=0 must not throw and must not go negative
      await expect(refundChatUsageForFreeUser(q, uid, month)).resolves.toBeUndefined()
      expect(await getChatUsageCount(q, uid, month)).toBe(0)
    } finally {
      database.close()
    }
  })

  it('isolates users and months', async () => {
    const database = openDatabase()

    try {
      migrateDatabase(database)
      const q = sqliteDatabaseToQuery(database)
      await incrementChatUsageForFreeUser(q, 'a', '2025-01')
      await incrementChatUsageForFreeUser(q, 'b', '2025-01')
      await incrementChatUsageForFreeUser(q, 'a', '2025-02')

      expect(await getChatUsageCount(q, 'a', '2025-01')).toBe(1)
      expect(await getChatUsageCount(q, 'b', '2025-01')).toBe(1)
      expect(await getChatUsageCount(q, 'a', '2025-02')).toBe(1)
    } finally {
      database.close()
    }
  })
})
