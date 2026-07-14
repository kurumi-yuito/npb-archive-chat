import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from './migrations'
import { runNormalizeDatabase } from './normalized-conversion'
import { sqliteDatabaseToQuery } from './query-driver'
import { searchBattingLines } from './repository/batting-repository'
import { searchEvents } from './repository/events-repository'
import { searchRosterEntries } from './repository/roster-repository'
import { openDatabase } from './sqlite'

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations-normalized',
)

describe('runNormalizeDatabase', () => {
  it('converts canonical facts into normalized facts with compatibility views', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'npb-normalized-'))
    try {
      const source = path.join(dir, 'legacy.sqlite')
      const target = path.join(dir, 'normalized.sqlite')
      const legacy = openDatabase(source)
      try {
        migrateDatabase(legacy)
        legacy.exec(`
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
          VALUES
            ('r20250328b-e-01', 'index', 'https://npb.jp/scores/2025/0328/b-e-01/', 'data/raw/index.html', '2025-03-28T12:00:00.000Z'),
            ('r20250328b-e-01', 'playbyplay', 'https://npb.jp/scores/2025/0328/b-e-01/playbyplay.html', 'data/raw/playbyplay.html', '2025-03-28T12:00:00.000Z'),
            ('r20250328b-e-01', 'box', 'https://npb.jp/scores/2025/0328/b-e-01/box.html', 'data/raw/box.html', '2025-03-28T12:00:00.000Z'),
            ('r20250328b-e-01', 'roster', 'https://npb.jp/scores/2025/0328/b-e-01/roster.html', 'data/raw/roster.html', '2025-03-28T12:00:00.000Z');

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
            '{"batter_links":[{"name":"浅村","url":"https://npb.jp/bis/players/51155118.html"}],"count":"1-2より"}',
            '0アウト 浅村 1-2より 空振り三振', 0,
            'https://npb.jp/scores/2025/0328/b-e-01/playbyplay.html',
            '0アウト 浅村 1-2より 空振り三振'
          );

          INSERT INTO batting_lines (
            game_id, team, row_index, batting_order, position, player_name, at_bats,
            runs, hits, runs_batted_in, stolen_bases, inning_results_json, headers_json,
            strikeouts, walks, hit_by_pitch, sacrifice_hits, sacrifice_flies, errors, raw_text, source_url,
            player_url
          ) VALUES (
            'r20250328b-e-01', '楽天', 0, 1, '二', '浅村', 4, 0, 1, 0, 0,
            '[]', '[]', 1, 0, 0, 0, 0, 0, '浅村 4打数1安打',
            'https://npb.jp/scores/2025/0328/b-e-01/box.html',
            'https://npb.jp/bis/players/51155118.html'
          );

          INSERT INTO pitching_lines (
            game_id, team, row_index, decision, pitcher_name, pitch_count, batters_faced,
            innings_pitched, hits, home_runs, walks, hit_batters, strikeouts,
            wild_pitches, balks, runs, earned_runs, headers_json, raw_text, source_url,
            pitcher_url
          ) VALUES (
            'r20250328b-e-01', 'オリックス', 0, 'W', '山本', 99, 25,
            '7', 4, 0, 1, 0, 8, 0, 0, 1, 1, '[]', '山本 7回1失点',
            'https://npb.jp/scores/2025/0328/b-e-01/box.html',
            'https://npb.jp/bis/players/53355118.html'
          );

          INSERT INTO roster_entries (
            game_id, team, group_label, entry_index, number, player_name, raw_handedness,
            uniform_number, position, raw_text, source_url, player_url
          ) VALUES (
            'r20250328b-e-01', '楽天', '野手', 0, '3', '浅村', '', '3', '内野手',
            '3 浅村', 'https://npb.jp/scores/2025/0328/b-e-01/roster.html',
            'https://npb.jp/bis/players/51155118.html'
          );
        `)
      } finally {
        legacy.close()
      }

      const result = runNormalizeDatabase({
        source,
        target,
        migrationsDir,
      })

      expect(result.parity.ok).toBe(true)
      expect(result.rowCounts.event_facts).toBe(1)
      expect(result.rowCounts.source_snapshot_facts).toBe(4)

      const normalized = openDatabase(target)
      try {
        const eventFact = normalized.prepare('SELECT * FROM event_facts').get() as {
          batter_player_id: string | null
          source_snapshot_id: number | null
        }
        expect(eventFact.batter_player_id).toBe('51155118')
        expect(eventFact.source_snapshot_id).toBeTypeOf('number')

        const compatibilityEvent = normalized.prepare('SELECT batter_name, batter_url, source_url FROM events').get() as {
          batter_name: string
          batter_url: string
          source_url: string
        }
        expect(compatibilityEvent).toMatchObject({
          batter_name: '浅村',
          batter_url: 'https://npb.jp/bis/players/51155118.html',
          source_url: 'https://npb.jp/scores/2025/0328/b-e-01/playbyplay.html',
        })

        const queryDatabase = sqliteDatabaseToQuery(normalized)
        const events = await searchEvents(queryDatabase, {
          batter_player_id: '51155118',
          limit: 1,
        })
        expect(events).toMatchObject([
          {
            gameId: 'r20250328b-e-01',
            batterName: '浅村',
            resultText: '空振り三振',
            sourceUrl: 'https://npb.jp/scores/2025/0328/b-e-01/playbyplay.html',
          },
        ])

        const battingLines = await searchBattingLines(queryDatabase, {
          player_id: '51155118',
          limit: 1,
        })
        expect(battingLines).toMatchObject([
          {
            gameId: 'r20250328b-e-01',
            playerName: '浅村',
            sourceUrl: 'https://npb.jp/scores/2025/0328/b-e-01/box.html',
          },
        ])

        const rosterEntries = await searchRosterEntries(queryDatabase, {
          player_id: '51155118',
          limit: 1,
        })
        expect(rosterEntries).toMatchObject([
          {
            gameId: 'r20250328b-e-01',
            playerName: '浅村',
          },
        ])
      } finally {
        normalized.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
