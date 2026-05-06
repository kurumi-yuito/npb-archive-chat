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
