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

      expect(response.structured_query).toEqual({
        intent: 'search_pitching',
        filters: {
          game_date: '2025-08-15',
          team: 'ロッテ',
          pitcher_name: '益田',
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

  it('resolves romanized player names before home run event search', async () => {
    const database = openDatabase()

    try {
      migrateDatabase(database)
      loadRichGame(database, buildFixtureRichGame())

      const service = createChatService(sqliteDatabaseToQuery(database))
      const response = await service.answerQuestion('2025年にYamadaが打ったホームラン一覧')

      expect(response.answer.resolved_player).toMatchObject({
        input: 'Yamada',
        player_id: 'yamada',
        name: '山田',
        status: 'resolved',
      })
      expect(response.structured_query.filters).toMatchObject({
        year: 2025,
        batter_name: '山田',
        batter_player_id: 'yamada',
        event_type: 'plate_appearance',
        result_text_contains: 'ホームラン',
      })
      expect(response.answer.result_count).toBe(1)
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

  it('resolves a full-name player alias to one entity', async () => {
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

    expect(response.answer.resolved_player).toMatchObject({
      input: '山田哲人',
      player_id: '91895133',
      name: '山田',
      primary_team: 'ヤクルト',
      status: 'resolved',
    })
    expect(response.structured_query.filters).toMatchObject({
      batter_name: '山田',
      batter_player_id: '91895133',
    })
    expect(response.answer.result_count).toBe(1)
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
    expect(response.answer.summary).toContain('選手を特定できない')
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
    expect(response.structured_query.filters).toMatchObject({
      year: 2026,
      team: 'ヤクルト',
      player_name: '村上',
      player_id: 'murakami',
    })
    expect(response.answer.result_count).toBe(0)
    expect(response.answer.summary).toBe('条件に一致する打撃成績は見つかりませんでした。DB結果にないため、推測では回答しません。')
    expect(response.answer.summary).not.toContain('選手を特定できない')
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
} = {}): ChatQueryService {
  const emptyResults = options.empty === true
  return {
    searchEvents: async () => emptyResults
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
        }],
    searchGames: async () => [],
    searchBattingLines: async () => emptyResults
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
        }],
    searchPitchingLines: async () => [],
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
    searchGameDetails: async () => [],
    aggregateBattingLines: async () => [],
    aggregatePitchingLines: async () => [],
    aggregateEvents: async () => [],
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
