import { describe, expect, it, vi } from 'vitest'

vi.mock('h3', () => ({ getHeader: vi.fn((event: { headers: Record<string, string> }, name: string) => event.headers[name]) }))

import { guestUsageGuardBucketKey } from '../server/utils/guest-usage-guard'

const baseHeaders = {
  'cf-connecting-ip': '203.0.113.42',
  'user-agent': 'Browser/1',
  'accept-language': 'ja',
  'sec-ch-ua-platform': 'Windows',
  'sec-ch-ua-mobile': '?0',
}

describe('guest usage guard', () => {
  it('survives guest cookie deletion because it does not use the cookie UUID', () => {
    const first = guestUsageGuardBucketKey({ headers: baseHeaders } as never, 'secret')
    const second = guestUsageGuardBucketKey({ headers: baseHeaders } as never, 'secret')
    expect(first).toBe(second)
    expect(first).not.toContain('203.0.113')
  })

  it('separates devices behind one network by browser characteristics', () => {
    const first = guestUsageGuardBucketKey({ headers: baseHeaders } as never, 'secret')
    const second = guestUsageGuardBucketKey({ headers: { ...baseHeaders, 'user-agent': 'Browser/2' } } as never, 'secret')
    expect(first).not.toBe(second)
  })
})
