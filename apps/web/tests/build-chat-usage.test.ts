import { describe, expect, it } from 'vitest'
import { buildFreeUsageInfo, buildProUsageInfo, toJstIso } from '../server/utils/build-chat-usage'

const config = { capacity: 10, refillIntervalMinutes: 120, refillIntervalSeconds: 7200, guestGuardEnabled: true }
const now = new Date('2026-08-08T03:00:00.000Z')
const nowSeconds = Math.floor(now.getTime() / 1000)

describe('build-chat-usage', () => {
  it('returns remaining tokens and recovery times in JST', () => {
    const usage = buildFreeUsageInfo({ tokens: 0, lastRefillAt: nowSeconds }, config, now)
    expect(usage.remaining).toBe(0)
    expect(usage.limit).toBe(10)
    expect(usage.nextTokenAt).toBe('2026-08-08T14:00:00.000+09:00')
    expect(usage.fullAt).toBe('2026-08-09T08:00:00.000+09:00')
    expect(usage.timezone).toBe('Asia/Tokyo')
  })

  it('does not expose recovery times while full', () => {
    const usage = buildFreeUsageInfo({ tokens: 10, lastRefillAt: nowSeconds }, config, now)
    expect(usage.nextTokenAt).toBeNull()
    expect(usage.fullAt).toBeNull()
  })

  it('marks pro as unlimited', () => {
    const usage = buildProUsageInfo(now)
    expect(usage.limit).toBeNull()
    expect(usage.remaining).toBeNull()
  })

  it('formats instants using an explicit JST offset', () => {
    expect(toJstIso(new Date('2026-08-08T15:30:00Z'))).toBe('2026-08-09T00:30:00.000+09:00')
  })
})
