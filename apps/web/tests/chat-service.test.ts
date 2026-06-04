import { describe, expect, it } from 'vitest'
import {
  migrateDatabase,
  openDatabase,
  sqliteDatabaseToQuery,
  type ChatQueryService,
} from '@npb/db'
import { richGameSchema } from '@npb/schemas'
import { loadRichGame } from '../../../packages/db/src/loader'
import { createChatService } from '../server/services/chat-service'

function buildFixtureRichGame() {
  return richGameSchema.parse({
    schemaVersion: 1,
    game_meta: {
      year: 2025,
      mmdd: '0815',
      game_id: 'r20250815b-l-17',
      canonical_url: 'https://npb.jp/scores/2025/0815/b-l-17/',
      date: '2025-08-15',
      date_label: '2025年8月15日（金）',
      venue: 'ZOZOマリンスタジアム',
      competition: 'パ・リーグ公式戦',
      matchup_text: 'オリックス・バファローズ vs 千葉ロッテマリーンズ',
      game_number: 17,
      status: '試合終了',
      start_time: '18:00',
      end_time: '20:45',
      duration_text: '2時間45分',
      attendance: 24123,
      umpires: [{ role: '球審', name: '山口' }],
      away_team: { name: 'オリックス・バファローズ', short_name: 'オリックス' },
      home_team: { name: '千葉ロッテマリーンズ', short_name: 'ロッテ' },
    },
    top_summary: {
      linescore: {
        innings: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
        away: {
          team: 'オリックス・バファローズ',
          innings: ['0', '0', '0', '0', '0', '0', '0', '1', '0'],
          totals: { runs: 1, hits: 5, errors: 0 },
        },
        home: {
          team: '千葉ロッテマリーンズ',
          innings: ['0', '0', '1', '0', '0', '0', '0', '2', 'x'],
          totals: { runs: 3, hits: 7, errors: 0 },
        },
      },
      result_pitchers: {
        winner: null,
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
        inning_label: '1回表',
        offense_team: 'オリックス',
        pitcher: { name: '益田', url: 'https://npb.jp/bis/players/masuda.html' },
        event_type: 'game_note',
        event_subtype: 'starting_pitcher',
        outs: null,
        bases: null,
        batter: null,
        count: null,
        result: {
          text: '（先発投手） 益田',
          runs_batted_in: null,
          links: [{ name: '益田', url: 'https://npb.jp/bis/players/masuda.html' }],
        },
        event_attributes: null,
        raw_row_html: '<tr><td colspan="5">starting pitcher</td></tr>',
      },
      {
        event_index: 1,
        inning: 8,
        half: 'bottom',
        inning_label: '8回裏',
        offense_team: 'ロッテ',
        pitcher: { name: '山田', url: 'https://npb.jp/bis/players/yamada.html' },
        event_type: 'plate_appearance',
        event_subtype: 'pinch_hitter',
        outs: '1',
        bases: '一塁',
        batter: {
          role_prefix: '代打',
          player: { name: '山村', url: 'https://npb.jp/bis/players/yamamura.html' },
          raw_text: '代打・山村',
        },
        count: '2-2',
        result: {
          text: '代打・山村 四球',
          runs_batted_in: null,
          links: [{ name: '山村', url: 'https://npb.jp/bis/players/yamamura.html' }],
        },
        event_attributes: null,
        raw_row_html: '<tr><td>pinch hitter</td></tr>',
      },
      {
        event_index: 2,
        inning: 8,
        half: 'bottom',
        inning_label: '8回裏',
        offense_team: 'ロッテ',
        pitcher: { name: '山田', url: 'https://npb.jp/bis/players/yamada.html' },
        event_type: 'runner_event',
        event_subtype: 'stolen_base',
        outs: '1',
        bases: '一塁',
        batter: null,
        count: null,
        result: {
          text: '髙松が二塁盗塁成功',
          runs_batted_in: null,
          links: [{ name: '髙松', url: 'https://npb.jp/bis/players/takamatsu.html' }],
        },
        event_attributes: {
          runner: { name: '髙松', url: 'https://npb.jp/bis/players/takamatsu.html' },
          implied_substitution_subtype: 'pinch_runner',
        },
        raw_row_html: '<tr><td>stolen base</td></tr>',
      },
      {
        event_index: 3,
        inning: 9,
        half: 'top',
        inning_label: '9回表',
        offense_team: 'オリックス',
        pitcher: { name: '益田', url: 'https://npb.jp/bis/players/masuda.html' },
        event_type: 'plate_appearance',
        event_subtype: 'standard',
        outs: '0',
        bases: 'なし',
        batter: {
          role_prefix: null,
          player: { name: '山田', url: 'https://npb.jp/bis/players/yamada.html' },
          raw_text: '山田',
        },
        count: '1-0',
        result: {
          text: 'レフトソロホームラン（打点1）',
          runs_batted_in: 1,
          links: [{ name: '山田', url: 'https://npb.jp/bis/players/yamada.html' }],
        },
        event_attributes: null,
        raw_row_html: '<tr><td>home run</td></tr>',
      },
    ],
    batting_box: [
      {
        team: '千葉ロッテマリーンズ',
        headers: ['打順', '守備', '選手'],
        rows: [
          {
            batting_order: 7,
            position: '(打)',
            player: { name: '山村', url: 'https://npb.jp/bis/players/yamamura.html' },
            stats: {
              at_bats: 0,
              runs: 1,
              hits: 0,
              runs_batted_in: 0,
              stolen_bases: 0,
            },
            inning_results: [{ inning: '8', text: '四球', classes: [] }],
          },
        ],
        team_totals: {
          at_bats: 29,
          runs: 3,
          hits: 7,
          runs_batted_in: 2,
          stolen_bases: 1,
        },
      },
      {
        team: 'オリックス・バファローズ',
        headers: ['打順', '守備', '選手'],
        rows: [
          {
            batting_order: 3,
            position: '(二)',
            player: { name: '山田', url: 'https://npb.jp/bis/players/yamada.html' },
            stats: {
              at_bats: 4,
              runs: 1,
              hits: 1,
              runs_batted_in: 1,
              stolen_bases: 0,
            },
            inning_results: [{ inning: '9', text: '左本', classes: [] }],
          },
        ],
        team_totals: {
          at_bats: 30,
          runs: 1,
          hits: 5,
          runs_batted_in: 1,
          stolen_bases: 0,
        },
      },
    ],
    pitching_box: [
      {
        team: 'ロッテ',
        headers: ['投手'],
        rows: [
          {
            decision: null,
            pitcher: { name: '益田', url: 'https://npb.jp/bis/players/masuda.html' },
            pitch_count: 16,
            batters_faced: 3,
            innings_pitched: '1',
            hits: 0,
            home_runs: 0,
            walks: 0,
            hit_batters: 0,
            strikeouts: 2,
            wild_pitches: 0,
            balks: 0,
            runs: 0,
            earned_runs: 0,
          },
        ],
        team_totals: {
          pitch_count: 140,
          batters_faced: 34,
          innings_pitched: '9',
          hits: 5,
          home_runs: 0,
          walks: 2,
          hit_batters: 0,
          strikeouts: 8,
          wild_pitches: 0,
          balks: 0,
          runs: 1,
          earned_runs: 1,
        },
      },
    ],
    roster: [
      {
        team: 'ロッテ',
        groups: [
          {
            label: '投手',
            entries: [
              {
                number: '52',
                player: { name: '益田', url: 'https://npb.jp/bis/players/masuda.html' },
                throws: '右',
                bats: '右',
                raw_handedness: '右右',
              },
            ],
          },
        ],
      },
    ],
    sources: {
      index: {
        url: 'https://npb.jp/scores/2025/0815/b-l-17/index.html',
        path: 'data/raw/2025/0815/r20250815b-l-17/index.html',
      },
      playbyplay: {
        url: 'https://npb.jp/scores/2025/0815/b-l-17/playbyplay.html',
        path: 'data/raw/2025/0815/r20250815b-l-17/playbyplay.html',
      },
      box: {
        url: 'https://npb.jp/scores/2025/0815/b-l-17/box.html',
        path: 'data/raw/2025/0815/r20250815b-l-17/box.html',
      },
      roster: {
        url: 'https://npb.jp/scores/2025/0815/b-l-17/roster.html',
        path: 'data/raw/2025/0815/r20250815b-l-17/roster.html',
      },
    },
    fetched_at: '2025-08-15T21:00:00+09:00',
  })
}

