import type { QueryDatabase } from '../query-driver'

export type ChatUsageBucket = { tokens: number; lastRefillAt: number }
export type ChatTokenBucketConfig = { capacity: number; refillIntervalSeconds: number }

export async function getChatUsageBucket(
  database: QueryDatabase,
  bucketKey: string,
  config: ChatTokenBucketConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<ChatUsageBucket> {
  await database.prepare(
    `INSERT INTO chat_usage_token_buckets (bucket_key, tokens, last_refill_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(bucket_key) DO UPDATE SET
       tokens = MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)),
       last_refill_at = CASE
         WHEN MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)) >= ? THEN ?
         ELSE last_refill_at + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER) * ?
       END,
       updated_at = ?`,
  ).run(bucketKey, config.capacity, nowSeconds, nowSeconds,
    config.capacity, nowSeconds, config.refillIntervalSeconds,
    config.capacity, nowSeconds, config.refillIntervalSeconds, config.capacity, nowSeconds,
    nowSeconds, config.refillIntervalSeconds, config.refillIntervalSeconds, nowSeconds)
  return readBucket(database, bucketKey)
}

export async function consumeChatUsageToken(
  database: QueryDatabase,
  bucketKey: string,
  config: ChatTokenBucketConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<ChatUsageBucket | null> {
  const insert = await database.prepare(
    `INSERT INTO chat_usage_token_buckets (bucket_key, tokens, last_refill_at, updated_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(bucket_key) DO NOTHING`,
  ).run(bucketKey, config.capacity - 1, nowSeconds, nowSeconds)

  if (extractRunChanges(insert) === 0) {
    const update = await database.prepare(
      `UPDATE chat_usage_token_buckets SET
         tokens = MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)) - 1,
         last_refill_at = CASE
           WHEN MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)) >= ? THEN ?
           ELSE last_refill_at + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER) * ?
         END,
         updated_at = ?
       WHERE bucket_key = ?
         AND MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)) > 0`,
    ).run(config.capacity, nowSeconds, config.refillIntervalSeconds,
      config.capacity, nowSeconds, config.refillIntervalSeconds, config.capacity, nowSeconds,
      nowSeconds, config.refillIntervalSeconds, config.refillIntervalSeconds,
      nowSeconds, bucketKey, config.capacity, nowSeconds, config.refillIntervalSeconds)
    if (extractRunChanges(update) === 0) return null
  }
  return readBucket(database, bucketKey)
}

export async function refundChatUsageToken(
  database: QueryDatabase,
  bucketKey: string,
  config: ChatTokenBucketConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<void> {
  await database.prepare(
    `UPDATE chat_usage_token_buckets SET
       tokens = MIN(?, tokens + 1),
       last_refill_at = CASE WHEN tokens + 1 >= ? THEN ? ELSE last_refill_at END,
       updated_at = ? WHERE bucket_key = ?`,
  ).run(config.capacity, config.capacity, nowSeconds, nowSeconds, bucketKey)
}

async function readBucket(database: QueryDatabase, bucketKey: string): Promise<ChatUsageBucket> {
  const row = await database.prepare(
    'SELECT tokens, last_refill_at AS lastRefillAt FROM chat_usage_token_buckets WHERE bucket_key = ?',
  ).get(bucketKey) as ChatUsageBucket | undefined
  if (!row) throw new Error('Chat usage bucket was not created')
  return row
}

function extractRunChanges(result: unknown): number {
  if (!result || typeof result !== 'object') return 0
  const record = result as Record<string, unknown>
  if (typeof record.changes === 'number') return record.changes
  if (record.meta && typeof record.meta === 'object') {
    const changes = (record.meta as Record<string, unknown>).changes
    if (typeof changes === 'number') return changes
  }
  return 0
}
