import { describe, expect, it } from 'vitest'
import type { ChatStructuredQuery } from '@npb/schemas'
import { inferIdentityResolutionScope } from '../server/services/chat-identity-scope'

function query(filters: Record<string, unknown> = {}): ChatStructuredQuery {
  return {
    intent: 'search_batting',
    filters,
  } as ChatStructuredQuery
}

describe('inferIdentityResolutionScope', () => {
  it('classifies explicit current-year filters as current', () => {
    expect(inferIdentityResolutionScope({
      structuredQuery: query({ player_name: '牧秀悟', year: 2026 }),
      currentYear: 2026,
    })).toBe('current')
  })

  it('classifies recent searches as current', () => {
    expect(inferIdentityResolutionScope({
      structuredQuery: query({ pitcher_name: '藤浪', recent: true }),
      currentYear: 2026,
    })).toBe('current')
  })

  it('classifies past-year filters as historical', () => {
    expect(inferIdentityResolutionScope({
      structuredQuery: query({ player_name: '山本由伸', year: 2025 }),
      currentYear: 2026,
    })).toBe('historical')
  })

  it('inherits an explicit historical scope from follow-up metadata', () => {
    expect(inferIdentityResolutionScope({
      structuredQuery: query({ player_name: '山村' }),
      followUpType: 'target_omission',
      followUpContext: {
        contextKind: 'player_stats',
        inheritedScope: 'historical',
        inheritedSeason: 2025,
      },
      currentYear: 2026,
    })).toBe('historical')
  })

  it('falls back to unspecified when no structured scope is available', () => {
    expect(inferIdentityResolutionScope({
      structuredQuery: query({ player_name: '牧秀悟' }),
      currentYear: 2026,
    })).toBe('unspecified')
  })
})
