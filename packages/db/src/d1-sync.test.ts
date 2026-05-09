import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateDatabase, openDatabase } from './index.js'
import { runD1Sync } from './d1-sync'

async function createTempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'npb-db-sync-'))
}

describe('runD1Sync', () => {
  it('exports a year SQLite file into a D1 import SQL file', async () => {
    const tempRoot = await createTempDir()
    const sqliteDir = path.join(tempRoot, 'data')
    const sqlitePath = path.join(sqliteDir, 'npb-2025.sqlite')
    await rm(sqliteDir, { recursive: true, force: true })
    await rm(path.join(tempRoot, 'logs'), { recursive: true, force: true })

    const database = openDatabase(sqlitePath)
    try {
      migrateDatabase(database)
      database.prepare(
        `INSERT INTO games (
          schema_version, year, mmdd, game_id, canonical_url, date, date_label, venue,
          competition, matchup_text, game_number, status, start_time, end_time,
          duration_text, attendance, away_team_name, away_team_short_name,
          home_team_name, home_team_short_name, linescore_json, result_pitchers_json,
          batteries_json, home_runs_json, latest_order_json, fetched_at, loaded_at
        ) VALUES (
          1, 2025, '0815', 'r20250815b-l-17', 'https://npb.jp/scores/2025/0815/b-l-17/index.html',
          '2025-08-15', '2025年8月15日', '大阪', 'regular', 'A vs B', 1, 'final',
          null, null, null, null, 'A', 'A', 'B', 'B', '[]', '[]', '[]', '[]', '[]',
          '2025-08-15T00:00:00.000Z', '2025-08-15T00:00:00.000Z'
        )`,
      ).run()
      database.prepare(
        `INSERT INTO events (
          game_id, event_index, sequence, inning, half, inning_label, offense_team,
          event_type, event_subtype, outs, bases, count_text, batter_role_prefix,
          batter_name, batter_url, batter_raw_text, pitcher_name, pitcher_url,
          runner_name, runner_url, result_text, result_runs_batted_in,
          result_links_json, event_attributes_json, raw_row_html
        ) VALUES (
          'r20250815b-l-17', 0, 0, 1, 'top', '1回表', 'A', 'game_note', 'starting_pitcher',
          null, null, null, null, 'Test Batter', null, null, 'Test Pitcher', null,
          null, null, 'Test result', 0, '[]', null, '<tr></tr>'
        )`,
      ).run()
    } finally {
      database.close()
    }

    const result = await runD1Sync({
      sqliteDir,
      workspaceRoot: tempRoot,
      dryRun: true,
      d1Database: 'npb-archive-chat-import',
    })

    expect(result.totalRows).toBeGreaterThan(0)
    expect(result.years).toHaveLength(1)
    expect(result.years[0]?.rowCounts.games).toBe(1)
    expect(result.years[0]?.rowCounts.events).toBe(1)

    const sql = await readFile(result.years[0]!.sqlPath, 'utf8')
    expect(sql).toContain('DELETE FROM "games" WHERE year = 2025;')
    expect(sql).toContain('INSERT OR REPLACE INTO "games" ("schema_version", "year", "mmdd", "game_id"')
    expect(sql).toContain('DELETE FROM "events" WHERE game_id LIKE \'r2025%\';')
  })
})