describe('chat-service', () => {
  it('rejects non-baseball topics before invoking the query parser', async () => {
    let parserCalled = false
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => {
        parserCalled = true
        return {
          intent: 'search_events',
          filters: { player_name: '天気' },
        }
      },
    })

    const response = await service.answerQuestion('今日の天気はどうですか？')

    expect(parserCalled).toBe(false)
    expect(response.structured_query).toEqual({ intent: 'off_topic', filters: {} })
    expect(response.answer.result_count).toBe(0)
    expect(response.results.events).toHaveLength(0)
  })

  it('allows short follow-up wording when the conversation history is baseball context', async () => {
    let parserCalled = false
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => {
        parserCalled = true
        return {
          intent: 'search_batting',
          filters: { player_name: '大城', team: '巨人', recent: true },
        }
      },
    })

    await service.answerQuestion('それで最近どう？', {
      history: [
        { role: 'user', content: '巨人の大城って今どんな感じ' },
        { role: 'assistant', content: '大城の打撃成績です。' },
      ],
    })

    expect(parserCalled).toBe(true)
  })

  it('returns DB-backed event answers with source urls', async () => {
    const database = openDatabase()

    try {
      migrateDatabase(database)
      loadRichGame(database, buildFixtureRichGame())

      const service = createChatService(sqliteDatabaseToQuery(database))
      const response = await service.answerQuestion(
        '2025-08-15の8回裏、team=ロッテ batter_name=山村 の代打イベントを教えて',
      )

      expect(response.structured_query).toMatchObject({
        intent: 'search_events',
        filters: {
          game_date: '2025-08-15',
          inning: 8,
          half: 'bottom',
          team: 'ロッテ',
          batter_name: '山村',
          batter_player_id: 'yamamura',
          event_type: 'plate_appearance',
          event_subtype: 'pinch_hitter',
        },
      })
      expect(response.results.events).toHaveLength(1)
      expect(response.results.events[0]).toMatchObject({
        gameId: 'r20250815b-l-17',
        batterName: '山村',
        eventSubtype: 'pinch_hitter',
      })
      expect(response.answer.result_count).toBe(1)
      expect(response.answer.source_urls).toContain(
        'https://npb.jp/scores/2025/0815/b-l-17/playbyplay.html',
      )
      expect(response.sources).toHaveLength(4)
    } finally {
      database.close()
    }
  })

  it('returns DB-backed pitching answers with source urls', async () => {
    const database = openDatabase()

    try {
      migrateDatabase(database)
      loadRichGame(database, buildFixtureRichGame())

      const service = createChatService(sqliteDatabaseToQuery(database))
      const response = await service.answerQuestion(
        '2025-08-15の投手成績で team=ロッテ pitcher_name=益田 を見せて',
      )

      expect(response.structured_query).toMatchObject({
        intent: 'search_pitching',
        filters: {
          game_date: '2025-08-15',
          team: 'ロッテ',
          pitcher_name: '益田',
          pitcher_player_id: 'masuda',
        },
      })
      expect(response.results.pitching).toHaveLength(1)
      expect(response.results.pitching[0]).toMatchObject({
        gameId: 'r20250815b-l-17',
        pitcherName: '益田',
      })
      expect(response.answer.source_urls).toContain(
        'https://npb.jp/scores/2025/0815/b-l-17/box.html',
      )
    } finally {
      database.close()
    }
  })

  it('uses an injected async structured query parser result for DB search', async () => {
    const database = openDatabase()

    try {
      migrateDatabase(database)
      loadRichGame(database, buildFixtureRichGame())

      const service = createChatService(sqliteDatabaseToQuery(database), {
        parseStructuredQueryFromMessage: async () => ({
          intent: 'search_events',
          filters: {
            game_date: '2025-08-15',
            inning: 8,
            half: 'bottom',
            team: 'ロッテ',
            batter_name: '山村',
            event_type: 'plate_appearance',
            event_subtype: 'pinch_hitter',
          },
        }),
      })
      const response = await service.answerQuestion('山村の代打イベント')

      expect(response.results.events).toHaveLength(1)
      expect(response.results.events[0]).toMatchObject({
        gameId: 'r20250815b-l-17',
        batterName: '山村',
      })
    } finally {
      database.close()
    }
  })

  it('rewrites player matchup questions to event search even when the parser returns games', async () => {
    let capturedFilters: unknown
    const service = createChatService(createFakeQueryService({
      searchEvents: async (filters) => {
        capturedFilters = filters
        return [{
          gameId: 'r20230409db-d-02',
          gameDate: '2023-04-09',
          sequence: 13,
          inning: 8,
          half: 'bottom',
          offenseTeam: 'DeNA',
          eventType: 'plate_appearance',
          eventSubtype: 'standard',
          batterName: '京田',
          pitcherName: '砂田',
          runnerName: null,
          resultText: 'ライトフライ',
          eventAttributesJson: null,
          sourceUrl: 'https://npb.jp/scores/2023/0409/db-d-02/playbyplay.html',
        }]
      },
      playerCandidates: [
        {
          player_id: null,
          name: '京田',
          primary_team: 'DeNA',
          roles: ['batter'],
          teams: ['DeNA'],
          years: [2023],
        },
      ],
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_games',
        filters: {
          team: 'DeNA',
          limit: 50,
        },
      }),
    })

    for (const message of [
      '横浜京田と中日砂田が対決したことってある？',
      '横浜京田対中日砂田ってある？',
      '横浜京田は中日砂田から打ったことある？',
      '中日砂田から横浜京田が打ったことある？',
    ]) {
      const response = await service.answerQuestion(message)

      expect(response.structured_query).toMatchObject({
        intent: 'search_events',
        filters: {
          team: 'DeNA',
          batter_name: '京田',
          pitcher_name: '砂田',
        },
      })
      expect(capturedFilters).toMatchObject({
        team: 'DeNA',
        batter_name: '京田',
        pitcher_name: '砂田',
      })
      expect(response.results.events).toHaveLength(1)
    }
  })

  it('repairs clear natural-language categories when the parser picks the wrong intent', async () => {
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: { player_name: '誤分類' },
      }),
    })

    await expect(service.answerQuestion('藤浪って今どこのチームにいるの？'))
      .resolves.toMatchObject({
        structured_query: {
          intent: 'player_affiliation',
          filters: { player_name: '藤浪' },
        },
      })

    await expect(service.answerQuestion('今年のソフトバンクって何勝してるの'))
      .resolves.toMatchObject({
        structured_query: {
          intent: 'aggregate_games',
          filters: { team: 'ソフトバンク' },
        },
      })

    await expect(service.answerQuestion('最近ロッテの1番ってだれが多いの？'))
      .resolves.toMatchObject({
        structured_query: {
          intent: 'aggregate_batting',
          filters: { team: 'ロッテ', batting_order: 1 },
        },
      })

    await expect(service.answerQuestion('ヤクルト村上の今年の成績'))
      .resolves.toMatchObject({
        structured_query: {
          intent: 'search_batting',
          filters: { team: 'ヤクルト', player_name: '村上' },
        },
      })
  })

  it('sanitizes invalid player_name for aggregate batting ranking questions', async () => {
    const cases = [
      {
        question: '今シーズンのセ・リーグで打率・出塁率・長打率のバランスが最も優れていると思われる打者を1人挙げて、その根拠を数字で示してください。',
        parsedPlayerName: 'セ・リーグで',
        expectedFilters: { year: 2026, team: 'セ・リーグ', sort_by: 'ops', limit: 10 },
      },
      {
        question: '今シーズンのセ・リーグ打点ランキングトップ5',
        parsedPlayerName: 'セ・リーグ',
        expectedFilters: { year: 2026, team: 'セ・リーグ', sort_by: 'runsBattedIn', limit: 5 },
      },
      {
        question: '2022年から2024年の3年間で、NPB全体で最も本塁打を多く打った打者トップ3を教えてください。',
        parsedPlayerName: '2024年の3年間で、NPB全体で最も',
        expectedFilters: { year_from: 2022, year_to: 2024, sort_by: 'homeRuns', limit: 3 },
      },
      {
        question: '2022年から2024年のパ・リーグで本塁打が最も多い打者トップ3',
        parsedPlayerName: '2024年のパ・リーグで',
        expectedFilters: { year_from: 2022, year_to: 2024, team: 'パ・リーグ', sort_by: 'homeRuns', limit: 3 },
      },
    ]

    for (const testCase of cases) {
      const service = createChatService(createFakeQueryService({
        aggregateBattingLines: async () => [{
          kind: 'batting',
          label: '対象選手',
          total: 1,
          stats: {
            team: '対象球団',
            games: 1,
            battingAverage: 0.3,
            homeRuns: 1,
            runsBattedIn: 1,
            stolenBases: 0,
            ops: 0.9,
            isoP: 0.1,
            bbRate: 0.1,
          },
        }],
      }), {
        allowFinalAnswerFallback: false,
        parseStructuredQueryFromMessage: async () => ({
          intent: 'aggregate_batting',
          filters: { player_name: testCase.parsedPlayerName },
        }),
      })

      const response = await service.answerQuestion(testCase.question)

      expect(response.structured_query).toEqual({
        intent: 'aggregate_batting',
        filters: testCase.expectedFilters,
      })
    }
  })

  it('sanitizes invalid pitcher_name for aggregate pitching ranking questions', async () => {
    const cases = [
      {
        question: '2026年の先発防御率ランキングトップ5',
        parsedPitcherName: '2026年の先発',
        expectedFilters: { year: 2026, sort_by: 'era', limit: 5 },
      },
      {
        question: '2026年セ・リーグの先発防御率ランキングを教えてください',
        parsedPitcherName: 'セ・リーグの先発',
        expectedFilters: { year: 2026, team: 'セ・リーグ', sort_by: 'era', limit: 10 },
      },
    ]

    for (const testCase of cases) {
      const service = createChatService(createFakeQueryService({
        aggregatePitchingLines: async () => [{
          kind: 'pitching',
          label: '対象投手',
          total: 1,
          stats: {
            team: '対象球団',
            games: 1,
            inningsPitched: 6,
            earnedRuns: 1,
            hitsAllowed: 3,
            walks: 1,
            strikeouts: 5,
            wins: 1,
          },
        }],
      }), {
        allowFinalAnswerFallback: false,
        parseStructuredQueryFromMessage: async () => ({
          intent: 'aggregate_pitching',
          filters: { pitcher_name: testCase.parsedPitcherName },
        }),
      })

      const response = await service.answerQuestion(testCase.question)

      expect(response.structured_query).toEqual({
        intent: 'aggregate_pitching',
        filters: testCase.expectedFilters,
      })
    }
  })

  it('sanitizes invalid player_name for WHIP aggregate pitching ranking questions', async () => {
    const service = createChatService(createFakeQueryService({
      aggregatePitchingLines: async () => [{
        kind: 'pitching',
        label: '対象投手',
        total: 1,
        stats: {
          team: '対象球団',
          games: 3,
          inningsPitched: 18,
          earnedRuns: 2,
          hitsAllowed: 10,
          walks: 2,
          strikeouts: 15,
          wins: 1,
        },
      }],
    }), {
      allowFinalAnswerFallback: false,
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: {
          pitcher_name: '（2026年）の先発陣で、WHIP',
        },
      }),
    })

    const response = await service.answerQuestion('今シーズン（2026年）の先発陣で、WHIPが最も低い投手を教えてください。WHIPは（被安打＋与四球）÷投球回で計算してください。')

    expect(response.structured_query).toEqual({
      intent: 'aggregate_pitching',
      filters: {
        year: 2026,
        sort_by: 'whip',
        limit: 10,
      },
    })
    expect(response.structured_query.filters).not.toHaveProperty('pitcher_name')
  })

  it('routes Norimoto career comparison questions through aggregate_pitching without player resolution', async () => {
    const aggregateYears: number[] = []
    const service = createChatService(createFakeQueryService({
      aggregatePitchingLines: async (filters) => {
        aggregateYears.push(Number(filters.year ?? 0))
        if (filters.year === 2016) {
          return [{
            kind: 'pitching',
            label: '則本昂大',
            total: 1,
            stats: {
              team: '東北楽天ゴールデンイーグルス',
              games: 1,
              inningsPitched: 6,
              earnedRuns: 1,
              hitsAllowed: 4,
              walks: 1,
              strikeouts: 5,
              wins: 1,
            },
          }]
        }
        if (filters.year === 2023) {
          return [{
            kind: 'pitching',
            label: '則本昂大',
            total: 1,
            stats: {
              team: '読売ジャイアンツ',
              games: 1,
              inningsPitched: 6,
              earnedRuns: 1,
              hitsAllowed: 4,
              walks: 0,
              strikeouts: 5,
              wins: 0,
            },
          }]
        }
        return []
      },
    }), {
      allowFinalAnswerFallback: false,
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: { player_name: '誤分類' },
      }),
    })

    const response = await service.answerQuestion('則本昂大は楽天時代と巨人移籍後で防御率はどう変わりましたか？')

    expect(response.structured_query).toEqual({
      intent: 'aggregate_pitching',
      filters: {
        pitcher_name: '則本昂大',
        year_from: 2016,
        sort_by: 'era',
        limit: 10,
      },
    })
    expect(aggregateYears).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026])
  })

  it('keeps top pitch count appearance questions on search_pitching', async () => {
    const service = createChatService(createFakeQueryService({
      searchPitchingLines: async () => [{
        gameId: 'r20260418g-h-02',
        gameDate: '2026-04-18',
        team: 'ソフトバンク',
        pitcherName: '上沢',
        inningsPitched: '8.1',
        pitchCount: 134,
        strikeouts: 9,
        runs: 0,
        earnedRuns: 0,
        sourceKind: 'box',
        sourceUrl: 'https://npb.jp/scores/2026/0418/g-h-02/box.html',
      }],
    }), {
      allowFinalAnswerFallback: false,
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: { year: 2026, sort_by: 'pitchCount' },
      }),
    })

    const response = await service.answerQuestion('今シーズン最も球数が多かった登板を教えてください')

    expect(response.structured_query).toEqual({
      intent: 'search_pitching',
      filters: {
        year: 2026,
        sort_by: 'pitchCount',
        limit: 1,
      },
    })
    expect(response.answer.summary).toContain('条件期間で最も球数が多かった登板は')
    expect(response.answer.summary).toContain('134球')
  })

  it('normalizes team and player fields before DB search', async () => {
    const database = openDatabase()

    try {
      migrateDatabase(database)
      loadRichGame(database, buildFixtureRichGame())

      const service = createChatService(sqliteDatabaseToQuery(database), {
        parseStructuredQueryFromMessage: async () => ({
          intent: 'search_events',
          filters: {
            game_date: '2025-08-15',
            inning: 8,
            half: 'bottom',
            team: '千葉ロッテマリーンズ',
            batter_name: ' 山 村 ',
            event_type: 'plate_appearance',
            event_subtype: 'pinch_hitter',
          },
        }),
      })
      const response = await service.answerQuestion('千葉ロッテの山村の代打イベント')

      expect(response.structured_query).toMatchObject({
        intent: 'search_events',
        filters: {
          game_date: '2025-08-15',
          inning: 8,
          half: 'bottom',
          team: 'ロッテ',
          batter_name: '山村',
          batter_player_id: 'yamamura',
          event_type: 'plate_appearance',
          event_subtype: 'pinch_hitter',
        },
      })
      expect(response.results.events).toHaveLength(1)
      expect(response.results.events[0]).toMatchObject({
        gameId: 'r20250815b-l-17',
        batterName: '山村',
      })
    } finally {
      database.close()
    }
  })

  it('executes expanded query plans against the chat query service', async () => {
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: {
          year: 2024,
          player_name: '山田',
        },
      }),
    })

    const response = await service.answerQuestion('2024年の山田の打席結果')

    expect(response.results.batting).toHaveLength(1)
    expect(response.results.batting[0]).toMatchObject({
      gameId: 'r20240401g-t-01',
      playerName: '山田',
      hits: 2,
    })
    expect(response.sources.map((source) => source.source_key)).toContain('box')
    expect(response.answer.summary).toContain('打撃成績')
  })

  it('resolves Japanese player names before home run event search', async () => {
    const database = openDatabase()

    try {
      migrateDatabase(database)
      loadRichGame(database, buildFixtureRichGame())

      const service = createChatService(sqliteDatabaseToQuery(database))
      const response = await service.answerQuestion('2025年に山田が打った本塁打一覧')

      expect(response.structured_query).toMatchObject({
        intent: 'search_events',
        filters: {
          year: 2025,
          batter_name: '山田',
          batter_player_id: 'yamada',
          event_type: 'plate_appearance',
          result_text_contains: 'ホームラン',
        },
      })
      expect(response.answer.resolved_player).toMatchObject({
        input: '山田',
        player_id: 'yamada',
        name: '山田',
        primary_team: 'オリックス',
        status: 'resolved',
      })
      expect(response.answer.applied_filters).toMatchObject({
        year: 2025,
        batter_name: '山田',
        batter_player_id: 'yamada',
        event_type: 'plate_appearance',
        result_text_contains: 'ホームラン',
      })
      expect(response.answer.result_count).toBe(1)
      expect(response.results.events[0]).toMatchObject({
        gameId: 'r20250815b-l-17',
        gameDate: '2025-08-15',
        batterName: '山田',
        resultText: 'レフトソロホームラン（打点1）',
        sourceUrl: 'https://npb.jp/scores/2025/0815/b-l-17/playbyplay.html',
      })
      expect(response.sources.map((source) => source.source_url)).toContain(
        'https://npb.jp/scores/2025/0815/b-l-17/playbyplay.html',
      )
    } finally {
      database.close()
    }
  })

  it('resolves player_id before player home run existence event searches', async () => {
    const eventCalls: Array<Parameters<ChatQueryService['searchEvents']>[0]> = []
    const service = createChatService(createFakeQueryService({
      playerCandidates: [
        { player_id: '41045137', name: '藤浪 晋太郎', primary_team: 'DeNA', roles: ['batter', 'pitcher'], teams: ['阪神', 'DeNA'], years: [2016, 2026] },
      ],
      searchEvents: async (filters) => {
        eventCalls.push(filters)
        return [{
          gameId: 'r20210416t-s-04',
          gameDate: '2021-04-16',
          sequence: 1,
          inning: 2,
          half: 'bottom',
          offenseTeam: '阪神',
          eventType: 'plate_appearance',
          eventSubtype: 'standard',
          batterName: '藤浪',
          pitcherName: '石川',
          runnerName: null,
          resultText: 'レフト2ランホームラン（打点2）',
          eventAttributesJson: '{"batter_links":[{"name":"藤浪","url":"https://npb.jp/bis/players/41045137.html"}]}',
          sourceUrl: 'https://npb.jp/scores/2021/0416/t-s-04/playbyplay.html',
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: {
          batter_name: '藤浪',
          event_type: 'plate_appearance',
          result_text_contains: 'ホームラン',
        },
      }),
    })

    const response = await service.answerQuestion('藤浪ってホームラン打ったことある？')

    expect(response.structured_query).toMatchObject({
      intent: 'search_events',
      filters: {
        batter_name: '藤浪 晋太郎',
        batter_player_id: '41045137',
      },
    })
    expect(eventCalls[0]).toMatchObject({
      batter_name: '藤浪 晋太郎',
      batter_player_id: '41045137',
    })
    expect(response.answer.result_count).toBe(1)
    expect(response.answer.summary).toContain('藤浪 晋太郎が打ったホームランは1件です')
    expect(response.answer.summary).not.toContain('条件に一致するイベントは見つかりません')
  })

  it('romanized player names return not_found without a latin alias map', async () => {
    const database = openDatabase()

    try {
      migrateDatabase(database)
      loadRichGame(database, buildFixtureRichGame())

      const service = createChatService(sqliteDatabaseToQuery(database))
      const response = await service.answerQuestion('2025年にYamadaが打ったホームラン一覧')

      expect(response.answer.resolved_player).toMatchObject({
        input: 'Yamada',
        status: 'not_found',
      })
      expect(response.answer.result_count).toBe(0)
    } finally {
      database.close()
    }
  })

  it('returns candidates when a player name is ambiguous', async () => {
    const service = createChatService(createFakeQueryService({
      playerCandidates: [
        { player_id: '91895133', name: '山田', primary_team: 'ヤクルト', roles: ['batter'], teams: ['ヤクルト'], years: [2025] },
        { player_id: null, name: '山田', primary_team: 'オリックス', roles: ['batter'], teams: ['オリックス'], years: [2025] },
      ],
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: {
          year: 2025,
          batter_name: '山田',
          event_type: 'plate_appearance',
          result_text_contains: 'ホームラン',
        },
      }),
    })

    const response = await service.answerQuestion('2025年に山田が打った本塁打一覧')

    expect(response.answer.result_count).toBe(0)
    expect(response.answer.resolved_player).toMatchObject({
      input: '山田',
      name: null,
      status: 'ambiguous',
    })
    expect(response.answer.resolved_player?.candidates.map((candidate) => candidate.name)).toEqual([
      '山田',
      '山田',
    ])
    expect(response.answer.summary).toContain('どの山田ですか')
  })

  it('full name with ambiguous surname returns not_found without player_profiles', async () => {
    const service = createChatService(createFakeQueryService({
      playerCandidates: [
        { player_id: '91895133', name: '山田', primary_team: 'ヤクルト', roles: ['batter'], teams: ['ヤクルト'], years: [2025] },
        { player_id: null, name: '山田', primary_team: 'オリックス', roles: ['batter'], teams: ['オリックス'], years: [2025] },
      ],
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: {
          year: 2025,
          batter_name: '山田哲人',
          event_type: 'plate_appearance',
          result_text_contains: 'ホームラン',
        },
      }),
    })

    const response = await service.answerQuestion('2025年に山田哲人が打ったホームラン一覧')

    // "山田哲人" is a full name (3+ chars) that matches >1 surname-only candidates → not_found
    expect(response.answer.resolved_player).toMatchObject({
      input: '山田哲人',
      status: 'not_found',
    })
    expect(response.answer.result_count).toBe(0)
  })

  it('resolves a team-qualified same-surname player to one entity', async () => {
    const service = createChatService(createFakeQueryService({
      playerCandidates: [
        { player_id: '91895133', name: '山田', primary_team: 'ヤクルト', roles: ['batter'], teams: ['ヤクルト', '東京ヤクルトスワローズ'], years: [2025] },
        { player_id: null, name: '山田', primary_team: 'オリックス', roles: ['batter'], teams: ['オリックス'], years: [2025] },
      ],
    }))

    const response = await service.answerQuestion('2025年にヤクルトの山田が打ったホームラン一覧')

    expect(response.answer.resolved_player).toMatchObject({
      input: '山田',
      player_id: '91895133',
      name: '山田',
      primary_team: 'ヤクルト',
      status: 'resolved',
    })
    expect(response.structured_query.filters).toMatchObject({
      team: 'ヤクルト',
      batter_name: '山田',
      batter_player_id: '91895133',
    })
  })

  it('returns an explicit no-result answer without inventing facts', async () => {
    const service = createChatService(createFakeQueryService({ empty: true }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: {
          year_from: 2016,
          year_to: 2026,
          player_name: '存在しない選手',
        },
      }),
    })

    const response = await service.answerQuestion('2016–2026横断で存在しない選手のイベント検索')

    expect(response.answer.result_count).toBe(0)
    expect(response.answer.summary).toContain('選手候補は0件')
    expect(response.results.events).toHaveLength(0)
  })

  it('does not say the player cannot be identified when only the requested year has no candidate', async () => {
    const service = createChatService(createFakeQueryService({
      empty: true,
      playerCandidatesForFilters: (filters) => filters.year === 2026
        ? []
        : [{
            player_id: 'murakami',
            name: '村上',
            primary_team: 'ヤクルト',
            roles: ['batter'],
            teams: ['ヤクルト'],
            years: [2025],
          }],
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: {
          year: 2026,
          team: 'ヤクルト',
          player_name: '村上',
        },
      }),
    })

    const response = await service.answerQuestion('ヤクルト村上の今年の成績')

    expect(response.answer.resolved_player).toMatchObject({
      input: '村上',
      player_id: 'murakami',
      status: 'resolved',
    })
    // year shifts 2026→2025 because candidate.years=[2025] does not include 2026
    expect(response.structured_query.filters).toMatchObject({
      year: 2025,
      team: 'ヤクルト',
      player_name: '村上',
      player_id: 'murakami',
    })
    expect(response.answer.result_count).toBe(0)
    expect(response.answer.summary).toContain('2026年はNPBに在籍していない')
    expect(response.answer.summary).not.toContain('選手を特定できない')
  })

  it('returns ambiguous when year-filtered search yields one candidate but broad search finds multiple (surname ambiguity)', async () => {
    // Simulates "村上宗隆 vs 村上頌樹": year-filtered search only sees 村上頌樹 (stored as "村上 頌樹")
    // but broad search reveals both. The old code used selectCandidatesForInput on the broad
    // results which only counted exact name "村上" matches (村上宗隆), missing 村上頌樹 (name "村上 頌樹").
    const service = createChatService(createFakeQueryService({
      playerCandidatesForFilters: (filters) => filters.year === 2026
        ? [{ player_id: '13315153', name: '村上 頌樹', primary_team: '阪神', roles: ['batter'], teams: ['阪神'], years: [2026] }]
        : [
            { player_id: '13315153', name: '村上 頌樹', primary_team: '阪神', roles: ['batter'], teams: ['阪神'], years: [2025, 2026] },
            { player_id: '11111111', name: '村上宗隆', primary_team: 'ヤクルト', roles: ['batter'], teams: ['ヤクルト'], years: [2022, 2023, 2024, 2025, 2026] },
          ],
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'aggregate_batting',
        filters: { year: 2026, player_name: '村上' },
      }),
    })

    const response = await service.answerQuestion('村上の今シーズン成績')

    expect(response.answer.resolved_player).toMatchObject({
      input: '村上',
      status: 'ambiguous',
    })
    expect(response.answer.result_count).toBe(0)
  })

  it('resolves a surname through player_id-bearing roster rows before treating transfer history as ambiguous', async () => {
    const database = openDatabase()

    try {
      migrateDatabase(database)
      database.prepare(
        `INSERT INTO current_team_roster
          (year, team_id, team_name, player_key, player_id, player_name, position, uniform_number, bats, throws, source_url)
         VALUES (2026, 'db', '横浜DeNAベイスターズ', '41045137', '41045137', '藤浪 晋太郎', '投手', '27', '右', '右', 'https://npb.jp/bis/teams/rst_db.html')`,
      ).run()
      database.prepare(
        `INSERT INTO games
          (schema_version, game_id, year, mmdd, date, date_label, venue, canonical_url, matchup_text,
           away_team_name, home_team_name, linescore_json, result_pitchers_json,
           batteries_json, home_runs_json, latest_order_json, fetched_at, loaded_at)
         VALUES (1, 'f20260522db-d-05', 2026, '0522', '2026-05-22', '2026年5月22日',
                 '横須賀', 'https://npb.jp/bis/eng/2026/games/fs2026052200480.html',
                 'DeNA vs 中日', '中日', '横浜DeNA', '{}', '{}', '{}', '{}', '{}', datetime('now'), datetime('now'))`,
      ).run()
      database.prepare(
        `INSERT INTO pitching_lines
          (game_id, team, row_index, pitcher_name, pitcher_url, pitch_count, batters_faced,
           innings_pitched, hits, home_runs, walks, hit_batters, strikeouts, wild_pitches,
           balks, runs, earned_runs, headers_json)
         VALUES ('f20260522db-d-05', '横浜DeNAベイスターズ', 1, '藤浪', NULL, 88, 20,
                 '5', 3, 0, 2, 0, 8, 0, 0, 1, 1, '{}')`,
      ).run()

      const service = createChatService(sqliteDatabaseToQuery(database), {
        parseStructuredQueryFromMessage: async () => ({
          intent: 'search_pitching',
          filters: { pitcher_name: '藤浪', recent: true },
        }),
      })

      const response = await service.answerQuestion('藤浪って最近何してんの')

      expect(response.answer.resolved_player).toMatchObject({
        input: '藤浪',
        player_id: '41045137',
        status: 'resolved',
        name: '藤浪 晋太郎',
        primary_team: '横浜DeNAベイスターズ',
      })
      expect(response.answer.result_count).toBe(1)
      expect(response.answer.summary).not.toContain('どの藤浪ですか')
      expect(response.answer.summary).toContain('横浜DeNAベイスターズ 藤浪')
      expect(response.answer.summary).toContain('2026年二軍')
    } finally {
      database.close()
    }
  })

  it('does not call generateFinalAnswer when result_count is 0 with a resolved player', async () => {
    let finalAnswerCalled = false

    const service = createChatService(createFakeQueryService({
      empty: true,
      playerCandidates: [
        { player_id: 'unique-yamada', name: '山田', primary_team: '巨人', roles: ['batter'], teams: ['巨人'], years: [2025] },
      ],
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { year: 2025, player_name: '山田' },
      }),
      generateFinalAnswer: async () => {
        finalAnswerCalled = true
        return 'should not be called'
      },
    })

    const response = await service.answerQuestion('2025年の山田の打撃成績')

    expect(response.answer.result_count).toBe(0)
    expect(finalAnswerCalled).toBe(false)
  })

  it('does not call generateFinalAnswer when player resolution is ambiguous', async () => {
    let finalAnswerCalled = false

    const service = createChatService(createFakeQueryService({
      playerCandidates: [
        { player_id: '11111', name: '鈴木', primary_team: '巨人', roles: ['batter'], teams: ['巨人'], years: [2025] },
        { player_id: '22222', name: '鈴木', primary_team: '阪神', roles: ['batter'], teams: ['阪神'], years: [2025] },
      ],
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: { year: 2025, batter_name: '鈴木', event_type: 'plate_appearance', result_text_contains: 'ホームラン' },
      }),
      generateFinalAnswer: async () => {
        finalAnswerCalled = true
        return 'should not be called'
      },
    })

    const response = await service.answerQuestion('2025年の鈴木のホームラン')

    expect(response.answer.resolved_player?.status).toBe('ambiguous')
    expect(finalAnswerCalled).toBe(false)
  })

  it('does not call generateFinalAnswer when player resolution is not_found', async () => {
    let finalAnswerCalled = false

    const service = createChatService(createFakeQueryService({
      playerCandidates: [],
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { year: 2025, player_name: '架空選手' },
      }),
      generateFinalAnswer: async () => {
        finalAnswerCalled = true
        return 'should not be called'
      },
    })

    const response = await service.answerQuestion('2025年の架空選手の打撃成績')

    expect(response.answer.resolved_player?.status).toBe('not_found')
    expect(finalAnswerCalled).toBe(false)
  })

  it('does not call generateFinalAnswer when remaining_count is greater than zero', async () => {
    let finalAnswerCalled = false
    const manyEvents = Array.from({ length: 21 }, (_, i) => ({
      gameId: `r20250101g-t-${String(i + 1).padStart(2, '0')}`,
      gameDate: '2025-01-01',
      sequence: i + 1,
      inning: 1,
      half: 'top' as const,
      offenseTeam: '巨人',
      eventType: 'plate_appearance' as const,
      eventSubtype: 'standard' as const,
      batterName: '山田',
      pitcherName: '田中',
      runnerName: null,
      resultText: 'ヒット',
      eventAttributesJson: null,
      sourceUrl: 'https://npb.jp/scores/2025/0101/g-t-01/playbyplay.html',
    }))

    const service = createChatService(createFakeQueryService({
      searchEvents: async () => manyEvents,
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: { year: 2025, batter_name: '山田' },
      }),
      generateFinalAnswer: async () => {
        finalAnswerCalled = true
        return 'should not be called'
      },
    })

    const response = await service.answerQuestion('2025年の山田の打席')

    expect(response.answer.result_count).toBe(21)
    expect(response.answer.remaining_count).toBeGreaterThan(0)
    expect(finalAnswerCalled).toBe(false)
  })

  it('uses deterministic search_batting summary instead of final LLM', async () => {
    let finalAnswerCalled = false

    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { year: 2024, player_name: '山田' },
      }),
      generateFinalAnswer: async () => {
        finalAnswerCalled = true
        return 'LLM生成のサマリー'
      },
    })

    const response = await service.answerQuestion('2024年の山田の打撃成績')

    expect(response.answer.result_count).toBeGreaterThan(0)
    expect(finalAnswerCalled).toBe(false)
    expect(response.answer.summary).toContain('打撃成績')
  })

  it('returns a non-empty deterministic summary when generateFinalAnswer is not configured', async () => {
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { year: 2024, player_name: '山田' },
      }),
    })

    const response = await service.answerQuestion('2024年の山田の打撃成績')

    expect(response.answer.result_count).toBeGreaterThan(0)
    expect(typeof response.answer.summary).toBe('string')
    expect(response.answer.summary.length).toBeGreaterThan(0)
  })

  it('falls back from empty event highlight search to game detail evidence', async () => {
    const service = createChatService(createFakeQueryService({
      searchEvents: async (filters) => filters.game_id
        ? [{
            gameId: 'r20260517g-t-01',
            gameDate: '2026-05-17',
            sequence: 10,
            inning: 7,
            half: 'bottom',
            offenseTeam: '巨人',
            eventType: 'plate_appearance',
            eventSubtype: 'standard',
            batterName: '大城',
            pitcherName: '田中',
            runnerName: null,
            resultText: 'ライト2ランホームラン（打点2）',
            eventAttributesJson: null,
            sourceUrl: 'https://npb.jp/scores/2026/0517/g-t-01/playbyplay.html',
          }]
        : [],
      searchGameDetails: async () => [{
        gameId: 'r20260517g-t-01',
        date: '2026-05-17',
        venue: '東京ドーム',
        competition: null,
        awayTeamName: '阪神',
        homeTeamName: '巨人',
        matchupText: '阪神 vs 巨人',
        linescoreJson: JSON.stringify({
          away: { team: '阪神', innings: ['0', '0', '0'], totals: { runs: 0, hits: 5, errors: 0 } },
          home: { team: '巨人', innings: ['0', '0', '2'], totals: { runs: 2, hits: 6, errors: 0 } },
        }),
      }],
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: {
          game_date: '2026-05-17',
          team: '巨人',
        },
      }),
    })

    const response = await service.answerQuestion('昨日の巨人戦のハイライトは')

    expect(response.structured_query.intent).toBe('game_detail')
    expect(response.answer.result_count).toBe(1)
    expect(response.results.gameDetails).toHaveLength(1)
    expect(response.results.events).toHaveLength(1)
    expect(response.answer.summary).toContain('主な得点・長打イベント')
    expect(response.answer.summary).not.toContain('条件に一致するイベントは見つかりません')
  })

  it('resolves ordinal follow-up references to the selected previous game_id', async () => {
    const seenGameIds: string[] = []
    const service = createChatService(createFakeQueryService({
      searchBattingLines: async (filters) => filters.game_id === 'r20210416t-s-04'
        ? [{
            gameId: 'r20210416t-s-04',
            gameDate: '2021-04-16',
            team: '阪神',
            playerName: '藤浪',
            battingOrder: 9,
            position: '(投)',
            atBats: 2,
            runs: 1,
            hits: 1,
            runsBattedIn: 2,
            stolenBases: 0,
            strikeouts: 1,
            walks: 0,
            rawText: '藤浪 レフト2ランホームラン',
            sourceKind: 'box',
            sourceUrl: 'https://npb.jp/scores/2021/0416/t-s-04/box.html',
          }]
        : [],
      searchPitchingLines: async (filters) => filters.game_id === 'r20210416t-s-04'
        ? [{
            gameId: 'r20210416t-s-04',
            gameDate: '2021-04-16',
            team: '阪神',
            pitcherName: '藤浪',
            inningsPitched: '5',
            pitchCount: 0,
            strikeouts: 6,
            runs: 0,
            earnedRuns: 0,
            sourceKind: 'box',
            sourceUrl: 'https://npb.jp/scores/2021/0416/t-s-04/box.html',
          }]
        : [],
      searchGameDetails: async (filters) => {
        seenGameIds.push(filters.game_id ?? '')
        return filters.game_id === 'r20210416t-s-04'
          ? [{
              gameId: 'r20210416t-s-04',
              date: '2021-04-16',
              venue: 'Koshien',
              competition: null,
              awayTeamName: '東京ヤクルトスワローズ',
              homeTeamName: '阪神タイガース',
              matchupText: '東京ヤクルトスワローズ vs 阪神タイガース',
              linescoreJson: JSON.stringify({
                away: { team: '東京ヤクルトスワローズ', innings: ['0', '0', '0'], totals: { runs: 0, hits: 5, errors: 1 } },
                home: { team: '阪神タイガース', innings: ['0', '0', '2'], totals: { runs: 2, hits: 5, errors: 0 } },
              }),
            }]
          : []
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'game_detail',
        filters: { game_date: '2021-04-16', limit: 10 },
      }),
    })

    const response = await service.answerQuestion('二つ目の試合についてもっと詳しく教えて', {
      history: [
        { role: 'user', content: '藤浪ってホームラン打ったことある？' },
        {
          role: 'assistant',
          content: [
            '藤浪 晋太郎のホームランは2件です。',
            '1. 2018-09-16 r20180916db-t-20 3回表',
            '2. 2021-04-16 r20210416t-s-04 5回裏',
          ].join('\n'),
        },
      ],
    })

    expect(response.structured_query).toEqual({
      intent: 'game_detail',
      filters: { game_id: 'r20210416t-s-04', limit: 1 },
    })
    expect(seenGameIds).toEqual(['r20210416t-s-04'])
    expect(response.answer.result_count).toBe(1)
    expect(response.results.batting.map((row) => row.gameId)).toEqual(['r20210416t-s-04'])
    expect(response.results.pitching.map((row) => row.gameId)).toEqual(['r20210416t-s-04'])
    expect(response.answer.summary).toContain('2021年4月16日')
    expect(response.answer.summary).toContain('得点経過:')
    expect(response.answer.summary).toContain('主な投手成績:')
    expect(response.answer.summary).toContain('主な打撃成績:')
    expect(response.answer.summary).not.toContain('該当する試合は6件')
  })

})

