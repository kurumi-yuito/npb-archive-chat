import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { playerComparisonIssues, otherPlayersIssues } from '../../../scripts/acceptance-player-comparison.mjs'

const oracle = JSON.parse(readFileSync(new URL('../../../docs/eval-source-oracles/2025-okamoto-oyama-batting-averages.json', import.meta.url), 'utf8'))
const rows = oracle.rows.map((source: { playerId: string; year: number; sourceUrl: string; metrics: Record<string, string> }) => ({
  kind: 'batting', stats: { playerId: source.playerId, year: source.year, battingAverage: Number(source.metrics['打率']), sourceUrls: JSON.stringify([source.sourceUrl]) },
}))
const body = { results: { aggregates: rows }, answer: { summary: '岡本のほうが打率は高いです。', source_urls: [] } }

describe('MT05 official season comparison evidence', () => {
  it('requires exact identities, years, values, sources and a conclusion', () => {
    expect(playerComparisonIssues('MT05-Turn3', body, oracle)).toEqual([])
    const wrongYear = { ...body, results: { aggregates: rows.map((row: typeof rows[number]) => ({ ...row, stats: { ...row.stats, year: 2026 } })) } }
    expect(playerComparisonIssues('MT05-Turn3', wrongYear, oracle)).toContain('comparison_identity_year_or_value_mismatch')
    expect(playerComparisonIssues('MT05-Turn3', { ...body, answer: { ...body.answer, summary: '打率の一覧です。' } }, oracle)).toContain('comparison_conclusion_missing')
    expect(playerComparisonIssues('MT05-Turn3', { ...body, results: { aggregates: rows.slice(0, 1) } }, oracle)).toContain('comparison_operand_count_mismatch')
  })
  it('records malformed source evidence without crashing the evaluation', () => {
    const broken = { ...body, results: { aggregates: rows.map((row: typeof rows[number]) => ({ ...row, stats: { ...row.stats, sourceUrls: '{bad' } })) } }
    expect(playerComparisonIssues('MT05-Turn3', broken, oracle)).toContain('comparison_source_missing')
  })
})

const otherOracle = JSON.parse(readFileSync(new URL('../../../docs/eval-source-oracles/2025-s-other-home-run-batters.json', import.meta.url), 'utf8'))
describe('MT02 other home-run batters', () => {
  it('checks all eligible batters and rejects zero counts, missing rows and the excluded player', () => {
    const aggregates = otherOracle.expected.map((row: { name: string; homeRuns: number }, index: number) => ({ kind: 'batting', label: row.name,
      stats: { playerId: String(index), year: 2025, homeRuns: row.homeRuns, sourceUrls: JSON.stringify([otherOracle.source.source_url]) } }))
    const response = { results: { aggregates } }
    expect(otherPlayersIssues('MT02-Turn3', response, otherOracle)).toEqual([])
    expect(otherPlayersIssues('MT02-Turn3', { results: { aggregates: aggregates.slice(1) } }, otherOracle)).toContain('other_player_completeness_mismatch')
    const invalid = [...aggregates, { kind: 'batting', label: '村上宗隆', stats: { playerId: 'excluded', year: 2025, homeRuns: 22, sourceUrls: '[]' } }]
    expect(otherPlayersIssues('MT02-Turn3', { results: { aggregates: invalid } }, otherOracle)).toContain('other_player_scope_or_value_mismatch')
    const zero = aggregates.map((row: typeof aggregates[number]) => ({ ...row, stats: { ...row.stats, homeRuns: 0 } }))
    expect(otherPlayersIssues('MT02-Turn3', { results: { aggregates: zero } }, otherOracle)).toContain('other_player_scope_or_value_mismatch')
  })
})
