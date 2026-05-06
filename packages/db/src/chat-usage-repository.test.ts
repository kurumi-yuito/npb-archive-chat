import { describe, expect, it } from 'vitest'
import {
  FREE_CHAT_MONTHLY_LIMIT,
  currentUsageMonthKey,
  getChatUsageCount,
  incrementChatUsageForFreeUser,
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
