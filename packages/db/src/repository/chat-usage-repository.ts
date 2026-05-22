import type { QueryDatabase } from '../query-driver'

/** free プランの月あたりチャット回数上限（/api/chat のみ） */
export const FREE_CHAT_MONTHLY_LIMIT = 9

/** 集計用の月キー（UTC の暦月 YYYY-MM） */
export function currentUsageMonthKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export async function getChatUsageCount(
  database: QueryDatabase,
  userId: string,
  month: string,
): Promise<number> {
  const row = (await database
    .prepare(
      'SELECT chat_count AS chatCount FROM chat_usage_monthly WHERE user_id = ? AND month = ?',
    )
    .get(userId, month)) as { chatCount: number } | undefined
  return row?.chatCount ?? 0
}

export async function incrementChatUsageForFreeUser(
  database: QueryDatabase,
  userId: string,
  month: string,
): Promise<void> {
  await database
    .prepare(
      `INSERT INTO chat_usage_monthly (user_id, month, chat_count) VALUES (?, ?, 1)
       ON CONFLICT(user_id, month) DO UPDATE SET chat_count = chat_count + 1`,
    )
    .run(userId, month)
}

export async function consumeChatUsageForFreeUser(
  database: QueryDatabase,
  userId: string,
  month: string,
  limit: number = FREE_CHAT_MONTHLY_LIMIT,
): Promise<boolean> {
  // Step 1: Increment only if the current count is below the limit.
  // This is a single atomic statement — no separate SELECT needed.
  const updateResult = await database
    .prepare(
      'UPDATE chat_usage_monthly SET chat_count = chat_count + 1 WHERE user_id = ? AND month = ? AND chat_count < ?',
    )
    .run(userId, month, limit)

  if (extractRunChanges(updateResult) > 0) {
    return true
  }

  // Step 2: UPDATE affected 0 rows — either no row exists yet (first use this month)
  // or chat_count >= limit. Try to INSERT a new row; the ON CONFLICT DO NOTHING
  // clause ensures we only succeed on the very first use (not when count >= limit).
  const insertResult = await database
    .prepare(
      'INSERT INTO chat_usage_monthly (user_id, month, chat_count) VALUES (?, ?, 1) ON CONFLICT(user_id, month) DO NOTHING',
    )
    .run(userId, month)

  return extractRunChanges(insertResult) > 0
}

export async function refundChatUsageForFreeUser(
  database: QueryDatabase,
  userId: string,
  month: string,
): Promise<void> {
  await database
    .prepare(
      'UPDATE chat_usage_monthly SET chat_count = chat_count - 1 WHERE user_id = ? AND month = ? AND chat_count > 0',
    )
    .run(userId, month)
}

function extractRunChanges(result: unknown): number {
  if (!result || typeof result !== 'object') return 0
  const r = result as Record<string, unknown>
  // SQLite (better-sqlite3): { changes: number, lastInsertRowid: ... }
  if (typeof r.changes === 'number') return r.changes
  // D1: { success: boolean, meta: { changes: number, ... } }
  if (r.meta && typeof r.meta === 'object') {
    const meta = r.meta as Record<string, unknown>
    if (typeof meta.changes === 'number') return meta.changes
  }
  return 0
}
