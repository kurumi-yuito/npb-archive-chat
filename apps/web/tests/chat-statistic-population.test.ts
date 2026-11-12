import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { canonicalLeagueTeamNames, type ChatQueryService } from '@npb/db'
import { chatStructuredQuerySchema, queryContractSchema } from '@npb/schemas'
import { completeOfficialStatisticPopulation } from '../server/services/chat-statistic-population'
import { filterStatisticRows } from '../server/services/chat-statistic-predicates'

const meaning = queryContractSchema.parse(JSON.parse(readFileSync(new URL('../../../docs/eval-query-contracts.json', import.meta.url), 'utf8')).cases[0].meaning)
const predicate = { field: 'shutouts', operator: 'gt' as const, value: 0 }
const contract = { ...meaning, entities: [], temporal_scope: { ...meaning.temporal_scope, years: [2026] },
  requested_output: [{ kind: 'pitching_statistics', fields: ['shutouts'] }], predicates: [predicate], grouping: ['player'],
  ordering: [{ field: 'games', direction: 'desc' }], completeness: { mode: 'all', limit: null } }
const query = chatStructuredQuerySchema.parse({ intent: 'aggregate_pitching', filters: { year: 2026, sort_by: 'games', limit: 100 }, query_contract: contract })

describe('complete official statistic candidate populations (Q45/Q206)', () => {
  it('includes qualifying players beyond a truncated league prefix and merges transfer evidence by ID', async () => {
    const clubs = canonicalLeagueTeamNames()
    const aggregatePitchingLines = vi.fn(async (filters: Parameters<ChatQueryService['aggregatePitchingLines']>[0]) => {
      const index = clubs.indexOf(filters!.team!)
      return Array.from({ length: 10 }, (_, row) => {
        const transfer = index < 2 && row === 9
        const id = transfer ? 'transfer' : `P_${String(index).padStart(2, '0')}_${row}`
        return { kind: 'pitching' as const, label: id, total: 1, stats: { playerId: id, games: 1,
          inningsPitched: transfer ? (index === 0 ? 1 / 3 : 2 / 3) : 1, earnedRuns: transfer ? index : 0,
          hitsAllowed: 1, walks: 0, shutouts: index === clubs.length - 1 && row === 9 ? 1 : 0,
          team: filters!.team!, year: 2026, level: 'first', evidenceStatus: 'official_complete_scope',
          sourceUrls: JSON.stringify([`https://npb.jp/bis/2026/stats/fixture-${index}.html`]) } }
      })
    })
    const service = { aggregatePitchingLines, aggregateBattingLines: vi.fn() }
    const rows = await completeOfficialStatisticPopulation(service, query)
    expect(aggregatePitchingLines).toHaveBeenCalledTimes(clubs.length)
    expect(rows).toHaveLength(clubs.length * 10 - 1)
    const transfer = rows.find((row) => row.stats.playerId === 'transfer')!
    expect(transfer.stats).toMatchObject({ games: 2, inningsPitched: 1, era: 9 })
    expect(JSON.parse(String(transfer.stats.sourceUrls))).toHaveLength(2)
    expect(rows.slice(0, 100).some((row) => row.stats.shutouts === 1)).toBe(false)
    expect(() => filterStatisticRows(query, [predicate], rows)).toThrow('statistic_predicate_completeness_unverified')
    const selected = filterStatisticRows(query, [predicate], rows, new Map(), true)
    expect(selected.map((row) => row.stats.playerId)).toEqual([`P_${String(clubs.length - 1).padStart(2, '0')}_9`])
    const top = chatStructuredQuerySchema.parse({ ...query, query_contract: { ...contract, completeness: { mode: 'top_n', limit: 1 } } })
    expect(filterStatisticRows(top, [predicate], rows, new Map(), true)).toHaveLength(1)
  })
  it('refuses a club result that reaches its bound or lacks complete identity evidence', async () => {
    const row = { kind: 'pitching' as const, label: '検証', total: 1, stats: { playerId: 'id', games: 1,
      inningsPitched: 1, year: 2026, level: 'first', team: '巨人', evidenceStatus: 'official_identity_incomplete', sourceUrls: '[]' } }
    const service = { aggregatePitchingLines: vi.fn().mockResolvedValue([row]), aggregateBattingLines: vi.fn() }
    await expect(completeOfficialStatisticPopulation(service, query)).rejects.toThrow('statistic_club_population_unverified')
    service.aggregatePitchingLines.mockResolvedValue(Array.from({ length: 100 }, () => row))
    await expect(completeOfficialStatisticPopulation(service, query)).rejects.toThrow('statistic_club_population_incomplete')
  })
})
