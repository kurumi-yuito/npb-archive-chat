import { describe, expect, it } from 'vitest'
import {
  consumeChatUsageToken,
  getChatUsageBucket,
  migrateDatabase,
  openDatabase,
  refundChatUsageToken,
  sqliteDatabaseToQuery,
} from './index.js'

const config = { capacity: 10, refillIntervalSeconds: 2 * 60 * 60 }
const start = Math.floor(new Date('2026-08-08T00:00:00+09:00').getTime() / 1000)

describe('chat usage token bucket', () => {
  it('returns committed consumption with one statement for new, existing and exhausted buckets', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const query = sqliteDatabaseToQuery(database)
      let statements = 0
      const counted = { ...query, prepare: (sql: string) => { statements += 1; return query.prepare(sql) } }
      const small = { ...config, capacity: 2 }
      expect((await consumeChatUsageToken(counted, 'account:single', small, start))?.tokens).toBe(1)
      expect(statements).toBe(1)
      expect((await consumeChatUsageToken(counted, 'account:single', small, start))?.tokens).toBe(0)
      expect(statements).toBe(2)
      expect(await consumeChatUsageToken(counted, 'account:single', small, start)).toBeNull()
      expect(statements).toBe(3)
      expect((await consumeChatUsageToken(counted, 'account:single', small, start + config.refillIntervalSeconds))?.tokens).toBe(0)
      expect(statements).toBe(4)
    } finally { database.close() }
  })

  it('starts full, consumes to zero, and rejects the next request', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const query = sqliteDatabaseToQuery(database)
      for (let remaining = 9; remaining >= 0; remaining -= 1) {
        expect((await consumeChatUsageToken(query, 'account:free', config, start))?.tokens).toBe(remaining)
      }
      expect(await consumeChatUsageToken(query, 'account:free', config, start)).toBeNull()
    } finally { database.close() }
  })

  it('recovers one token every two hours up to capacity across JST midnight', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const query = sqliteDatabaseToQuery(database)
      for (let i = 0; i < 10; i += 1) await consumeChatUsageToken(query, 'account:jst', config, start)
      expect((await getChatUsageBucket(query, 'account:jst', config, start + 2 * 60 * 60 - 1)).tokens).toBe(0)
      expect((await getChatUsageBucket(query, 'account:jst', config, start + 2 * 60 * 60)).tokens).toBe(1)
      expect((await getChatUsageBucket(query, 'account:jst', config, start + 30 * 60 * 60)).tokens).toBe(10)
    } finally { database.close() }
  })

  it('refunds a failed request without exceeding capacity', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const query = sqliteDatabaseToQuery(database)
      await consumeChatUsageToken(query, 'account:refund', config, start)
      await refundChatUsageToken(query, 'account:refund', config, start)
      await refundChatUsageToken(query, 'account:refund', config, start)
      expect((await getChatUsageBucket(query, 'account:refund', config, start)).tokens).toBe(10)
    } finally { database.close() }
  })

  it('isolates account and guest guard buckets', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const query = sqliteDatabaseToQuery(database)
      await consumeChatUsageToken(query, 'account:guest-cookie-a', config, start)
      await consumeChatUsageToken(query, 'guest-guard:fingerprint', config, start)
      expect((await getChatUsageBucket(query, 'account:guest-cookie-b', config, start)).tokens).toBe(10)
      expect((await getChatUsageBucket(query, 'guest-guard:fingerprint', config, start)).tokens).toBe(9)
    } finally { database.close() }
  })
})
