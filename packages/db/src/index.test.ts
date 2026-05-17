import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseRawGameFromDir } from '@npb/parser'
import {
  dbPackage,
  listEventsByGameId,
  migrateDatabase,
  openDatabase,
  resolveMigrationsDir,
  searchEvents,
  searchGames,
  searchPitchingLines,
  sqliteDatabaseToQuery,
  upstreamParserPackage,
} from './index.js'
import { loadRichGame } from './loader'

const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const workspaceRoot = path.resolve(packageRoot, '..', '..')
const fixtureGameDir = path.resolve(
  workspaceRoot,
  'packages',
  'parser',
  'src',
  '__fixtures__',
  'raw',
  '2025',
  '0815',
  'r20250815b-l-17',
)

const secondFixtureGameDir = path.resolve(
  workspaceRoot,
  'packages',
  'parser',
  'src',
  '__fixtures__',
  'raw',
  '2025',
  '0711',
  'db-g-11',
)

describe('@npb/db', () => {
  it('exports package marker', () => {
    expect(dbPackage()).toBe('@npb/db')
  })

  it('resolves workspace dependency on parser', () => {
    expect(upstreamParserPackage()).toBe('@npb/parser')
  })

  it('applies migrations and records them', () => {
    const database = openDatabase()

    try {
      const applied = migrateDatabase(database)
      const migrations = database
        .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
        .all() as Array<{ version: string }>

      expect(applied).toHaveLength(6)
      expect(migrations).toEqual([
        { version: '0001_initial.sql' },
        { version: '0002_chat_usage.sql' },
        { version: '0003_scores_calendar_rebuild.sql' },
        { version: '0004_bis_current.sql' },
        { version: '0005_chat_accounts.sql' },
        { version: '0006_stripe_billing.sql' },
      ])
    } finally {
      database.close()
    }
  })

  it('resolves migrations from a nested Nuxt-like working directory', () => {
    const originalCwd = process.cwd()
    const nestedCwd = path.resolve(workspaceRoot, 'apps', 'web', '.nuxt')
    mkdirSync(nestedCwd, { recursive: true })

    try {
      process.chdir(nestedCwd)
      expect(resolveMigrationsDir()).toBe(path.resolve(packageRoot, 'migrations'))
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('loads one rich game into the normalized tables and keeps events searchable', async () => {
    const database = openDatabase()

    try {
      migrateDatabase(database)
      const richGame = await parseRawGameFromDir(fixtureGameDir)
      const secondRichGame = await parseRawGameFromDir(secondFixtureGameDir)
      const result = loadRichGame(database, richGame)
      loadRichGame(database, secondRichGame)

      expect(result.gameId).toBe('r20250815b-l-17')
      expect(result.insertedEvents).toBeGreaterThan(0)
      expect(
        Number(
          (
            database
              .prepare('SELECT COUNT(*) AS count FROM events WHERE game_id = ?')
              .get(richGame.game_meta.game_id) as { count: number }
          ).count,
        ),
      ).toBe(result.insertedEvents)

      const q = sqliteDatabaseToQuery(database)
      const loadedEvents = await listEventsByGameId(q, richGame.game_meta.game_id)
      expect(loadedEvents.length).toBeGreaterThan(30)
      expect(loadedEvents[0]).toMatchObject({
        gameId: 'r20250815b-l-17',
        gameDate: richGame.game_meta.date,
        sequence: 0,
        eventType: 'game_note',
        eventSubtype: 'starting_pitcher',
      })

      const candidatePlateAppearance = richGame.play_by_play.find(
        (event) =>
          event.event_type === 'plate_appearance' &&
          event.batter?.player?.name &&
          event.pitcher?.name,
      )
      expect(candidatePlateAppearance).toBeTruthy()
      const plateAppearance = candidatePlateAppearance!

      const candidateRunnerEvent = richGame.play_by_play.find(
        (event) =>
          event.event_type === 'runner_event' &&
          event.event_attributes?.runner?.name &&
          event.event_attributes.implied_substitution_subtype === 'pinch_runner',
      )
      expect(candidateRunnerEvent).toBeTruthy()
      const runnerEvent = candidateRunnerEvent!

      const pinchHitterEvent = richGame.play_by_play.find(
        (event) =>
          event.event_type === 'plate_appearance' &&
          event.event_subtype === 'pinch_hitter' &&
          event.batter?.player?.name,
      )
      expect(pinchHitterEvent).toBeTruthy()
      const pinchHitter = pinchHitterEvent!

      const byDate = await searchEvents(q, {
        game_date: richGame.game_meta.date,
        limit: 200,
      })
      expect(byDate.length).toBe(richGame.play_by_play.length)
      expect(byDate.every((event) => event.gameId === richGame.game_meta.game_id)).toBe(true)

      const byInningTeamHalf = await searchEvents(q, {
        game_date: richGame.game_meta.date,
        inning: plateAppearance.inning,
        half: plateAppearance.half,
        team: plateAppearance.offense_team,
      })
      expect(byInningTeamHalf.length).toBeGreaterThan(0)
      expect(
        byInningTeamHalf.some(
          (event) =>
            event.gameId === richGame.game_meta.game_id &&
            event.inning === plateAppearance.inning &&
            event.half === plateAppearance.half &&
            event.offenseTeam === plateAppearance.offense_team,
        ),
      ).toBe(true)

      const byBatterPitcherType = await searchEvents(q, {
        game_date: richGame.game_meta.date,
        batter_name: plateAppearance.batter!.player!.name,
        pitcher_name: plateAppearance.pitcher!.name,
        event_type: plateAppearance.event_type,
      })
      expect(byBatterPitcherType.length).toBeGreaterThan(0)
      expect(
        byBatterPitcherType.some(
          (event) =>
            event.batterName === plateAppearance.batter!.player!.name &&
            event.pitcherName === plateAppearance.pitcher!.name &&
            event.eventType === plateAppearance.event_type,
        ),
      ).toBe(true)

      const pinchHitterEvents = await searchEvents(q, {
        game_date: richGame.game_meta.date,
        batter_name: pinchHitter.batter!.player!.name,
        event_type: 'plate_appearance',
        event_subtype: 'pinch_hitter',
      })
      expect(pinchHitterEvents.length).toBeGreaterThan(0)
      expect(pinchHitterEvents[0]).toMatchObject({
        gameId: 'r20250815b-l-17',
        batterName: pinchHitter.batter!.player!.name,
        eventType: 'plate_appearance',
        eventSubtype: 'pinch_hitter',
      })

      const pinchRunnerEvents = await searchEvents(q, {
        game_date: richGame.game_meta.date,
        runner_name: runnerEvent.event_attributes!.runner!.name,
        event_type: 'runner_event',
      })
      expect(
        pinchRunnerEvents.some(
          (event) => event.runnerName === runnerEvent.event_attributes!.runner!.name,
        ),
      ).toBe(true)
      expect(
        pinchRunnerEvents.some((event) =>
          event.eventAttributesJson?.includes('"implied_substitution_subtype":"pinch_runner"'),
        ),
      ).toBe(true)

      const byLegacyPlayerName = await searchEvents(q, {
        player_name: pinchHitter.batter!.player!.name,
        event_subtype: 'pinch_hitter',
      })
      expect(byLegacyPlayerName.length).toBeGreaterThan(0)

      const gameRows = await searchGames(q, {
        game_date: richGame.game_meta.date,
        limit: 20,
      })
      expect(gameRows.some((g) => g.gameId === richGame.game_meta.game_id)).toBe(true)
      expect(
        gameRows.find((g) => g.gameId === richGame.game_meta.game_id),
      ).toMatchObject({
        gameId: richGame.game_meta.game_id,
        date: richGame.game_meta.date,
        awayTeamName: expect.any(String),
        homeTeamName: expect.any(String),
        matchupText: expect.any(String),
      })

      const pitchingRows = await searchPitchingLines(q, {
        game_date: richGame.game_meta.date,
        limit: 100,
      })
      expect(pitchingRows.length).toBeGreaterThan(0)
      expect(
        pitchingRows.every((row) => row.gameDate === richGame.game_meta.date),
      ).toBe(true)

      const sourceSnapshotCount = (
        database
          .prepare('SELECT COUNT(*) AS count FROM source_snapshots WHERE game_id = ?')
          .get(richGame.game_meta.game_id) as { count: number }
      ).count
      expect(sourceSnapshotCount).toBe(4)
    } finally {
      database.close()
    }
  })
})
