import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from './migrations'
import { runNormalizedD1Sync } from './normalized-d1-sync'
import { openDatabase } from './sqlite'

async function createTempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'npb-normalized-d1-sync-'))
}

describe('runNormalizedD1Sync', () => {
  it('refuses to target the legacy D1 database', async () => {
    await expect(runNormalizedD1Sync({
      sqliteDir: 'data',
      d1Database: 'npb-archive-chat-import',
      dryRun: true,
    })).rejects.toThrow('Normalized D1 sync must target npb-archive-chat-normalized')
  })

  it('builds normalized D1 import SQL from year SQLite files without touching D1 in dry run', async () => {
    const tempRoot = await createTempDir()
    const sqliteDir = path.join(tempRoot, 'data')
    const sqlitePath = path.join(sqliteDir, 'npb-2025.sqlite')
    try {
      const database = openDatabase(sqlitePath)
      try {
        migrateDatabase(database)
        database.exec(`
          INSERT INTO games (
            schema_version, year, mmdd, game_id, canonical_url, date, date_label,
            venue, competition, matchup_text, game_number, status, start_time,
            end_time, duration_text, attendance, away_team_name, away_team_short_name,
            home_team_name, home_team_short_name, linescore_json, result_pitchers_json,
            batteries_json, home_runs_json, latest_order_json, fetched_at, loaded_at
          ) VALUES (
            1, 2025, '0328', 'r20250328b-e-01', 'https://npb.jp/scores/2025/0328/b-e-01/',
            '2025-03-28', '2025年3月28日', '京セラD大阪', 'パ・リーグ',
            '楽天 vs オリックス', 1, 'final', '18:00', '21:00', '3:00', 30000,
            '楽天', '楽天', 'オリックス', 'オリックス',
            '{"away":{"totals":{"runs":2}},"home":{"totals":{"runs":3}}}',
            '[]', '[]', '[]', '[]', '2025-03-28T12:00:00.000Z', '2025-03-28T12:00:00.000Z'
          );

          INSERT INTO source_snapshots (game_id, source_key, source_url, source_path, fetched_at)
          VALUES ('r20250328b-e-01', 'playbyplay', 'https://npb.jp/scores/2025/0328/b-e-01/playbyplay.html', 'data/raw/playbyplay.html', '2025-03-28T12:00:00.000Z');

          INSERT INTO events (
            game_id, event_index, sequence, inning, half, inning_label, offense_team,
            event_type, event_subtype, outs, bases, count_text, batter_name,
            pitcher_name, runner_name, result_text, result_runs_batted_in,
            result_links_json, event_attributes_json, raw_row_html, runs_scored,
            source_url, source_text
          ) VALUES (
            'r20250328b-e-01', 0, 1, 1, 'top', '1回表', '楽天',
            'plate_appearance', 'standard', 'zero', NULL, '1-2より', '浅村',
            '山本', NULL, '空振り三振', 0, '[]',
            '{"batter_links":[{"name":"浅村","url":"https://npb.jp/bis/players/51155118.html"}]}',
            '0アウト 浅村 1-2より 空振り三振', 0,
            'https://npb.jp/scores/2025/0328/b-e-01/playbyplay.html',
            '0アウト 浅村 1-2より 空振り三振'
          );
        `)
      } finally {
        database.close()
      }

      const result = await runNormalizedD1Sync({
        sqliteDir,
        workspaceRoot: tempRoot,
        dryRun: true,
        d1Database: 'npb-archive-chat-normalized',
        verifyDates: ['2025-03-28'],
      })

      expect(result.dryRun).toBe(true)
      expect(result.rowCounts.game_facts).toBe(1)
      expect(result.rowCounts.event_facts).toBe(1)
      expect(result.sqlPaths.length).toBeGreaterThan(0)
      expect(result.dateIntegrity.mismatches).toEqual([])
      expect(result.dateIntegrity.snapshots).toEqual([
        {
          stage: 'year_sqlite',
          date: '2025-03-28',
          counts: { games: 1, events: 1, batting: 0, pitching: 0, roster: 0 },
        },
        {
          stage: 'legacy',
          date: '2025-03-28',
          counts: { games: 1, events: 1, batting: 0, pitching: 0, roster: 0 },
        },
        {
          stage: 'normalized',
          date: '2025-03-28',
          counts: { games: 1, events: 1, batting: 0, pitching: 0, roster: 0 },
        },
        {
          stage: 'd1_pre_import',
          date: '2025-03-28',
          counts: { games: 1, events: 1, batting: 0, pitching: 0, roster: 0 },
        },
      ])

      const cleanupSql = await readFile(
        result.sqlPaths.find((sqlPath) => sqlPath.endsWith('_000_cleanup.sql'))!,
        'utf8',
      )
      expect(cleanupSql).toContain('DELETE FROM "event_facts";')
      expect(cleanupSql).toContain('DELETE FROM "teams";')

      const gameSql = await readFile(
        result.sqlPaths.find((sqlPath) => sqlPath.includes('_game_facts_'))!,
        'utf8',
      )
      expect(gameSql).toContain('INSERT OR REPLACE INTO "game_facts"')

      const eventSql = await readFile(
        result.sqlPaths.find((sqlPath) => sqlPath.includes('_event_facts_'))!,
        'utf8',
      )
      expect(eventSql).toContain('51155118')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('fails before import when a required date is absent from restored year SQLite', async () => {
    const tempRoot = await createTempDir()
    const sqliteDir = path.join(tempRoot, 'data')
    const sqlitePath = path.join(sqliteDir, 'npb-2026.sqlite')
    try {
      const database = openDatabase(sqlitePath)
      migrateDatabase(database)
      database.close()

      await expect(runNormalizedD1Sync({
        sqliteDir,
        workspaceRoot: tempRoot,
        dryRun: true,
        verifyDates: ['2026-05-10'],
      })).rejects.toThrow('Date integrity source is missing games for 2026-05-10')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
