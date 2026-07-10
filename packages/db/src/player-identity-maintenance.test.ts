import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateDatabase, openDatabase } from './index.js'
import { materializePlayerIdentityArtifacts, runPlayerIdentityBackfill } from './player-identity-maintenance.js'

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'npb-player-identity-'))
}

describe('player identity maintenance', () => {
  it('materializes aliases, sources, and backfills player ids and source urls', () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      database.prepare(
        `INSERT INTO player_profiles (
          player_id, full_name, team_name, year_teams_json, source_url, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        '12345678',
        '石田裕太郎',
        '横浜DeNAベイスターズ',
        JSON.stringify({ 2025: '横浜DeNAベイスターズ' }),
        'https://npb.jp/bis/players/12345678.html',
        '2026-07-10T00:00:00.000Z',
      )
      database.prepare(
        `INSERT INTO games (
          schema_version, year, mmdd, game_id, canonical_url, date, date_label, venue,
          competition, matchup_text, game_number, status, start_time, end_time,
          duration_text, attendance, away_team_name, away_team_short_name,
          home_team_name, home_team_short_name, linescore_json, result_pitchers_json,
          batteries_json, home_runs_json, latest_order_json, fetched_at, loaded_at
        ) VALUES (
          1, 2025, '0815', 'r20250815b-l-17', 'https://npb.jp/scores/2025/0815/b-l-17/index.html',
          '2025-08-15', '2025年8月15日', '横浜', 'regular', '横浜DeNA vs 千葉ロッテ', 1, 'final',
          NULL, NULL, NULL, NULL, '千葉ロッテマリーンズ', 'ロッテ', '横浜DeNAベイスターズ', 'DeNA',
          '[]', '[]', '[]', '[]', '[]', '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z'
        )`,
      ).run()
      database.prepare(
        `INSERT INTO source_snapshots (game_id, source_key, source_url, source_path, fetched_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        'r20250815b-l-17',
        'playbyplay',
        'https://npb.jp/scores/2025/0815/b-l-17/playbyplay.html',
        'data/raw/2025/0815/r20250815b-l-17/playbyplay.html',
        '2026-07-10T00:00:00.000Z',
      )
      database.prepare(
        `INSERT INTO events (
          game_id, event_index, sequence, inning, half, inning_label, offense_team, event_type,
          event_subtype, result_text, result_links_json, raw_row_html
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        'r20250815b-l-17',
        0,
        0,
        1,
        'top',
        '1回表',
        '千葉ロッテマリーンズ',
        'game_note',
        'starting_pitcher',
        'Test event',
        '[]',
        '<tr></tr>',
      )
      database.prepare(
        `INSERT INTO current_team_roster (
          year, team_id, team_name, player_key, player_id, player_name, position,
          uniform_number, bats, throws, source_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        2025,
        'db',
        '横浜DeNAベイスターズ',
        'name:石田裕太郎',
        null,
        '石田裕太郎',
        '投手',
        '14',
        'R',
        'R',
        'https://npb.jp/bis/players/12345678.html',
      )
      database.prepare(
        `INSERT INTO player_batting_stats (
          year, team_id, team_name, player_key, player_id, player_name, row_index, values_json, source_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        2025,
        'db',
        '横浜DeNAベイスターズ',
        'name:石田裕太郎',
        null,
        '石田裕太郎',
        0,
        '{}',
        'https://npb.jp/bis/2025/stats/idb1_db.html',
      )

      const result = materializePlayerIdentityArtifacts(database, 2026)

      expect(result.playerProfilesUpdated).toBeGreaterThan(0)
      expect(result.playerAliasesUpserted).toBeGreaterThan(0)
      expect(result.playerSourcesUpserted).toBeGreaterThan(0)
      expect(result.rosterPlayerIdsBackfilled).toBe(1)
      expect(result.playerStatIdsBackfilled).toBe(1)
      expect(result.eventSourceUrlsBackfilled).toBe(1)

      const profile = database.prepare(
        'SELECT canonical_name, current_team, active, metadata FROM player_profiles WHERE player_id = ?',
      ).get('12345678') as { canonical_name: string; current_team: string; active: number; metadata: string }
      expect(profile).toMatchObject({
        canonical_name: '石田裕太郎',
        current_team: '横浜DeNAベイスターズ',
        active: 1,
      })
      expect(JSON.parse(profile.metadata)).toEqual(
        expect.objectContaining({
          year_teams_json: expect.any(String),
          source_url: 'https://npb.jp/bis/players/12345678.html',
        }),
      )

      const aliasCount = database.prepare('SELECT COUNT(*) AS count FROM player_aliases').get() as { count: number }
      const sourceCount = database.prepare('SELECT COUNT(*) AS count FROM player_sources').get() as { count: number }
      expect(aliasCount.count).toBeGreaterThan(0)
      expect(sourceCount.count).toBeGreaterThan(0)

      const roster = database.prepare(
        'SELECT player_id FROM current_team_roster WHERE year = ? AND team_id = ? AND player_name = ?',
      ).get(2025, 'db', '石田裕太郎') as { player_id: string }
      expect(roster.player_id).toBe('12345678')

      const batting = database.prepare(
        'SELECT player_id FROM player_batting_stats WHERE year = ? AND team_id = ? AND player_name = ?',
      ).get(2025, 'db', '石田裕太郎') as { player_id: string }
      expect(batting.player_id).toBe('12345678')

      const event = database.prepare('SELECT source_url FROM events WHERE game_id = ?').get('r20250815b-l-17') as { source_url: string }
      expect(event.source_url).toBe('https://npb.jp/scores/2025/0815/b-l-17/playbyplay.html')
    } finally {
      database.close()
    }
  })

  it('backfills multiple sqlite files through the maintenance CLI helper', async () => {
    const tempRoot = await createTempDir()
    const sqliteDir = path.join(tempRoot, 'data')
    await rm(sqliteDir, { recursive: true, force: true })
    await rm(path.join(tempRoot, 'logs'), { recursive: true, force: true })
    const sqlitePath = path.join(sqliteDir, 'npb-2026.sqlite')
    const database = openDatabase(sqlitePath)
    try {
      migrateDatabase(database)
      database.prepare(
        `INSERT INTO player_profiles (player_id, full_name, team_name, year_teams_json, source_url, fetched_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('87654321', '東克樹', '横浜DeNAベイスターズ', '{}', 'https://npb.jp/bis/players/87654321.html', '2026-07-10T00:00:00.000Z')
    } finally {
      database.close()
    }

    const result = runPlayerIdentityBackfill({ sqliteDir })
    expect(result.dryRun).toBe(false)
    expect(result.years).toHaveLength(1)
    expect(result.totals.playerProfilesUpdated).toBeGreaterThan(0)
    await rm(tempRoot, { recursive: true, force: true })
  })
})
