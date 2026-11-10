import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseOfficialSeriesHistory } from './series-history'

const html = readFileSync(new URL('./__fixtures__/series-history-2020.html', import.meta.url), 'utf8')
const source = JSON.parse(readFileSync(new URL('./__fixtures__/series-history-2020.source.json', import.meta.url), 'utf8'))
const oracle = JSON.parse(readFileSync(new URL('../../../docs/eval-source-oracles/series-history-1950-2026.json', import.meta.url), 'utf8'))

describe('official series outcome evidence (B16)', () => {
  it('reconciles the original bytes and every season with the separate Python HTML audit', () => {
    expect(createHash('sha256').update(html).digest('hex')).toBe(source.sha256)
    const expected = oracle.seasons.filter((row: { sourceUrl: string }) => row.sourceUrl === source.sourceUrl)
      .map((row: { year: number; winner: string; loser: string; winCounts: number[]; draws: number; scores: Array<{ raw: string; winnerSide: number; loserSide: number }> }) => ({
        year: row.year, competition: '日本シリーズ', level: 'first', winnerName: row.winner, loserName: row.loser,
        winnerWins: row.winCounts[0], loserWins: row.winCounts[1], draws: row.draws,
        games: row.scores.map((score) => ({ winnerSideRuns: score.winnerSide, loserSideRuns: score.loserSide, literalScore: score.raw })),
      }))
    const actual = parseOfficialSeriesHistory(html, source.sourceUrl)
    expect(actual).toEqual(expected)
    expect(actual.find((row) => row.year === 2022)).toMatchObject({ winnerWins: 4, loserWins: 2, draws: 1 })
    expect(actual.find((row) => row.year === 2025)).toMatchObject({ winnerName: 'ソフトバンク', loserName: '阪　神', winnerWins: 4, loserWins: 1 })
  })

  it('rejects mismatched counts, incomplete documents and duplicated seasons instead of manufacturing a winner', () => {
    expect(() => parseOfficialSeriesHistory(html.replace('（4勝）', '（5勝）'), source.sourceUrl)).toThrow('do not reconcile')
    expect(() => parseOfficialSeriesHistory(html.replace(/<\/html>/iu, ''), source.sourceUrl)).toThrow('completeness mismatch')
    expect(() => parseOfficialSeriesHistory(html.replace('【 2021 】', '【 2020 】'), source.sourceUrl)).toThrow('coverage mismatch')
    expect(() => parseOfficialSeriesHistory(html, source.sourceUrl.replace('2020.html', '2010.html'))).toThrow('title/period')
    expect(() => parseOfficialSeriesHistory(html, source.sourceUrl.replace('npb.jp/', 'npb.jp:8443/'))).toThrow('URL scope')
  })
})
