import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseRawGameFromDir } from '@npb/parser'
import {
  dbPackage,
  listEventsByGameId,
  migrateDatabase,
  openDatabase,
  resolveMigrationsDir,
  searchBattingLines,
  searchEvents,
  searchGames,
  searchPitchingLines,
  sqliteDatabaseToQuery,
  upstreamParserPackage,
} from './index.js'
import { createMultiYearQueryService, createSingleDatabaseQueryService } from './multi-year-query-service.js'
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

      expect(applied).toHaveLength(10)
      expect(migrations).toEqual([
        { version: '0001_initial.sql' },
        { version: '0002_chat_usage.sql' },
        { version: '0003_scores_calendar_rebuild.sql' },
        { version: '0004_bis_current.sql' },
        { version: '0005_chat_accounts.sql' },
        { version: '0006_stripe_billing.sql' },
        { version: '0007_google_auth_accounts.sql' },
        { version: '0008_player_profiles.sql' },
        { version: '0009_canonical_player_identity.sql' },
        { version: '0010_chat_usage_token_buckets.sql' },
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

      const batterPlayerId = plateAppearance.batter!.player!.url?.match(/\/players\/([^/]+)\.html/u)?.[1]
      expect(batterPlayerId).toBeTruthy()
      const byBatterPlayerId = await searchEvents(q, {
        game_date: richGame.game_meta.date,
        batter_name: `${plateAppearance.batter!.player!.name} フルネーム`,
        batter_player_id: batterPlayerId!,
        event_type: plateAppearance.event_type,
      })
      expect(byBatterPlayerId.length).toBeGreaterThan(0)
      expect(byBatterPlayerId.some((event) => event.batterName === plateAppearance.batter!.player!.name)).toBe(true)

      const battingByPlayerId = await searchBattingLines(q, {
        game_date: richGame.game_meta.date,
        player_name: `${plateAppearance.batter!.player!.name} フルネーム`,
        player_id: batterPlayerId!,
      })
      expect(battingByPlayerId.length).toBeGreaterThan(0)
      expect(battingByPlayerId.some((line) => line.playerName === plateAppearance.batter!.player!.name)).toBe(true)

      const pitcherPlayerId = plateAppearance.pitcher!.url?.match(/\/players\/([^/]+)\.html/u)?.[1]
      expect(pitcherPlayerId).toBeTruthy()
      const pitchingByPlayerId = await searchPitchingLines(q, {
        game_date: richGame.game_meta.date,
        pitcher_name: `${plateAppearance.pitcher!.name} フルネーム`,
        pitcher_player_id: pitcherPlayerId!,
      })
      expect(pitchingByPlayerId.length).toBeGreaterThan(0)
      expect(pitchingByPlayerId.some((line) => line.pitcherName === plateAppearance.pitcher!.name)).toBe(true)

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

  it('searchPitchingLines deduplicates BIS rows when the same player appears in multiple year DBs', async () => {
    const sqliteDir = path.join(tmpdir(), `npb-test-dedup-${Date.now()}`)
    mkdirSync(sqliteDir, { recursive: true })

    const bisRow = {
      year: 2026,
      team_id: 'db',
      team_name: '横浜DeNAベイスターズ',
      player_key: 'name:藤浪 晋太郎',
      player_id: null,
      player_name: '藤浪 晋太郎',
      row_index: 1,
      values_json: JSON.stringify({ 選手: '藤浪 晋太郎', 登板: '4', 三振: '11', 投球回: '9', 防御率: '2.00' }),
      source_url: 'https://npb.jp/bis/2026/stats/idp2_db.html',
    }

    // 同じBIS行を2つのDBに挿入（deployed環境で2025/2026両方のDBに同じ行が入る状況を再現）
    for (const yearFile of ['npb-2025.sqlite', 'npb-2026.sqlite']) {
      const db = openDatabase(path.join(sqliteDir, yearFile))
      migrateDatabase(db)
      db.prepare(
        `INSERT INTO player_pitching_stats
          (year, team_id, team_name, player_key, player_id, player_name, row_index, values_json, source_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        bisRow.year, bisRow.team_id, bisRow.team_name, bisRow.player_key,
        bisRow.player_id, bisRow.player_name, bisRow.row_index,
        bisRow.values_json, bisRow.source_url,
      )
      db.close()
    }

    const service = createMultiYearQueryService({ sqliteDir, years: [2025, 2026] })
    try {
      const rows = await service.searchPitchingLines({ pitcher_name: '藤浪' })

      // dedupにより1件のみ返る（2件返るのは誤り）
      expect(rows).toHaveLength(1)
      expect(rows[0].pitcherName).toBe('藤浪 晋太郎')
      expect(rows[0].sourceKind).toBe('bis_pitching_farm')
      expect(rows[0].gameDate.slice(0, 4)).toBe('2026')
    } finally {
      service.close()
      rmSync(sqliteDir, { recursive: true, force: true })
    }
  })

  it('searchPitchingLines puts BIS first then all box-score rows regardless of age when BIS data exists', async () => {
    const sqliteDir = path.join(tmpdir(), `npb-test-recencyfilter-${Date.now()}`)
    mkdirSync(sqliteDir, { recursive: true })

    const insertGame = (db: ReturnType<typeof openDatabase>, gameId: string, year: number, date: string) => {
      const mmdd = date.slice(5).replace('-', '')
      db.prepare(
        `INSERT INTO games
          (schema_version, game_id, year, mmdd, date, date_label, venue, canonical_url, matchup_text,
           away_team_name, home_team_name, linescore_json, result_pitchers_json,
           batteries_json, home_runs_json, latest_order_json, fetched_at, loaded_at)
         VALUES (1, ?, ?, ?, ?, ?, '甲子園', 'https://example.com', 'A vs B',
                 'A', 'B', '{}', '{}', '{}', '{}', '{}', datetime('now'), datetime('now'))`,
      ).run(gameId, year, mmdd, date, `${year}年テスト`)
    }
    const insertPitchingLine = (db: ReturnType<typeof openDatabase>, gameId: string, team: string) => {
      db.prepare(
        `INSERT INTO pitching_lines
          (game_id, team, pitcher_name, innings_pitched, pitch_count, batters_faced,
           hits, home_runs, walks, hit_batters, strikeouts, wild_pitches, balks,
           runs, earned_runs, headers_json, row_index)
         VALUES (?, ?, '藤浪 晋太郎', '7', 110, 25, 3, 0, 2, 0, 9, 0, 0, 0, 0, '{}', 1)`,
      ).run(gameId, team)
    }

    // 2026 DB: BIS farm row (今シーズン)
    const db2026 = openDatabase(path.join(sqliteDir, 'npb-2026.sqlite'))
    migrateDatabase(db2026)
    db2026.prepare(
      `INSERT INTO player_pitching_stats
        (year, team_id, team_name, player_key, player_id, player_name, row_index, values_json, source_url)
       VALUES (2026, 'db', '横浜DeNAベイスターズ', 'name:藤浪 晋太郎', '', '藤浪 晋太郎', 1, ?, ?)`,
    ).run(JSON.stringify({ 登板: '4', 三振: '11', 防御率: '2.00' }), 'https://npb.jp/bis/2026/stats/idp2_db.html')
    db2026.close()

    // 2025 DB: box score rows（前シーズン）
    const db2025 = openDatabase(path.join(sqliteDir, 'npb-2025.sqlite'))
    migrateDatabase(db2025)
    insertGame(db2025, 'r20250831h-s-01', 2025, '2025-08-31')
    insertPitchingLine(db2025, 'r20250831h-s-01', '阪神タイガース')
    db2025.close()

    // 2022 DB: box score rows（古い年 → 年指定クエリで使えるよう全件保持）
    const db2022 = openDatabase(path.join(sqliteDir, 'npb-2022.sqlite'))
    migrateDatabase(db2022)
    insertGame(db2022, 'r20220831h-s-01', 2022, '2022-08-31')
    insertPitchingLine(db2022, 'r20220831h-s-01', '阪神タイガース')
    db2022.close()

    const service = createMultiYearQueryService({ sqliteDir, years: [2022, 2025, 2026] })
    try {
      // フルネームで検索（苗字のみだと pitching_lines の LIKE 条件にマッチしない）
      const rows = await service.searchPitchingLines({ pitcher_name: '藤浪 晋太郎' })

      // recent なし: BIS（今シーズン）が先頭、次に box score 全件（年代フィルタなし・昇順）
      expect(rows).toHaveLength(3)
      expect(rows[0].sourceKind).toBe('bis_pitching_farm')
      expect(rows[0].gameDate.slice(0, 4)).toBe('2026')
      // box rows は runAcrossYears の昇順ソートにより 2022 → 2025 の順
      expect(rows[1].sourceKind).toBe('box')
      expect(rows[1].gameDate.slice(0, 4)).toBe('2022')
      expect(rows[2].sourceKind).toBe('box')
      expect(rows[2].gameDate.slice(0, 4)).toBe('2025')

      // recent=true: BIS（今シーズン）が先頭、box は BIS年-1（2025）のみ。2022 は含まれない
      const recentRows = await service.searchPitchingLines({ pitcher_name: '藤浪 晋太郎', recent: true })
      expect(recentRows).toHaveLength(2)
      expect(recentRows[0].sourceKind).toBe('bis_pitching_farm')
      expect(recentRows[0].gameDate.slice(0, 4)).toBe('2026')
      expect(recentRows[1].sourceKind).toBe('box')
      expect(recentRows[1].gameDate.slice(0, 4)).toBe('2025')
      expect(recentRows.every((r) => r.gameDate.slice(0, 4) !== '2022')).toBe(true)
    } finally {
      service.close()
      rmSync(sqliteDir, { recursive: true, force: true })
    }
  })

  it('single database searchPitchingLines returns BIS rows for year-filtered player_id recent lookups', async () => {
    const db = openDatabase(':memory:')
    migrateDatabase(db)
    db.prepare(
      `INSERT INTO player_pitching_stats
        (year, team_id, team_name, player_key, player_id, player_name, row_index, values_json, source_url)
       VALUES (2026, 'db', '横浜DeNAベイスターズ', 'name:藤浪 晋太郎', null, '藤浪 晋太郎', 1, ?, ?)`,
    ).run(
      JSON.stringify({ 選手: '藤浪 晋太郎', 登板: '5', 三振: '19', 投球回: '14', 自責点: '3', 防御率: '1.93' }),
      'https://npb.jp/bis/2026/stats/idp2_db.html',
    )

    const service = createSingleDatabaseQueryService(sqliteDatabaseToQuery(db))
    try {
      const rows = await service.searchPitchingLines({
        year: 2026,
        pitcher_name: '藤浪 晋太郎',
        pitcher_player_id: '41045137',
        team: '横浜DeNAベイスターズ',
        recent: false,
        limit: 20,
      })

      expect(rows).toHaveLength(1)
      expect(rows[0].sourceKind).toBe('bis_pitching_farm')
      expect(rows[0].gameDate.slice(0, 4)).toBe('2026')
      expect(rows[0].pitcherName).toBe('藤浪 晋太郎')
      expect(rows[0].strikeouts).toBe(19)
    } finally {
      service.close()
    }
  })
})
