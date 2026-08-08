import { describe, it, expect } from 'vitest'
import {
  chatRequestSchema,
  chatResponseSchema,
  chatStructuredQuerySchema,
  DISCOVERY_GAME_ID_REGEX,
  discoveryGameSchema,
  discoveryYearSchema,
  inningHalfSchema,
  playByPlayEventSubtypeSchema,
  playByPlayEventTypeSchema,
  richGameSchema,
  rawPageKeySchema,
  runnerEventAttributesSchema,
  searchBattingLinesFiltersSchema,
  searchEventsFiltersSchema,
  searchGamesFiltersSchema,
  searchPitchingLinesFiltersSchema,
  z,
} from './index.js'

describe('@npb/schemas', () => {
  it('re-exports zod', () => {
    const schema = z.object({ ok: z.boolean() })
    expect(schema.parse({ ok: true })).toEqual({ ok: true })
  })

  it('rejects discovery gameIds that do not match DISCOVERY_GAME_ID_REGEX', () => {
    const base = {
      year: 2026,
      date: '2026-03-27',
      mmdd: '0327',
      gameNumber: 1,
      competition: 'regular' as const,
      listingType: 'scores' as const,
      listingStatus: 'listed' as const,
      startsAt: null as null,
      venue: 'Tokyo Dome' as const,
      homeTeam: { code: 'g', label: 'Yomiuri' },
      awayTeam: { code: 't', label: 'Hanshin' },
      source: {
        calendarPageUrl: 'https://npb.jp/bis/eng/2026/calendar/',
        dailyPageUrl: 'https://npb.jp/bis/eng/2026/games/gm20260327.html',
      },
      downloader: {
        scoreBaseUrl: 'https://npb.jp/scores/2026/0327/g-t-01',
        pages: {
          index: 'https://npb.jp/scores/2026/0327/g-t-01/index.html',
          playByPlay: 'https://npb.jp/scores/2026/0327/g-t-01/playbyplay.html',
          box: 'https://npb.jp/scores/2026/0327/g-t-01/box.html',
          roster: 'https://npb.jp/scores/2026/0327/g-t-01/roster.html',
        },
      },
    }

    expect(DISCOVERY_GAME_ID_REGEX.test('g-t-01')).toBe(true)
    expect(DISCOVERY_GAME_ID_REGEX.test('r20260327g-t-01')).toBe(true)
    expect(DISCOVERY_GAME_ID_REGEX.test('db-h-17')).toBe(true)

    for (const gameId of ['g-t-1', 'G-t-01', 'g-t-100', 'g_t-01', 'g-t-01 ', '']) {
      expect(() =>
        discoveryGameSchema.parse({
          ...base,
          gameId,
        }),
      ).toThrow()
    }
  })

  it('parses discovery year payloads', () => {
    const payload = {
      schemaVersion: 1,
      year: 2026,
      generatedAt: '2026-04-18T10:00:00+09:00',
      games: [
        {
          year: 2026,
          date: '2026-03-27',
          mmdd: '0327',
          gameId: 'r20260327g-t-01',
          gameNumber: 1,
          competition: 'regular',
          listingType: 'scores',
          listingStatus: 'listed',
          startsAt: '18:00',
          venue: 'Tokyo Dome',
          homeTeam: {
            code: 'g',
            label: 'Yomiuri',
          },
          awayTeam: {
            code: 't',
            label: 'Hanshin',
          },
          source: {
            calendarPageUrl: 'https://npb.jp/bis/eng/2026/calendar/',
            dailyPageUrl: 'https://npb.jp/bis/eng/2026/games/gm20260327.html',
          },
          downloader: {
            scoreBaseUrl: 'https://npb.jp/scores/2026/0327/g-t-01',
            pages: {
              index: 'https://npb.jp/scores/2026/0327/g-t-01/index.html',
              playByPlay:
                'https://npb.jp/scores/2026/0327/g-t-01/playbyplay.html',
              box: 'https://npb.jp/scores/2026/0327/g-t-01/box.html',
              roster: 'https://npb.jp/scores/2026/0327/g-t-01/roster.html',
            },
          },
        },
      ],
    }

    expect(discoveryYearSchema.parse(payload)).toEqual(payload)
  })

  it('accepts optional downloader.bisGamePageUrl on discovery games', () => {
    const payload = {
      schemaVersion: 1,
      year: 2026,
      generatedAt: '2026-04-18T10:00:00+09:00',
      games: [
        {
          year: 2026,
          date: '2026-03-27',
          mmdd: '0327',
          gameId: 'r20260327g-t-01',
          gameNumber: 1,
          competition: 'regular',
          listingType: 'scores',
          listingStatus: 'listed',
          startsAt: null,
          venue: 'Tokyo Dome',
          homeTeam: { code: 'g', label: 'Yomiuri' },
          awayTeam: { code: 't', label: 'Hanshin' },
          source: {
            calendarPageUrl: 'https://npb.jp/bis/eng/2026/calendar/',
            dailyPageUrl: 'https://npb.jp/bis/eng/2026/games/gm20260327.html',
          },
          downloader: {
            scoreBaseUrl: 'https://npb.jp/scores/2026/0327/g-t-01',
            bisGamePageUrl: 'https://npb.jp/bis/eng/2026/games/s2026032701085.html',
            pages: {
              index: 'https://npb.jp/bis/eng/2026/games/s2026032701085.html',
              playByPlay:
                'https://npb.jp/scores/2026/0327/g-t-01/playbyplay.html',
              box: 'https://npb.jp/scores/2026/0327/g-t-01/box.html',
              roster: 'https://npb.jp/scores/2026/0327/g-t-01/roster.html',
            },
          },
        },
      ],
    }

    expect(discoveryYearSchema.parse(payload)).toEqual(payload)
  })

  it('parses raw page keys', () => {
    expect(rawPageKeySchema.parse('playByPlay')).toBe('playByPlay')
  })

  it('exports play-by-play event schemas for downstream reuse', () => {
    expect(playByPlayEventTypeSchema.parse('plate_appearance')).toBe('plate_appearance')
    expect(playByPlayEventSubtypeSchema.parse('pinch_hitter')).toBe('pinch_hitter')
    expect(inningHalfSchema.parse('top')).toBe('top')
    expect(
      runnerEventAttributesSchema.parse({
        runner: {
          name: '髙松',
          url: null,
        },
        implied_substitution_subtype: 'pinch_runner',
      }),
    ).toEqual({
      runner: {
        name: '髙松',
        url: null,
      },
      implied_substitution_subtype: 'pinch_runner',
    })
  })

  it('parses search event filters', () => {
    expect(
      searchEventsFiltersSchema.parse({
        game_date: '2025-08-15',
        inning: 8,
        half: 'bottom',
        team: 'ロッテ',
        batter_name: '山村',
        pitcher_name: '益田',
        runner_name: '髙松',
        event_type: 'runner_event',
        event_subtype: 'stolen_base',
        limit: 25,
      }),
    ).toEqual({
      game_date: '2025-08-15',
      inning: 8,
      half: 'bottom',
      team: 'ロッテ',
      batter_name: '山村',
      pitcher_name: '益田',
      runner_name: '髙松',
      event_type: 'runner_event',
      event_subtype: 'stolen_base',
      limit: 25,
    })
  })

  it('parses search games filters', () => {
    expect(
      searchGamesFiltersSchema.parse({
        game_date: '2025-08-15',
        game_id: 'b-l-17',
        venue: '東京ドーム',
        include_farm: true,
        limit: 50,
      }),
    ).toEqual({
      game_date: '2025-08-15',
      game_id: 'b-l-17',
      venue: '東京ドーム',
      include_farm: true,
      limit: 50,
    })
  })

  it('coerces numeric game_id filters from LLM output', () => {
    expect(searchEventsFiltersSchema.parse({ game_id: 123 }).game_id).toBe('123')
    expect(searchGamesFiltersSchema.parse({ game_id: 123 }).game_id).toBe('123')
    expect(searchPitchingLinesFiltersSchema.parse({ game_id: 123 }).game_id).toBe('123')
    expect(searchBattingLinesFiltersSchema.parse({ game_id: 123 }).game_id).toBe('123')
  })

  it('parses search pitching filters', () => {
    expect(
      searchPitchingLinesFiltersSchema.parse({
        game_date: '2025-08-15',
        pitcher_name: '山本由伸',
        team: 'オリックス',
        limit: 30,
      }),
    ).toEqual({
      game_date: '2025-08-15',
      pitcher_name: '山本由伸',
      team: 'オリックス',
      limit: 30,
    })
  })

  it('parses chat request and structured query payloads', () => {
    expect(chatRequestSchema.parse({ message: '2025-08-15の代打イベントを教えて' })).toEqual({
      message: '2025-08-15の代打イベントを教えて',
    })

    expect(chatRequestSchema.parse({
      message: 'fixtureで実行',
      fixture_structured_query: {
        intent: 'search_pitching',
        filters: { year: 2026, pitcher_name: '藤浪' },
      },
    })).toEqual({
      message: 'fixtureで実行',
      fixture_structured_query: {
        intent: 'search_pitching',
        filters: { year: 2026, pitcher_name: '藤浪' },
      },
    })

    expect(
      chatStructuredQuerySchema.parse({
        intent: 'search_events',
        filters: {
          game_date: '2025-08-15',
          inning: 8,
          half: 'bottom',
          batter_name: '山村',
          event_subtype: 'pinch_hitter',
        },
      }),
    ).toEqual({
      intent: 'search_events',
      filters: {
        game_date: '2025-08-15',
        inning: 8,
        half: 'bottom',
        batter_name: '山村',
        event_subtype: 'pinch_hitter',
      },
    })
  })

  it('parses chat response payloads', () => {
    expect(
      chatResponseSchema.parse({
        message: '山村の代打イベントを教えて',
        structured_query: {
          intent: 'search_events',
          filters: {
            game_date: '2025-08-15',
            batter_name: '山村',
            event_subtype: 'pinch_hitter',
          },
        },
        answer: {
          summary: '条件に一致するイベントが1件あります。',
          result_count: 1,
          source_urls: ['https://npb.jp/scores/2025/0815/b-l-17/playbyplay.html'],
          execution_metadata: {
            data_requirements: ['events'],
            repositories: ['searchEvents'],
            player_id_required: false,
            player_id_satisfied: true,
            follow_up_type: 'standalone',
            referenced_context: null,
            target_entity: null,
            follow_up_context: {
              contextKind: 'unknown',
              inheritedPlayerId: null,
              inheritedPlayerName: null,
              inheritedTeam: null,
              inheritedSeason: null,
              inheritedScope: 'unspecified',
              inheritanceSource: 'none',
              inheritanceConfidence: 0,
              shouldApplyInheritance: false,
            },
            correction_guard: {
              inheritanceBlockedReason: 'none',
              hasAmbiguousCorrection: false,
              hasPlayerReplacement: false,
              hasExplicitSeasonOverride: false,
              hasExplicitScopeOverride: false,
              shouldBlockInheritance: false,
            },
            correction: {
              isCorrection: false,
              target: 'unknown',
              value: { kind: 'unknown' },
              confidence: 0,
            },
            identity_intent: {
              scope: 'unspecified',
              explicitSeasonOverride: false,
              explicitScopeOverride: false,
            },
            target_game_id: null,
            target_player_id: null,
            answer_mode: 'direct_answer',
            identity_resolution_scope: 'unspecified',
          },
        },
        results: {
          events: [
            {
              gameId: 'b-l-17',
              gameDate: '2025-08-15',
              sequence: 10,
              inning: 8,
              half: 'bottom',
              offenseTeam: 'ロッテ',
              eventType: 'plate_appearance',
              eventSubtype: 'pinch_hitter',
              batterName: '山村',
              pitcherName: '益田',
              runnerName: null,
              resultText: '代打で四球',
              eventAttributesJson: null,
            },
          ],
          games: [],
          pitching: [],
          batting: [],
          roster: [],
          affiliations: [],
          gameDetails: [],
          aggregates: [],
        },
        sources: [
          {
            game_id: 'b-l-17',
            source_key: 'playbyplay',
            source_url: 'https://npb.jp/scores/2025/0815/b-l-17/playbyplay.html',
          },
        ],
        usage: {
          plan: 'free',
          timezone: 'Asia/Tokyo',
          asOf: '2026-08-08T00:00:00.000Z',
          limit: 10,
          remaining: 8,
          refillIntervalMinutes: 120,
          nextTokenAt: '2026-08-08T02:00:00.000Z',
          fullAt: '2026-08-08T04:00:00.000Z',
        },
      }),
    ).toMatchObject({
      answer: {
        result_count: 1,
      },
    })
  })

  it('parses rich game payloads', () => {
    const payload = {
      schemaVersion: 1,
      game_meta: {
        year: 2026,
        mmdd: '0327',
        game_id: 'r20260327g-t-01',
        canonical_url: 'https://npb.jp/scores/2026/0327/g-t-01/',
        date: '2026-03-27',
        date_label: '2026年3月27日（金）',
        venue: '東京ドーム',
        competition: 'JERA セ・リーグ公式戦',
        matchup_text: '読売ジャイアンツ vs 阪神タイガース',
        game_number: 1,
        status: '試合終了',
        start_time: '18:18',
        end_time: '20:41',
        duration_text: '2時間23分',
        attendance: 42111,
        umpires: [{ role: '球審', name: '市川貴' }],
        away_team: { name: '阪神タイガース', short_name: '阪神' },
        home_team: { name: '読売ジャイアンツ', short_name: '巨人' },
      },
      top_summary: {
        linescore: {
          innings: ['1', '2'],
          away: {
            team: '阪神タイガース',
            innings: ['0', '0'],
            totals: { runs: 1, hits: 4, errors: 0 },
          },
          home: {
            team: '読売ジャイアンツ',
            innings: ['2', '0'],
            totals: { runs: 3, hits: 6, errors: 0 },
          },
        },
        result_pitchers: {
          winner: {
            label: '勝投手',
            player: {
              name: '竹丸',
              url: 'https://npb.jp/bis/players/71275152.html',
            },
            record_text: '1勝0敗',
          },
          loser: null,
          save: null,
        },
        batteries: [],
        home_runs: [],
        latest_order: [],
      },
      play_by_play: [
        {
          event_index: 0,
          inning: 1,
          half: 'top',
          inning_label: '1回表（阪神の攻撃）',
          offense_team: '阪神',
          pitcher: {
            name: '竹丸',
            url: 'https://npb.jp/bis/players/71275152.html',
          },
          event_type: 'game_note',
          event_subtype: 'starting_pitcher',
          outs: null,
          bases: null,
          batter: null,
          count: null,
          result: {
            text: '（先発投手） 竹丸',
            runs_batted_in: null,
            links: [
              {
                name: '竹丸',
                url: 'https://npb.jp/bis/players/71275152.html',
              },
            ],
          },
          event_attributes: null,
          raw_row_html: '<tr><td colspan="5">x</td></tr>',
        },
      ],
      batting_box: [
        {
          team: '阪神タイガース',
          headers: ['守備', '選手'],
          rows: [
            {
              batting_order: 1,
              position: '(中)',
              player: {
                name: '近本',
                url: 'https://npb.jp/bis/players/71075138.html',
              },
              stats: {
                at_bats: 4,
                runs: 0,
                hits: 0,
                runs_batted_in: 0,
                stolen_bases: 0,
              },
              inning_results: [
                { inning: '1', text: '中飛', classes: [] },
              ],
            },
          ],
          team_totals: {
            at_bats: 29,
            runs: 1,
            hits: 4,
            runs_batted_in: 1,
            stolen_bases: 0,
          },
        },
      ],
      pitching_box: [
        {
          team: '読売ジャイアンツ',
          headers: ['投手'],
          rows: [
            {
              decision: '○',
              pitcher: {
                name: '竹丸',
                url: 'https://npb.jp/bis/players/71275152.html',
              },
              pitch_count: 79,
              batters_faced: 22,
              innings_pitched: '6',
              hits: 3,
              home_runs: 0,
              walks: 2,
              hit_batters: 0,
              strikeouts: 5,
              wild_pitches: 0,
              balks: 0,
              runs: 1,
              earned_runs: 1,
            },
          ],
          team_totals: {
            pitch_count: 109,
            batters_faced: 32,
            innings_pitched: '9',
            hits: 4,
            home_runs: 0,
            walks: 2,
            hit_batters: 1,
            strikeouts: 6,
            wild_pitches: 0,
            balks: 0,
            runs: 1,
            earned_runs: 1,
          },
        },
      ],
      roster: [
        {
          team: '阪神タイガース',
          groups: [
            {
              label: '投手',
              entries: [
                {
                  number: '41',
                  player: {
                    name: '村上',
                    url: 'https://npb.jp/bis/players/13315153.html',
                  },
                  throws: '右',
                  bats: '左',
                  raw_handedness: '右投左打',
                },
              ],
            },
          ],
        },
      ],
      sources: {
        index: {
          url: 'https://npb.jp/scores/2026/0327/g-t-01/',
          path: 'data/raw/2026/0327/r20260327g-t-01/index.html',
        },
        playbyplay: {
          url: 'https://npb.jp/scores/2026/0327/g-t-01/playbyplay.html',
          path: 'data/raw/2026/0327/r20260327g-t-01/playbyplay.html',
        },
        box: {
          url: 'https://npb.jp/scores/2026/0327/g-t-01/box.html',
          path: 'data/raw/2026/0327/r20260327g-t-01/box.html',
        },
        roster: {
          url: 'https://npb.jp/scores/2026/0327/g-t-01/roster.html',
          path: 'data/raw/2026/0327/r20260327g-t-01/roster.html',
        },
      },
      fetched_at: '2026-04-18T10:00:00+09:00',
    }

    expect(richGameSchema.parse(payload)).toEqual(payload)
  })
})
