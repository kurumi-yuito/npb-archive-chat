import type { ChatUsageInfo } from '@npb/schemas'
import type { ChatRuntimeUsageConfig } from './chat-runtime-config'

type BucketSnapshot = { tokens: number; lastRefillAt: number }

export function buildProUsageInfo(now = new Date()): ChatUsageInfo {
  return {
    plan: 'pro',
    timezone: 'Asia/Tokyo',
    asOf: toJstIso(now),
    limit: null,
    remaining: null,
    refillIntervalMinutes: null,
    nextTokenAt: null,
    fullAt: null,
  }
}

export function buildFreeUsageInfo(
  bucket: BucketSnapshot,
  config: ChatRuntimeUsageConfig,
  now = new Date(),
): ChatUsageInfo {
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const missing = Math.max(0, config.capacity - bucket.tokens)
  const nextSeconds = bucket.tokens < config.capacity
    ? Math.max(nowSeconds, bucket.lastRefillAt + config.refillIntervalSeconds)
    : null
  const fullSeconds = missing > 0
    ? bucket.lastRefillAt + missing * config.refillIntervalSeconds
    : null
  return {
    plan: 'free',
    timezone: 'Asia/Tokyo',
    asOf: toJstIso(now),
    limit: config.capacity,
    remaining: bucket.tokens,
    refillIntervalMinutes: config.refillIntervalMinutes,
    nextTokenAt: nextSeconds === null ? null : toJstIso(new Date(nextSeconds * 1000)),
    fullAt: fullSeconds === null ? null : toJstIso(new Date(fullSeconds * 1000)),
  }
}

export function toJstIso(date: Date): string {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return `${shifted.toISOString().slice(0, -1)}+09:00`
}
