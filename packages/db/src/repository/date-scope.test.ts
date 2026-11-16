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
import { searchGameDetails } from './game-detail-repository'
import { searchEvents } from './events-repository'
import { searchBattingLines } from './batting-repository'
import { searchPitchingLines } from './pitching-repository'
import { aggregateBattingLines, aggregateGameResults, aggregatePitchingLines } from './aggregate-repository'
import { matchesGameTeamFilter } from './team-name-utils'

describe('inclusive date scope across source adapters', () => {
  it('uses only the selected fixture game in legacy and normalized searches and reductions', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'npb-date-scope-'))
    const legacyPath = path.join(directory, 'legacy.sqlite')
    const normalizedPath = path.join(directory, 'normalized.sqlite')
    const source = openDatabase(legacyPath)
    let expectedStarters: string[] = []
    try {
      migrateDatabase(source)
      const fixtures = new URL('../../../parser/src/__fixtures__/raw/2025/', import.meta.url)
      for (const relative of ['0815/r20250815b-l-17', '0711/db-g-11']) {
        const game = await parseRawGameFromDir(path.join(fixtures.pathname, relative))
        if (relative.startsWith('0815/')) expectedStarters = game.pitching_box.map((team) => team.rows[0]!.pitcher.name)
        loadRichGame(source, game)
      }
    } finally { source.close() }
    try {
      runNormalizeDatabase({ source: legacyPath, target: normalizedPath,
        migrationsDir: new URL('../../migrations-normalized/', import.meta.url).pathname })
      for (const file of [legacyPath, normalizedPath]) {
        const database = openDatabase(file)
        try {
          const query = sqliteDatabaseToQuery(database)
          expect((await searchGames(query, { year: 2025, sort_direction: 'desc', limit: 1 }))[0]?.gameId).toBe('r20250815b-l-17')
          expect((await searchGames(query, { year: 2025, sort_direction: 'asc', limit: 1 }))[0]).toMatchObject({ gameId: 'db-g-11', date: '2025-07-11' })
          const filters = { date_from: '2025-08-01', date_to: '2025-08-31' }
          const games = await searchGames(query, filters)
          expect(games.map((row) => row.gameId)).toEqual(['r20250815b-l-17'])
          const offenseEvents = await searchEvents(query, { ...filters, team: 'オリックス', opponent: '西武', limit: 500 })
          expect(offenseEvents.length).toBeGreaterThan(0)
          expect(offenseEvents.every((row) => row.opponentTeam && matchesGameTeamFilter(row.opponentTeam, '西武') && matchesGameTeamFilter(row.offenseTeam, 'オリックス'))).toBe(true)
          expect(await searchEvents(query, { ...filters, team: 'オリックス', opponent: '阪神' })).toEqual([])
          const playCondition = offenseEvents[0]!.resultText
          expect(await searchGames(query, { ...filters, team: 'オリックス', result_text_contains: playCondition })).toHaveLength(1)
          expect(await searchGames(query, { ...filters, team: 'オリックス', result_text_contains: '未収録の検証語句' })).toEqual([])
          expect(await searchGameDetails(query, { ...filters, team: 'オリックス', result_text_contains: playCondition })).toHaveLength(1)
          expect(await searchGameDetails(query, { ...filters, team: 'オリックス', result_text_contains: '未収録の検証語句' })).toEqual([])
          const qualifiedGames = await aggregateGameResults(query, { ...filters, team: 'オリックス', result_text_contains: playCondition })
          expect(qualifiedGames).toHaveLength(1)
          expect(qualifiedGames[0]!.total).toBe(1)
          for (const rows of [await searchEvents(query, filters), await searchBattingLines(query, filters), await searchPitchingLines(query, filters)]) {
            expect(rows.length).toBeGreaterThan(0)
            expect(rows.every((row) => row.gameDate === '2025-08-15')).toBe(true)
          }
          const starts = await searchPitchingLines(query, { ...filters, starter: true })
          expect(starts.map((row) => row.pitcherName).sort()).toEqual([...expectedStarters].sort())
          const relief = await searchPitchingLines(query, { ...filters, starter: false })
          expect(relief.length).toBeGreaterThan(0)
          expect(relief.every((row) => !expectedStarters.includes(row.pitcherName))).toBe(true)
          const startTotals = await aggregatePitchingLines(query, { ...filters, starter: true })
          expect(startTotals.map((row) => row.label).sort()).toEqual([...expectedStarters].sort())
          expect(startTotals.every((row) => row.total === 1)).toBe(true)
          const batting = await aggregateBattingLines(query, filters)
          expect(batting.length).toBeGreaterThan(0)
          expect(batting.every((row) => row.total === 1)).toBe(true)
          expect(batting.every((row) => JSON.stringify(JSON.parse(String(row.stats.evidenceGameIds))) === JSON.stringify(['r20250815b-l-17']))).toBe(true)
          const gamesTotal = await aggregateGameResults(query, filters)
          expect(gamesTotal.length).toBeGreaterThan(0)
          expect(gamesTotal.every((row) => row.total === 1)).toBe(true)
          expect(gamesTotal.every((row) => JSON.stringify(JSON.parse(String(row.stats.evidenceGameIds))) === JSON.stringify(['r20250815b-l-17']))).toBe(true)
          const recent = await aggregateGameResults(query, { team: 'オリックス', recent_games: 1 })
          expect(recent).toHaveLength(1)
          expect(recent[0]?.total).toBe(1)
          expect(recent[0]?.stats).toMatchObject({ firstGameDate: '2025-08-15', lastGameDate: '2025-08-15',
            evidenceGameIds: '["r20250815b-l-17"]' })
          expect(await searchGames(query, { date_from: '2025-08-16', date_to: '2025-08-31' })).toEqual([])
          expect(await searchGames(query, { date_from: '2025-08-15', date_to: '2025-08-15' })).toHaveLength(1)
        } finally { database.close() }
      }
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
})
