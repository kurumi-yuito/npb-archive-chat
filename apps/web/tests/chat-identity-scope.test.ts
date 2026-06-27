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
  it('classifies current season wording as current', () => {
    expect(inferIdentityResolutionScope({
      message: '牧秀悟の今シーズンの通算打率は？',
      structuredQuery: query({ player_name: '牧秀悟' }),
      currentYear: 2026,
    })).toBe('current')
  })

  it('classifies current-year filters as current', () => {
    expect(inferIdentityResolutionScope({
      message: '牧の2026年の成績を教えて',
      structuredQuery: query({ player_name: '牧', year: 2026 }),
      currentYear: 2026,
    })).toBe('current')
  })

  it('classifies historical team wording as historical', () => {
    expect(inferIdentityResolutionScope({
      message: '西武時代の山川穂高の年別本塁打数を教えてください',
      structuredQuery: query({ player_name: '山川穂高', team: '西武' }),
      currentYear: 2026,
    })).toBe('historical')
  })

  it('classifies past-year filters as historical', () => {
    expect(inferIdentityResolutionScope({
      message: '2025年の山本由伸の成績を教えて',
      structuredQuery: query({ player_name: '山本由伸', year: 2025 }),
      currentYear: 2026,
    })).toBe('historical')
  })

  it('prefers explicit historical context over current wording', () => {
    expect(inferIdentityResolutionScope({
      message: '今年じゃなくて去年',
      structuredQuery: query({ player_name: '村上宗隆', year: 2025 }),
      currentYear: 2026,
    })).toBe('historical')
  })

  it('classifies unqualified player questions as unspecified', () => {
    expect(inferIdentityResolutionScope({
      message: '牧秀悟の成績を教えて',
      structuredQuery: query({ player_name: '牧秀悟' }),
      currentYear: 2026,
    })).toBe('unspecified')
  })
})
