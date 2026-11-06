import { describe, expect, it } from 'vitest'
import { readKnownGameScore } from './score-evidence'

describe('shared score evidence', () => {
  it('distinguishes unknown totals from a verified scoreless game in both source formats', () => {
    for (const legacy of [true, false]) {
      const score = (away: number | null, home: number | null) => JSON.stringify(legacy
        ? { away_team: '中日', home_team: 'ヤクルト', runs: { away, home } }
        : { away: { team: '中日', totals: { runs: away } }, home: { team: 'ヤクルト', totals: { runs: home } } })
      expect(readKnownGameScore(score(null, null))).toBeNull()
      expect(readKnownGameScore(score(null, 0))).toBeNull()
      expect(readKnownGameScore(score(0, 0))).toEqual({ awayTeam: '中日', homeTeam: 'ヤクルト', awayRuns: 0, homeRuns: 0 })
      expect(readKnownGameScore(score(1, 4))).toMatchObject({ awayRuns: 1, homeRuns: 4 })
    }
  })
  it('rejects invalid, negative and fractional scores instead of rendering a numerical result', () => {
    for (const runs of [-1, 1.5, '', 'not-a-score']) {
      expect(readKnownGameScore(JSON.stringify({ away: { team: '中日', totals: { runs } }, home: { team: 'ヤクルト', totals: { runs: 2 } } }))).toBeNull()
    }
    expect(readKnownGameScore('{invalid-json')).toBeNull()
  })
})
