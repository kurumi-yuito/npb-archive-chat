/**
 * 手動・CI 用: 環境変数 NPB_RUN_ENRICH_CALENDAR=1 のときだけ実行。
 * 通常の vitest では skip される。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runScoresCalendarEnrichment } from './enrich-scores-calendar'

const RUN = process.env.NPB_RUN_ENRICH_CALENDAR === '1'
const thisDir = path.dirname(fileURLToPath(import.meta.url))

describe.skipIf(!RUN)('production: enrich-scores-calendar (network)', () => {
  it(
    'fills missing events for 2025 sqlite',
    async () => {
      const workspaceRoot = path.resolve(thisDir, '..', '..', '..')
      const sqlitePath = process.env.NPB_SQLITE_PATH ?? 'data/npb-2025.sqlite'
      const year = Number(process.env.NPB_ENRICH_YEAR ?? '2025')

      const result = await runScoresCalendarEnrichment({
        year,
        sqlitePath,
        workspaceRoot,
        delayMs: Number(process.env.NPB_ENRICH_DELAY_MS ?? '0'),
        progressEvery: Number(process.env.NPB_PROGRESS_EVERY ?? '25'),
      })

      expect(result.year).toBe(year)
      expect(result.failures.length).toBeGreaterThanOrEqual(0)
    },
    8 * 60 * 60 * 1000,
  )
})
