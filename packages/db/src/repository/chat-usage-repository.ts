import type { QueryDatabase } from '../query-driver'

export type ChatUsageBucket = { tokens: number; lastRefillAt: number }
export type ChatTokenBucketConfig = { capacity: number; refillIntervalSeconds: number }

export async function getChatUsageBucket(
  database: QueryDatabase,
  bucketKey: string,
  config: ChatTokenBucketConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<ChatUsageBucket> {
  const row = await database.prepare(
    `INSERT INTO chat_usage_token_buckets (bucket_key, tokens, last_refill_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(bucket_key) DO UPDATE SET
       tokens = MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)),
       last_refill_at = CASE
         WHEN MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)) >= ? THEN ?
         ELSE last_refill_at + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER) * ?
       END,
       updated_at = ?
     RETURNING tokens, last_refill_at AS lastRefillAt`,
  ).get(bucketKey, config.capacity, nowSeconds, nowSeconds,
    config.capacity, nowSeconds, config.refillIntervalSeconds,
    config.capacity, nowSeconds, config.refillIntervalSeconds, config.capacity, nowSeconds,
    nowSeconds, config.refillIntervalSeconds, config.refillIntervalSeconds, nowSeconds)
  if (!row) throw new Error('Chat usage bucket was not created')
  return row as ChatUsageBucket
}

export async function consumeChatUsageToken(
  database: QueryDatabase,
  bucketKey: string,
  config: ChatTokenBucketConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<ChatUsageBucket | null> {
  const row = await database.prepare(
    `INSERT INTO chat_usage_token_buckets (bucket_key, tokens, last_refill_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(bucket_key) DO UPDATE SET
       tokens = MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)) - 1,
       last_refill_at = CASE
         WHEN MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)) >= ? THEN ?
         ELSE last_refill_at + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER) * ?
       END,
       updated_at = ?
     WHERE MIN(?, tokens + CAST(MAX(0, ? - last_refill_at) / ? AS INTEGER)) > 0
     RETURNING tokens, last_refill_at AS lastRefillAt`,
  ).get(bucketKey, config.capacity - 1, nowSeconds, nowSeconds,
    config.capacity, nowSeconds, config.refillIntervalSeconds,
    config.capacity, nowSeconds, config.refillIntervalSeconds, config.capacity, nowSeconds,
    nowSeconds, config.refillIntervalSeconds, config.refillIntervalSeconds,
    nowSeconds, config.capacity, nowSeconds, config.refillIntervalSeconds)
  return row as ChatUsageBucket | undefined ?? null
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
