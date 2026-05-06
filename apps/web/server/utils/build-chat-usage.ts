import type { ChatUsageInfo } from '@npb/schemas'
import { FREE_CHAT_MONTHLY_LIMIT } from '@npb/db'

export function buildProUsageInfo(month: string): ChatUsageInfo {
  return {
    plan: 'pro',
    month,
    used: 0,
    limit: null,
    remaining: null,
  }
}

export function buildFreeUsageInfo(month: string, usedAfterIncrement: number): ChatUsageInfo {
  return {
    plan: 'free',
    month,
    used: usedAfterIncrement,
    limit: FREE_CHAT_MONTHLY_LIMIT,
    remaining: Math.max(0, FREE_CHAT_MONTHLY_LIMIT - usedAfterIncrement),
  }
}

export function buildFreeUsageSnapshot(
  month: string,
  used: number,
): ChatUsageInfo {
  return {
    plan: 'free',
    month,
    used,
    limit: FREE_CHAT_MONTHLY_LIMIT,
    remaining: Math.max(0, FREE_CHAT_MONTHLY_LIMIT - used),
  }
}
