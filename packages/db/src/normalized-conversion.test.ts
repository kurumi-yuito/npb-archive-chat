import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from './migrations'
import { runNormalizeDatabase } from './normalized-conversion'
import { sqliteDatabaseToQuery } from './query-driver'
import { aggregateBattingLines } from './repository/aggregate-repository'
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
            '山本', NULL, 'ホームラン', 1, '[]',
            '{"batter_links":[{"name":"浅村","url":"https://npb.jp/bis/players/51155118.html"}],"count":"1-2より"}',
            '0アウト 浅村 1-2より ホームラン', 1,
            'https://npb.jp/scores/2025/0328/b-e-01/playbyplay.html',
            '0アウト 浅村 1-2より ホームラン'
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
          ), (
            'r20250328b-e-01', '楽天', 1, 2, '二', '牧', 4, 1, 2, 1, 0,
            '[]', '[]', 0, 1, 0, 0, 0, 0, '牧 4打数2安打',
            'https://npb.jp/scores/2025/0328/b-e-01/box.html',
            'https://npb.jp/bis/players/13115153.html'
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
          ), (
            'r20250328b-e-01', 'オリックス', 1, NULL, '佐々木朗', 100, 26,
            '7', 3, 0, 2, 0, 9, 0, 0, 0, 0, '[]', '佐々木朗 7回無失点',
            'https://npb.jp/scores/2025/0328/b-e-01/box.html',
            NULL
          ), (
            'r20250328b-e-01', 'オリックス', 2, NULL, '山崎伊織', 90, 24,
            '6', 4, 0, 1, 0, 7, 0, 0, 1, 1, '[]', '山崎伊織 6回1失点',
            'https://npb.jp/scores/2025/0328/b-e-01/box.html',
            NULL
          );

          INSERT INTO player_profiles (player_id, full_name, canonical_name, source_url)
          VALUES
            ('31035151', '佐々木 朗希', '佐々木 朗希', 'https://npb.jp/bis/players/31035151.html'),
            ('03305153', '山﨑 伊織', '山﨑 伊織', 'https://npb.jp/bis/players/03305153.html');

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

        const profileResolvedPitcher = normalized.prepare(
          `SELECT pitcher_id FROM pitching_line_facts
            INNER JOIN person_names ON person_names.name_id = pitching_line_facts.pitcher_name_id
           WHERE person_names.name = '佐々木朗'`,
        ).get() as { pitcher_id: string | null }
        expect(profileResolvedPitcher.pitcher_id).toBe('31035151')
        const variantResolvedPitcher = normalized.prepare(
          `SELECT pitcher_id FROM pitching_line_facts
            INNER JOIN person_names ON person_names.name_id = pitching_line_facts.pitcher_name_id
           WHERE person_names.name = '山崎伊織'`,
        ).get() as { pitcher_id: string | null }
        expect(variantResolvedPitcher.pitcher_id).toBe('03305153')

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
            resultText: 'ホームラン',
            sourceUrl: 'https://npb.jp/scores/2025/0328/b-e-01/playbyplay.html',
          },
        ])

        const homeRunEvents = await searchEvents(queryDatabase, {
          year: 2025,
          result_text_contains: '本塁打',
          limit: 10,
        })
        expect(homeRunEvents).toHaveLength(1)
        expect(homeRunEvents[0]).toMatchObject({
          gameId: 'r20250328b-e-01',
          batterName: '浅村',
          resultText: 'ホームラン',
        })

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

        const lineupBattingLines = await searchBattingLines(queryDatabase, {
          game_date: '2025-03-28',
          team: '楽天',
          limit: 100,
        })
        expect(lineupBattingLines).toEqual(expect.arrayContaining([
          expect.objectContaining({
            gameId: 'r20250328b-e-01',
            playerName: '浅村',
          }),
        ]))

        const aggregateRows = await aggregateBattingLines(queryDatabase, {
          year: 2025,
          sort_by: 'homeRuns',
          limit: 1,
        })
        expect(aggregateRows).toMatchObject([
          {
            kind: 'batting',
            label: '浅村',
            stats: {
              homeRuns: 1,
              hits: 1,
            },
          },
        ])

        const oneCharacterRegisteredNameRows = await aggregateBattingLines(queryDatabase, {
          year: 2025,
          player_name: '牧秀悟',
          team: '楽天',
          limit: 10,
        })
        expect(oneCharacterRegisteredNameRows).toMatchObject([
          {
            kind: 'batting',
            label: '牧',
            stats: {
              team: '楽天',
              hits: 2,
              homeRuns: 0,
            },
          },
        ])

        const playerIdWithNameFallbackRows = await aggregateBattingLines(queryDatabase, {
          year: 2025,
          player_id: '13115153',
          player_name: '牧秀悟',
          team: '楽天',
          limit: 10,
        })
        expect(playerIdWithNameFallbackRows).toMatchObject([
          {
            kind: 'batting',
            label: '牧',
            stats: {
              team: '楽天',
              hits: 2,
              homeRuns: 0,
            },
          },
        ])

        const ambiguousOneCharacterRows = await aggregateBattingLines(queryDatabase, {
          year: 2025,
          player_name: '牧秀悟',
          limit: 10,
        })
        expect(ambiguousOneCharacterRows).toHaveLength(0)

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

        const metadata = normalized.prepare(
          "SELECT metadata_value AS value FROM normalized_runtime_metadata WHERE metadata_key = 'schema_version'",
        ).get() as { value?: string } | undefined
        expect(metadata?.value).toBe('phase5-normalized-v1')

        const awardCount = normalized.prepare(
          "SELECT COUNT(*) AS count FROM award_facts WHERE year = 2025 AND award_type = 'rookie_of_the_year'",
        ).get() as { count?: number } | undefined
        expect(awardCount?.count).toBe(2)
      } finally {
        normalized.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
