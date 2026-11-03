import { describe, expect, it, vi } from 'vitest'
import type { BattingLineRow, EventRow } from '@npb/db'
import { EventEvidenceError, searchCompleteEventEvidence, validateEventEvidence, verifyOfficialHomeRunTotal } from '../server/services/chat-event-evidence'

function event(sequence: number): EventRow {
  return {
    gameId: 'r20250501s-d-01', gameDate: '2025-05-01', sequence, inning: 1, half: 'bottom',
    offenseTeam: 'ヤクルト', opponentTeam: '中日', eventType: 'plate_appearance', eventSubtype: 'standard',
    batterName: '山田', pitcherName: '投手', runnerName: null, resultText: 'ホームラン',
    eventAttributesJson: '{"batter_url":"https://npb.jp/bis/players/91895133.html"}',
    sourceUrl: 'https://npb.jp/scores/2025/0501/s-d-01/playbyplay.html',
  }
}
const filters = { year: 2025, team: 'ヤクルト', batter_player_id: '91895133', result_text_contains: 'ホームラン' }

describe('complete event evidence', () => {
  it('retrieves beyond an internal page, including numeric sequence ordering', async () => {
    const searchEvents = vi.fn()
      .mockResolvedValueOnce([event(2), event(10)])
      .mockResolvedValueOnce([event(11)])
    const rows = await searchCompleteEventEvidence({ searchEvents }, filters, { pageSize: 2 })
    expect(rows.map((row) => row.sequence)).toEqual([2, 10, 11])
    expect(searchEvents.mock.calls[1]?.[0]).toMatchObject({ after: { game_date: '2025-05-01', game_id: 'r20250501s-d-01', sequence: 10 } })
  })

  it('refuses a list when the retrieval budget cannot establish completeness', async () => {
    const searchEvents = vi.fn().mockResolvedValue([event(1), event(2)])
    await expect(searchCompleteEventEvidence({ searchEvents }, filters, { pageSize: 2, maxPages: 1 }))
      .rejects.toMatchObject({ issues: ['completeness_budget_exhausted'] })
  })

  it('rejects duplicates instead of silently deleting them to match a count', async () => {
    const searchEvents = vi.fn().mockResolvedValue([event(1), event(1)])
    await expect(searchCompleteEventEvidence({ searchEvents }, filters)).rejects.toBeInstanceOf(EventEvidenceError)
  })

  it('checks IDs, dates, teams, record type and official sources deterministically', () => {
    expect(validateEventEvidence(event(1), filters)).toEqual([])
    expect(validateEventEvidence({ ...event(1), offenseTeam: 'Yakult' }, { ...filters, team: 'セ・リーグ' })).toEqual([])
    expect(validateEventEvidence({ ...event(1), gameDate: '2024-05-01' }, filters)).toContain('year_mismatch')
    expect(validateEventEvidence({ ...event(1), offenseTeam: '阪神' }, filters)).toContain('team_mismatch')
    expect(validateEventEvidence({ ...event(1), eventAttributesJson: null }, filters)).toContain('batter_id_mismatch')
    expect(validateEventEvidence({ ...event(1), resultText: '三振' }, filters)).toContain('result_mismatch')
    expect(validateEventEvidence({ ...event(1), sourceUrl: 'https://example.com/scores/' }, filters)).toContain('unsupported_source')
    expect(validateEventEvidence({ ...event(1), eventAttributesJson: 'null' }, filters)).toContain('invalid_event_attributes')
  })

  it('compares complete event counts with a separately obtained official season total', async () => {
    const season: BattingLineRow = {
      playerId: '91895133', gameId: 'bis:2025:s:idb1', gameDate: '2025-01-01',
      team: 'ヤクルト', playerName: '山田 哲人', battingOrder: null, position: null,
      atBats: 338, runs: 25, hits: 78, runsBattedIn: 37, stolenBases: 3,
      strikeouts: 63, walks: 33, rawText: null, sourceKind: 'bis_batting',
      statsJson: '{"本塁打":"12"}', sourceUrl: 'https://npb.jp/bis/2025/stats/idb1_s.html',
    }
    const searchBattingLines = vi.fn().mockResolvedValue([season])
    const events = Array.from({ length: 12 }, (_, i) => event(i + 1))
    expect(await verifyOfficialHomeRunTotal({ searchBattingLines }, filters, events)).toMatchObject({
      official_total_status: 'verified', observed_count: 12, official_total: 12,
    })
    await expect(verifyOfficialHomeRunTotal({ searchBattingLines }, filters, events.slice(0, 11))).rejects.toMatchObject({ issues: ['official_total_mismatch'] })
    searchBattingLines.mockResolvedValue([{ ...season, playerId: 'another-player' }])
    expect(await verifyOfficialHomeRunTotal({ searchBattingLines }, filters, events)).toMatchObject({ official_total_status: 'unavailable', official_total: null })
  })
})
