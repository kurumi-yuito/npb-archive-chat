import { describe, expect, it, vi } from 'vitest'
import type { EventRow } from '@npb/db'
import { verifyOfficialHomeRunTotal } from '../server/services/chat-event-evidence'

const url = 'https://npb.jp/bis/players/official-a.html'
const filters = { year_from: 2022, year_to: 2023, team: 'ヤクルト', batter_player_id: 'official-a', result_text_contains: 'ホームラン' }
const record = (year: number, competition: string | null) => ({ gameId: `r${year}0101s-d-01`, gameDate: `${year}-01-01`, competition } as EventRow)
const profile = { playerId: 'official-a', name: '検証 選手', fetchedAt: '2026-11-04T00:00:00Z', sourceUrls: [url], affiliations: [], registrations: [],
  annualStatistics: [2022, 2023].map((year) => ({ kind: 'batting' as const, year, team: '東京ヤクルト', metrics: { 本塁打: year === 2022 ? '2' : '3' }, sourceUrl: url, fetchedAt: '2026-11-04T00:00:00Z' })) }

describe('multi-year official completeness (Q-184)', () => {
  it('finds a missing regular-season record even when a postseason record makes the overall counts equal', async () => {
    const events = [record(2022, 'セ・リーグ公式戦'), record(2022, '日本生命セ・パ交流戦'),
      record(2023, 'JERA セ・リーグ公式戦'), record(2023, 'JERA セ・リーグ公式戦'), record(2023, 'SMBC日本シリーズ')]
    const service = { searchBattingLines: vi.fn(), searchPlayerInformation: vi.fn().mockResolvedValue([profile]) }
    const proof = await verifyOfficialHomeRunTotal(service, filters, events)
    expect(proof).toMatchObject({ observed_count: 5, official_total: 5, official_observed_count: 4, official_total_status: 'incomplete',
      official_scope: 'first_regular_season', other_competitions_count: 1, discrepancies: [{ year: 2023, observed: 2, official_total: 3 }] })
    expect(events).toHaveLength(5)
    expect(service.searchBattingLines).not.toHaveBeenCalled()
    expect(proof.source_urls).toEqual([url])
  })

  it('certifies matching annual scopes and refuses to classify unknown competition records as regular games', async () => {
    const service = { searchBattingLines: vi.fn(), searchPlayerInformation: vi.fn().mockResolvedValue([profile]) }
    const events = [record(2022, 'セ・リーグ公式戦'), record(2022, 'セ・パ交流戦'),
      record(2023, 'セ・リーグ公式戦'), record(2023, 'セ・リーグ公式戦'), record(2023, 'セ・リーグ公式戦')]
    expect((await verifyOfficialHomeRunTotal(service, filters, events)).official_total_status).toBe('verified')
    const unknown = [...events, record(2023, null)]
    expect(await verifyOfficialHomeRunTotal(service, filters, unknown)).toMatchObject({ official_total_status: 'unavailable', unclassified_count: 1, official_total: 5 })
  })

  it('does not certify a missing year, a transfer subtotal for a named team, or another player', async () => {
    for (const changed of [
      { ...profile, annualStatistics: profile.annualStatistics.slice(1) },
      { ...profile, annualStatistics: profile.annualStatistics.map((row) => ({ ...row, team: null })) },
      { ...profile, playerId: 'different-official-id' },
    ]) {
      const service = { searchBattingLines: vi.fn(), searchPlayerInformation: vi.fn().mockResolvedValue([changed]) }
      expect((await verifyOfficialHomeRunTotal(service, filters, [])).official_total_status).toBe('unavailable')
    }
  })
})
