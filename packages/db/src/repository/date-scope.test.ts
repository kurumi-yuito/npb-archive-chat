import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseRawGameFromDir } from '@npb/parser'
import { openDatabase } from '../sqlite'
import { migrateDatabase } from '../migrations'
import { loadRichGame } from '../loader'
import { runNormalizeDatabase } from '../normalized-conversion'
import { sqliteDatabaseToQuery } from '../query-driver'
import { searchGames } from './games-repository'
import { searchEvents } from './events-repository'
import { searchBattingLines } from './batting-repository'
import { searchPitchingLines } from './pitching-repository'
import { aggregateBattingLines, aggregateGameResults } from './aggregate-repository'

describe('inclusive date scope across source adapters', () => {
  it('uses only the selected fixture game in legacy and normalized searches and reductions', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'npb-date-scope-'))
    const legacyPath = path.join(directory, 'legacy.sqlite')
    const normalizedPath = path.join(directory, 'normalized.sqlite')
    const source = openDatabase(legacyPath)
    try {
      migrateDatabase(source)
      const fixtures = new URL('../../../parser/src/__fixtures__/raw/2025/', import.meta.url)
      for (const relative of ['0815/r20250815b-l-17', '0711/db-g-11']) {
        loadRichGame(source, await parseRawGameFromDir(path.join(fixtures.pathname, relative)))
      }
    } finally { source.close() }
    try {
      runNormalizeDatabase({ source: legacyPath, target: normalizedPath,
        migrationsDir: new URL('../../migrations-normalized/', import.meta.url).pathname })
      for (const file of [legacyPath, normalizedPath]) {
        const database = openDatabase(file)
        try {
          const query = sqliteDatabaseToQuery(database)
          const filters = { date_from: '2025-08-01', date_to: '2025-08-31' }
          const games = await searchGames(query, filters)
          expect(games.map((row) => row.gameId)).toEqual(['r20250815b-l-17'])
          for (const rows of [await searchEvents(query, filters), await searchBattingLines(query, filters), await searchPitchingLines(query, filters)]) {
            expect(rows.length).toBeGreaterThan(0)
            expect(rows.every((row) => row.gameDate === '2025-08-15')).toBe(true)
          }
          const batting = await aggregateBattingLines(query, filters)
          expect(batting.length).toBeGreaterThan(0)
          expect(batting.every((row) => row.total === 1)).toBe(true)
          const gamesTotal = await aggregateGameResults(query, filters)
          expect(gamesTotal.length).toBeGreaterThan(0)
          expect(gamesTotal.every((row) => row.total === 1)).toBe(true)
          expect(await searchGames(query, { date_from: '2025-08-16', date_to: '2025-08-31' })).toEqual([])
          expect(await searchGames(query, { date_from: '2025-08-15', date_to: '2025-08-15' })).toHaveLength(1)
        } finally { database.close() }
      }
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
})
