import { describe, it, expect } from 'vitest'
import {
  buildFreeUsageInfo,
  buildFreeUsageSnapshot,
  buildProUsageInfo,
} from '../server/utils/build-chat-usage'

describe('build-chat-usage', () => {
  it('computes free remaining from snapshot', () => {
    expect(buildFreeUsageSnapshot('2025-03', 0).remaining).toBe(9)
    expect(buildFreeUsageSnapshot('2025-03', 8).remaining).toBe(1)
    expect(buildFreeUsageSnapshot('2025-03', 9).remaining).toBe(0)
  })

  it('reflects count after increment for free', () => {
    expect(buildFreeUsageInfo('2025-03', 9).remaining).toBe(0)
  })

  it('marks pro as unlimited', () => {
    const u = buildProUsageInfo('2025-03')
    expect(u.limit).toBeNull()
    expect(u.remaining).toBeNull()
  })
})