function createFakeQueryService(options: {
  empty?: boolean
  playerCandidates?: Array<{
    player_id: string | null
    name: string
    primary_team: string | null
    roles: string[]
    teams: string[]
    years: number[]
  }>
  playerCandidatesForFilters?: (filters: Parameters<ChatQueryService['searchPlayerCandidates']>[0]) => Array<{
    player_id: string | null
    name: string
    primary_team: string | null
    roles: string[]
    teams: string[]
    years: number[]
  }>
  searchEvents?: ChatQueryService['searchEvents']
  searchBattingLines?: ChatQueryService['searchBattingLines']
  searchPitchingLines?: ChatQueryService['searchPitchingLines']
  searchGameDetails?: ChatQueryService['searchGameDetails']
  aggregateBattingLines?: ChatQueryService['aggregateBattingLines']
  aggregatePitchingLines?: ChatQueryService['aggregatePitchingLines']
} = {}): ChatQueryService {
  const emptyResults = options.empty === true
  return {
    searchEvents: options.searchEvents ?? (async () => emptyResults
      ? []
      : [{
          gameId: 'r20240401g-t-01',
          gameDate: '2024-04-01',
          sequence: 1,
          inning: 1,
          half: 'top',
          offenseTeam: '巨人',
          eventType: 'plate_appearance',
          eventSubtype: 'standard',
          batterName: '山田',
          pitcherName: '田中',
          runnerName: null,
          resultText: 'レフトソロホームラン（打点1）',
          eventAttributesJson: null,
          sourceUrl: 'https://npb.jp/scores/2024/0401/g-t-01/playbyplay.html',
        }]),
    searchGames: async () => [],
    searchBattingLines: options.searchBattingLines ?? (async () => emptyResults
      ? []
      : [{
          gameId: 'r20240401g-t-01',
          gameDate: '2024-04-01',
          team: '巨人',
          playerName: '山田',
          battingOrder: 3,
          position: '(遊)',
          atBats: 4,
          runs: 1,
          hits: 2,
          runsBattedIn: 3,
          stolenBases: 0,
          strikeouts: 1,
          walks: 0,
          rawText: '山田 左越本 中前安',
        }]),
    searchPitchingLines: options.searchPitchingLines ?? (async () => []),
    searchRosterEntries: async () => [],
    searchPlayerAffiliations: async () => emptyResults
      ? []
      : [{
          year: 2024,
          gameId: 'r20240401g-t-01',
          gameDate: '2024-04-01',
          team: '巨人',
          playerName: '山田',
          playerId: 'yamada',
          sourceKind: 'roster',
          sourceUrl: 'https://npb.jp/scores/2024/0401/g-t-01/roster.html',
        }],
    searchGameDetails: options.searchGameDetails ?? (async () => []),
    aggregateBattingLines: options.aggregateBattingLines ?? (async () => []),
    aggregatePitchingLines: options.aggregatePitchingLines ?? (async () => []),
    aggregateEvents: async () => [],
    aggregateGameResults: async () => [],
    searchPlayerCandidates: async (filters) => options.playerCandidatesForFilters?.(filters) ?? options.playerCandidates ?? (
      filters.name === '存在しない選手'
        ? []
        : [{
            player_id: filters.name === 'Yamada' ? 'yamada' : null,
            name: filters.name === 'Yamada' ? '山田' : filters.name,
            primary_team: '巨人',
            roles: ['batter'],
            teams: ['巨人'],
            years: [2024],
          }]
    ),
    listSourceSnapshotsByGameIds: async (gameIds) => gameIds.map((gameId) => ({
      game_id: gameId,
      source_key: 'box',
      source_url: 'https://npb.jp/scores/2024/0401/g-t-01/box.html',
    })),
    close: () => {},
  }
}
