import { describe, expect, it, vi } from 'vitest'
import {
  createMultiYearQueryService,
  migrateDatabase,
  openDatabase,
  sqliteDatabaseToQuery,
  type ChatQueryService,
} from '@npb/db'
import { richGameSchema } from '@npb/schemas'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadRichGame } from '../../../packages/db/src/loader'
import { formatChatAnswer } from '../server/services/chat-answer-formatter'
import { createChatService } from '../server/services/chat-service'
import { ChatFinalAnswerLlmHttpError } from '../server/services/chat-final-answer-llm'

const REPOSITORY_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SQLITE_DIR = path.resolve(REPOSITORY_ROOT, 'data')
const CHAT_SERVICE_SOURCE = path.resolve(REPOSITORY_ROOT, 'apps/web/server/services/chat-service.ts')
const CHAT_POST_SOURCE = path.resolve(REPOSITORY_ROOT, 'apps/web/server/api/chat.post.ts')

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

function scopedResolution<const Scope extends 'current' | 'historical' | 'unspecified'>(
  scope: Scope,
  playerId: string,
) {
  return {
    input: '山田',
    player_id: playerId,
    name: '山田',
    primary_team: '巨人',
    status: 'resolved' as const,
    candidates: [{
      player_id: playerId,
      name: '山田',
      primary_team: '巨人',
      roles: ['batter'],
      teams: ['巨人'],
      years: scope === 'current' ? [2026] : [2025],
    }],
    identityResolution: {
      path: 'candidate_search' as const,
      field: 'player_name' as const,
      input: '山田',
      status: 'resolved' as const,
      playerId,
      candidateCount: 1,
      candidatePlayerIds: [playerId],
      candidateNames: ['山田'],
      hasTeamFilter: false,
      hasYearFilter: scope !== 'unspecified',
      context: {
        scope,
        team: null,
        season: scope === 'current' ? 2026 : scope === 'historical' ? 2025 : null,
        hasTeamFilter: false,
        hasYearFilter: scope !== 'unspecified',
      },
    },
  }
}

describe('chat-service', () => {
  it('does not contain request-time NPB or BIS fetch fallbacks', () => {
    const source = readFileSync(CHAT_SERVICE_SOURCE, 'utf8')
    expect(source).not.toMatch(/fetchOfficial|OfficialStatsFallback|https:\/\/npb\.jp\/bis|https:\/\/npb\.jp\/award/)
    expect(source).not.toMatch(/fetch\(/)
  })

  it('routes generic stat questions for resolved pitchers to pitching stats', async () => {
    let battingCalled = false
    let pitchingFilters: Parameters<ChatQueryService['searchPitchingLines']>[0] | null = null
    const service = createChatService(createFakeQueryService({
      playerCandidates: [{
        player_id: '01705156',
        name: '尾形 崇斗',
        primary_team: '福岡ソフトバンクホークス',
        roles: ['pitcher', 'bis_pitching'],
        teams: ['福岡ソフトバンクホークス'],
        years: [2026],
      }],
      searchBattingLines: async () => {
        battingCalled = true
        return []
      },
      searchPitchingLines: async (filters) => {
        pitchingFilters = filters
        return [{
          gameId: 'bis:2026:reg:idp1',
          gameDate: '2026-01-01',
          team: '福岡ソフトバンクホークス',
          pitcherName: '尾形 崇斗',
          inningsPitched: '17',
          pitchCount: 0,
          hitsAllowed: 10,
          homeRunsAllowed: 1,
          walks: 5,
          hitBatters: 0,
          strikeouts: 20,
          runs: 4,
          earnedRuns: 4,
          rawText: JSON.stringify({ 登板: '18', 三振: '20', 投球回: '17', 防御率: '2.12' }),
          sourceKind: 'bis_pitching',
          sourceUrl: 'https://npb.jp/bis/2026/stats/idp1_h.html',
          statsJson: JSON.stringify({ 登板: '18', 三振: '20', 投球回: '17', 防御率: '2.12' }),
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { player_name: '尾形' },
      }),
    })

    const response = await service.answerQuestion('尾形の成績を教えて')

    expect(battingCalled).toBe(true)
    expect(response.structured_query!.intent).toBe('search_pitching')
    expect(pitchingFilters).toMatchObject({
      pitcher_name: '尾形 崇斗',
      pitcher_player_id: '01705156',
    })
    expect(response.answer.summary).toContain('投手成績')
    expect(response.answer.summary).not.toContain('打撃成績')
  })

  it('keeps generic stat questions for resolved fielders on batting stats', async () => {
    let pitchingCalled = false
    const service = createChatService(createFakeQueryService({
      playerCandidates: [{
        player_id: 'murakami',
        name: '村上 宗隆',
        primary_team: '東京ヤクルトスワローズ',
        roles: ['batter', 'bis_batting'],
        teams: ['東京ヤクルトスワローズ'],
        years: [2026],
      }],
      searchPitchingLines: async () => {
        pitchingCalled = true
        return []
      },
      searchBattingLines: async () => [{
        gameId: 'bis:2026:reg:idb1',
        gameDate: '2026-01-01',
        team: '東京ヤクルトスワローズ',
        playerName: '村上 宗隆',
        battingOrder: null,
        position: null,
        atBats: 120,
        runs: 0,
        hits: 36,
        runsBattedIn: 22,
        stolenBases: 0,
        strikeouts: 30,
        walks: 20,
        rawText: JSON.stringify({ 試合: '40', 打数: '120', 安打: '36', 本塁打: '8', 打点: '22', 打率: '.300' }),
        sourceKind: 'bis_batting',
        sourceUrl: 'https://npb.jp/bis/2026/stats/idb1_s.html',
        statsJson: JSON.stringify({ 試合: '40', 打数: '120', 安打: '36', 本塁打: '8', 打点: '22', 打率: '.300' }),
      }],
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { player_name: '村上' },
      }),
    })

    const response = await service.answerQuestion('村上の成績を教えて')

    expect(response.structured_query!.intent).toBe('search_batting')
    expect(pitchingCalled).toBe(false)
    expect(response.answer.summary).toContain('打撃成績')
    expect(response.answer.summary).not.toContain('投手成績')
  })

  it('lets the Planner classify non-baseball topics', async () => {
    let parserCalled = false
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => {
        parserCalled = true
        return { intent: 'off_topic', filters: {} }
      },
    })

    const response = await service.answerQuestion('今日の天気はどうですか？')

    expect(parserCalled).toBe(true)
    expect(response.structured_query).toEqual({ intent: 'off_topic', filters: {} })
    expect(response.answer.summary).toContain('NPB（日本プロ野球）')
    expect(response.answer.summary).not.toContain('文脈を特定しきれません')
    expect(response.answer.result_count).toBe(0)
    expect(response.results.events).toHaveLength(0)
  })

  it('routes realtime lineup questions to Sports Navi without repository access', async () => {
    const queryService = createFakeQueryService()
    queryService.searchRosterEntries = vi.fn(async () => {
      throw new Error('repository must not be called for realtime guidance')
    })
    const service = createChatService(queryService, {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_roster',
        filters: { team: '巨人', starter: true },
      }),
    })

    const response = await service.answerQuestion('巨人の今日のスタメンは？')

    expect(queryService.searchRosterEntries).not.toHaveBeenCalled()
    expect(response.answer.summary).toContain('スポーツナビ プロ野球')
    expect(response.answer.summary).toContain('https://baseball.yahoo.co.jp/npb/')
    expect(response.answer.execution_metadata).toMatchObject({
      question_intent: 'realtime',
      capability_route: 'external_source_guidance',
      capability_uses_repository: false,
      external_source_url: 'https://baseball.yahoo.co.jp/npb/',
    })
  })

  it('routes news and injury questions to Sports Navi without using stored stats as a guess', async () => {
    const searchPitchingLines = vi.fn(async () => [{
      gameId: 'r20260711db-g-01',
      gameDate: '2026-07-11',
      team: 'DeNA',
      pitcherName: '藤浪',
      inningsPitched: '3',
      pitchCount: 60,
      strikeouts: 4,
      runs: 3,
      earnedRuns: 3,
      sourceKind: 'box' as const,
      sourceUrl: 'https://npb.jp/scores/2026/0711/db-g-01/box.html',
      statsJson: null,
    }])
    const service = createChatService(createFakeQueryService({ searchPitchingLines }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: { pitcher_name: '藤浪', recent: true },
      }),
    })

    const response = await service.answerQuestion('藤浪ってケガした？')

    expect(searchPitchingLines).not.toHaveBeenCalled()
    expect(response.answer.summary).toContain('ケガ・公示・契約・移籍')
    expect(response.answer.summary).toContain('https://baseball.yahoo.co.jp/npb/')
    expect(response.answer.execution_metadata?.question_intent).toBe('news')
  })

  it('keeps opinion on the repository path and appends commentary only after analysis evidence', async () => {
    const searchPitchingLines = vi.fn(async () => [{
      gameId: 'r20260711db-g-01',
      gameDate: '2026-07-11',
      team: 'DeNA',
      pitcherName: '藤浪',
      inningsPitched: '3',
      pitchCount: 60,
      strikeouts: 4,
      runs: 3,
      earnedRuns: 3,
      sourceKind: 'box' as const,
      sourceUrl: 'https://npb.jp/scores/2026/0711/db-g-01/box.html',
      statsJson: null,
    }])
    const service = createChatService(createFakeQueryService({ searchPitchingLines }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: { pitcher_name: '藤浪', recent: true, limit: 5 },
      }),
      formatChatAnswer,
    })

    const response = await service.answerQuestion('藤浪の最近の投球をどう評価する？')

    expect(searchPitchingLines).toHaveBeenCalled()
    expect(response.answer.summary).toContain('データを見る限り')
    expect(response.answer.summary).toContain('ニュース、ケガ、契約')
    expect(response.answer.execution_metadata).toMatchObject({
      question_intent: 'opinion',
      capability_route: 'analysis_then_opinion',
      capability_requires_analysis: true,
      capability_uses_repository: true,
    })
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

    const response = await service.answerQuestion('それで最近どう？', {
      history: [
        { role: 'user', content: '巨人の大城って今どんな感じ' },
        { role: 'assistant', content: '大城の打撃成績です。' },
      ],
    })

    expect(parserCalled).toBe(true)
    expect(response.structured_query).toMatchObject({
      intent: 'search_batting',
      filters: { player_name: '大城', team: '巨人', recent: true },
    })
    expect(response.answer.applied_filters).toMatchObject({ player_name: '大城', team: '巨人', recent: true })
    expect(response.answer.execution_metadata?.follow_up_context).toMatchObject({
      contextKind: 'player_stats',
      inheritedPlayerName: '大城',
      inheritedTeam: '巨人',
      shouldApplyInheritance: false,
    })
    expect(response.answer.execution_metadata?.follow_up_context_applied).toBeUndefined()
  })

  it('allows terse correction and recheck follow-ups when history is baseball context', async () => {
    const seenMessages: string[] = []
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async (message) => {
        seenMessages.push(message)
        return {
          intent: 'search_pitching',
          filters: { pitcher_name: '藤浪', recent: true },
        }
      },
    })
    const history = [
      { role: 'user' as const, content: '藤浪ってホームラン打ったことある？' },
      {
        role: 'assistant' as const,
        content: [
          '藤浪 晋太郎のホームランは2件です。',
          '1. 2018年9月16日 3回表 阪神 藤浪: レフト満塁ホームラン（打点4）',
          '2. 2021年4月16日 5回裏 阪神 藤浪: レフト2ランホームラン（打点2）',
        ].join('\n'),
      },
    ]

    for (const message of ['つまり？', '調べなおして', 'さっきの二つ目', '違う、その前のやつ']) {
      await service.answerQuestion(message, { history })
    }

    expect(seenMessages).toEqual(['つまり？', '調べなおして', 'さっきの二つ目', '違う、その前のやつ'])
  })

  it('allows terse player stats follow-ups when history is baseball context', async () => {
    const seenMessages: string[] = []
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async (message) => {
        seenMessages.push(message)
        return {
          intent: 'search_pitching',
          filters: { pitcher_name: '藤浪', recent: true },
        }
      },
    })
    const history = [
      { role: 'user' as const, content: '藤浪って最近何してんの' },
      {
        role: 'assistant' as const,
        content: '横浜DeNAベイスターズ 藤浪 晋太郎の確認できる最新5試合の投球内容です。2026年二軍での対象試合です。',
      },
    ]

    for (const message of ['去年と比べてどう？', '一軍の話？', 'いや藤浪じゃなくて村上']) {
      await service.answerQuestion(message, { history })
    }

    expect(seenMessages).toEqual(['去年と比べてどう？', '一軍の話？', 'いや藤浪じゃなくて村上'])
  })

  it('allows known NPB player short status questions without history', async () => {
    let parserCalled = false
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => {
        parserCalled = true
        return {
          intent: 'search_pitching',
          filters: { pitcher_name: '藤浪', recent: true },
        }
      },
    })

    const response = await service.answerQuestion('藤浪どう？')

    expect(parserCalled).toBe(true)
    expect(response.structured_query).toMatchObject({
      intent: 'search_pitching',
      filters: { pitcher_name: '藤浪', recent: true },
    })
  })

  it('allows an elliptical recent player question through topic detection and planner normalization', async () => {
    let parserCalled = false
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => {
        parserCalled = true
        return {
          intent: 'search_pitching',
          filters: { pitcher_name: '藤浪', recent: true, limit: 1 },
        }
      },
    })

    const response = await service.answerQuestion('藤浪の直近の内容')

    expect(parserCalled).toBe(true)
    expect(response.structured_query).toMatchObject({
      intent: 'search_pitching',
      filters: { pitcher_name: '藤浪', recent: true, limit: 1 },
    })
  })

  it('applies limited player stats follow-up context to missing player, team, season and scope', async () => {
    let pitchingFilters: Parameters<ChatQueryService['searchPitchingLines']>[0] | null = null
    const currentResolver = vi.fn(async (_queryService, structuredQuery) => ({
      structuredQuery: {
        ...structuredQuery,
        filters: {
          ...structuredQuery.filters,
          pitcher_player_id: '41045137',
          year: 2025,
        },
      },
      resolution: {
        ...scopedResolution('current', '41045137'),
        input: '藤浪 晋太郎',
        name: '藤浪 晋太郎',
        primary_team: '横浜DeNAベイスターズ',
        yearShiftNote: '2026年の記録は確認できないため、代わりに最終確認年（2025年）のデータを表示します。',
      },
    }))
    const service = createChatService(createFakeQueryService({
      searchPitchingLines: async (filters) => {
        pitchingFilters = filters
        return [{
          gameId: 'bis:2026:db:fujinami',
          gameDate: '2026-06-01',
          team: '横浜DeNAベイスターズ',
          pitcherName: '藤浪 晋太郎',
          result: '勝',
          inningsPitched: '6',
          battersFaced: 24,
          pitchCount: 98,
          hitsAllowed: 3,
          homeRunsAllowed: 0,
          strikeouts: 7,
          walks: 2,
          hitByPitch: 0,
          runs: 1,
          earnedRuns: 1,
          rawText: '藤浪 6回 1失点',
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: { year: 2025, recent: true, limit: 5 },
      }),
      resolveCurrentStructuredQueryPlayer: currentResolver,
    })

    const response = await service.answerQuestion('どこがよかった？', {
      history: [
        { role: 'user', content: '藤浪の最近の投球は？' },
        { role: 'assistant', content: '横浜DeNAベイスターズ 藤浪 晋太郎の2026年の確認できる最新5試合の投球内容です。' },
      ],
    })

    expect(response.structured_query!.filters).toMatchObject({
      pitcher_name: '藤浪 晋太郎',
      pitcher_player_id: '41045137',
      team: '横浜DeNAベイスターズ',
      year: 2026,
      recent: true,
      limit: 5,
    })
    expect(pitchingFilters).toMatchObject({
      pitcher_name: '藤浪 晋太郎',
      pitcher_player_id: '41045137',
      team: '横浜DeNAベイスターズ',
      year: 2026,
    })
    expect(currentResolver).toHaveBeenCalledTimes(1)
    expect(response.answer.execution_metadata?.follow_up_context).toMatchObject({
      contextKind: 'player_stats',
      inheritedPlayerName: '藤浪 晋太郎',
      inheritedTeam: '横浜DeNAベイスターズ',
      inheritedSeason: 2026,
      inheritedScope: 'current',
      shouldApplyInheritance: false,
    })
    expect(response.answer.execution_metadata?.follow_up_context_applied).toEqual({
      applied: true,
      fields: ['player', 'team', 'season'],
      reason: 'player_stats_follow_up_context',
    })
    expect(response.answer.execution_metadata?.correction_guard).toMatchObject({
      inheritanceBlockedReason: 'none',
      shouldBlockInheritance: false,
    })
    expect(response.answer.summary).toContain('良かった点です')
  })

  it('keeps pitching evaluation follow-ups on player stats when the parser shifts to event search', async () => {
    let pitchingFilters: Parameters<ChatQueryService['searchPitchingLines']>[0] | null = null
    const currentResolver = vi.fn(async (_queryService, structuredQuery) => ({
      structuredQuery: {
        ...structuredQuery,
        filters: {
          ...structuredQuery.filters,
          pitcher_player_id: '41045137',
        },
      },
      resolution: scopedResolution('current', '41045137'),
    }))
    const service = createChatService(createFakeQueryService({
      searchPitchingLines: async (filters) => {
        pitchingFilters = filters
        return [{
          gameId: 'f20260711g-db-13',
          gameDate: '2026-07-11',
          team: '横浜DeNAベイスターズ',
          pitcherName: '藤浪 晋太郎',
          result: null,
          inningsPitched: '3',
          battersFaced: 16,
          pitchCount: 94,
          hitsAllowed: 4,
          homeRunsAllowed: 0,
          strikeouts: 4,
          walks: 3,
          hitByPitch: 0,
          runs: 3,
          earnedRuns: 3,
          rawText: '藤浪 3回 3自責点',
        }]
      },
      searchGameDetails: async () => {
        throw new Error('searchGameDetails should not be called for pitching evaluation follow-up')
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: {
          year: 2026,
          team: '横浜DeNAベイスターズ',
          pitcher_name: '藤浪 晋太郎',
          pitcher_player_id: '41045137',
          limit: 10,
        },
      }),
      resolveCurrentStructuredQueryPlayer: currentResolver,
    })

    const response = await service.answerQuestion('どこがよかった？', {
      history: [
        { role: 'user', content: '藤浪どう？' },
        {
          role: 'assistant',
          content: '横浜DeNAベイスターズ 藤浪の確認できる最新1試合の投球内容です。\n最新登板は2026年7月11日で、3回、4奪三振、自責点3です。',
        },
      ],
    })

    expect(response.structured_query).toMatchObject({
      intent: 'search_pitching',
      filters: {
        pitcher_name: expect.stringContaining('藤浪'),
        pitcher_player_id: '41045137',
        year: 2026,
        recent: true,
        limit: 5,
      },
    })
    expect(pitchingFilters).toMatchObject({
      pitcher_player_id: '41045137',
      year: 2026,
      recent: true,
    })
    expect(response.answer.summary).toContain('良かった点です')
  })

  it('keeps mixed first-team and farm pitching evaluation follow-ups on pitching lines', async () => {
    let pitchingFilters: Parameters<ChatQueryService['searchPitchingLines']>[0] | null = null
    const currentResolver = vi.fn(async (_queryService, structuredQuery) => ({
      structuredQuery: {
        ...structuredQuery,
        filters: {
          ...structuredQuery.filters,
          pitcher_player_id: '41045137',
        },
      },
      resolution: scopedResolution('current', '41045137'),
    }))
    const service = createChatService(createFakeQueryService({
      searchPitchingLines: async (filters) => {
        pitchingFilters = filters
        return [{
          gameId: 'r20260711db-g-12',
          gameDate: '2026-07-11',
          team: '横浜DeNAベイスターズ',
          pitcherName: '藤浪',
          result: null,
          inningsPitched: '3',
          battersFaced: 18,
          pitchCount: 94,
          hitsAllowed: 3,
          homeRunsAllowed: 0,
          strikeouts: 4,
          walks: 6,
          hitByPitch: 0,
          runs: 3,
          earnedRuns: 3,
          rawText: '藤浪 3回 3自責点',
        }]
      },
      searchEvents: async () => {
        throw new Error('searchEvents should not be called for mixed pitching evaluation follow-up')
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: {
          team: '横浜DeNAベイスターズ',
          pitcher_name: '藤浪 晋太郎',
          pitcher_player_id: '41045137',
          limit: 5,
        },
      }),
      resolveCurrentStructuredQueryPlayer: currentResolver,
    })

    const response = await service.answerQuestion('どこがよかった？', {
      history: [
        { role: 'user', content: '藤浪どう？' },
        {
          role: 'assistant',
          content: [
            '横浜DeNAベイスターズ 藤浪の確認できる最新5試合の投球内容です。',
            '2026年一軍・二軍での対象試合です。',
            '内容は5試合で22奪三振、10自責点、94球です。',
            '最新登板は2026年7月11日で、3回、4奪三振、自責点3です。',
            '対象試合: 2026年7月11日、2026年7月1日、2026年6月21日、2026年6月13日、2026年6月5日',
            '2026年5月8日から2026年4月1日まで37日空いているため、最新10件を連続した最近の調子として扱う場合は注意が必要です。',
          ].join('\n'),
        },
      ],
    })

    expect(response.structured_query).toMatchObject({
      intent: 'search_pitching',
      filters: {
        pitcher_name: expect.stringContaining('藤浪'),
        pitcher_player_id: '41045137',
        year: 2026,
        recent: true,
        limit: 5,
      },
    })
    expect(pitchingFilters).toMatchObject({
      pitcher_player_id: '41045137',
      year: 2026,
      recent: true,
    })
    expect(response.answer.summary).toContain('良かった点です')
  })

  it('keeps evaluation follow-up event context without parser text-search noise', async () => {
    let eventFilters: Parameters<ChatQueryService['searchEvents']>[0] | null = null
    const service = createChatService(createFakeQueryService({
      searchEvents: async (filters) => {
        eventFilters = filters
        return filters.result_text_contains
          ? []
          : [{
              gameId: 'r20250401db-s-01',
              gameDate: '2025-04-01',
              sequence: 1,
              inning: 1,
              half: 'top',
              offenseTeam: 'ヤクルト',
              eventType: 'plate_appearance',
              eventSubtype: 'standard',
              batterName: '村上',
              pitcherName: '藤浪 晋太郎',
              runnerName: null,
              resultText: 'ライト前ヒット',
              eventAttributesJson: null,
              sourceUrl: 'https://npb.jp/scores/2025/0401/db-s-01/playbyplay.html',
            }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: {
          year: 2025,
          pitcher_name: '藤浪 晋太郎',
          pitcher_player_id: '41045137',
          game_id: 'r20250401db-s-01',
          result_text_contains: '良かった',
        },
      }),
    })

    const response = await service.answerQuestion('どこがよかった？', {
      history: [
        { role: 'user', content: '藤浪どう？' },
        { role: 'assistant', content: '横浜DeNAベイスターズ 藤浪 晋太郎の確認できる最新5試合の投球内容です。' },
      ],
    })

    expect(response.structured_query).toMatchObject({
      intent: 'search_events',
      filters: {
        year: 2025,
        pitcher_player_id: '41045137',
        game_id: 'r20250401db-s-01',
      },
    })
    expect(response.structured_query!.filters).not.toHaveProperty('result_text_contains')
    expect(response.structured_query!.filters).toMatchObject({ limit: 5 })
    expect(eventFilters).toMatchObject({
      year: 2025,
      pitcher_player_id: '41045137',
      game_id: 'r20250401db-s-01',
      limit: 5,
    })
    expect(eventFilters).not.toHaveProperty('result_text_contains')
    expect(response.answer.summary).toContain('2025年藤浪晋太郎から打ったイベントです。')
    expect(response.answer.summary).toContain('該当数: 1件')
    expect(response.answer.execution_metadata?.follow_up_type).toBe('evaluation_request')
  })

  it.skip('keeps explicit season correction ahead of inherited player stats season', async () => {
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { player_name: '村上宗隆', team: '東京ヤクルトスワローズ', year: 2025 },
      }),
      resolveStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
      resolveCurrentStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
      resolveHistoricalStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
    })

    const response = await service.answerQuestion('村上宗隆の成績は今年じゃなくて去年', {
      history: [
        { role: 'user', content: '村上の今年の成績は？' },
        { role: 'assistant', content: '東京ヤクルトスワローズ 村上宗隆の2026年の打撃成績です。' },
      ],
    })

    expect(response.structured_query!.filters).toMatchObject({
      player_name: '村上',
      team: 'ヤクルト',
      year: 2025,
    })
    expect(response.structured_query!.intent).toBe('aggregate_batting')
    expect(response.answer.execution_metadata?.correction_guard).toMatchObject({
      inheritanceBlockedReason: 'explicit_season_override',
      hasExplicitSeasonOverride: true,
      shouldBlockInheritance: true,
    })
    expect(response.answer.execution_metadata?.follow_up_context_applied).toBeUndefined()
  })

  it.skip('does not inherit the previous player when the follow-up names another player', async () => {
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { player_name: '村上', year: 2026 },
      }),
      resolveCurrentStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
    })

    const response = await service.answerQuestion('いや藤浪じゃなくて村上の成績', {
      history: [
        { role: 'user', content: '藤浪の今年の打撃は？' },
        { role: 'assistant', content: '横浜DeNAベイスターズ 藤浪 晋太郎の2026年の打撃成績です。' },
      ],
    })

    expect(response.structured_query!.filters).toMatchObject({
      player_name: '村上',
      team: 'ヤクルト',
      year: 2025,
    })
    expect(response.structured_query!.intent).toBe('aggregate_batting')
    expect(response.structured_query!.filters).not.toMatchObject({
      player_name: '藤浪 晋太郎',
    })
    expect(response.answer.execution_metadata?.correction_guard).toMatchObject({
      inheritanceBlockedReason: 'player_replacement',
      hasPlayerReplacement: true,
      shouldBlockInheritance: true,
    })
    expect(response.answer.execution_metadata?.follow_up_context_applied).toBeUndefined()
  })

  it.skip('restores recheck follow-ups for home run history to the original event list', async () => {
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'off_topic',
        filters: {},
      }),
      resolveStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
    })

    const response = await service.answerQuestion('調べなおして', {
      history: [
        { role: 'user', content: '藤浪ってホームラン打ったことある？' },
        {
          role: 'assistant',
          content: [
            '藤浪 晋太郎のホームランは2件です。',
            '1. 2018年9月16日 3回表 阪神 藤浪: レフト満塁ホームラン（打点4）',
            '2. 2021年4月16日 5回裏 阪神 藤浪: レフト2ランホームラン（打点2）',
          ].join('\n'),
        },
      ],
    })

    expect(response.structured_query).toEqual({
      intent: 'search_events',
      filters: {
        batter_name: '藤浪',
        event_type: 'plate_appearance',
        result_text_contains: 'ホームラン',
      },
    })
  })

  it('keeps comparison follow-ups on recent pitching evidence instead of broad aggregates', async () => {
    let aggregateCalled = false
    let pitchingFilters: Parameters<ChatQueryService['searchPitchingLines']>[0] | null = null
    const service = createChatService(createFakeQueryService({
      searchPitchingLines: async (filters) => {
        pitchingFilters = filters
        return [
          {
            gameId: 'f20260621db-d-01',
            gameDate: '2026-06-21',
            team: '横浜DeNAベイスターズ',
            pitcherName: '藤浪 晋太郎',
            inningsPitched: '5',
            pitchCount: 90,
            hitsAllowed: 3,
            homeRunsAllowed: 0,
            walks: 2,
            hitBatters: 0,
            strikeouts: 6,
            runs: 1,
            earnedRuns: 1,
            rawText: '藤浪 5回 1失点',
            sourceKind: 'box',
            sourceUrl: null,
          },
        ]
      },
      aggregatePitchingLines: async () => {
        aggregateCalled = true
        return []
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: { pitcher_name: '藤浪', recent: true },
      }),
      resolveStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
      formatChatAnswer,
    })

    const response = await service.answerQuestion('去年と比べてどう？', {
      history: [
        { role: 'user', content: '藤浪って最近何してんの' },
        { role: 'assistant', content: '横浜DeNAベイスターズ 藤浪 晋太郎の確認できる最新5試合の投球内容です。2026年二軍での対象試合です。内容は5試合で22奪三振、8自責点です。' },
      ],
    })

    expect(aggregateCalled).toBe(false)
    expect(response.structured_query).toMatchObject({
      intent: 'search_pitching',
      filters: { pitcher_name: '藤浪', recent: true },
    })
    expect(pitchingFilters).toMatchObject({ pitcher_name: '藤浪', recent: true })
    expect(response.answer.summary).toContain('昨年の同条件と直接の通算比較はできません')
  })

  it('rewrites single-player pitching comparison follow-ups back to search_pitching when no season range is present', async () => {
    let aggregateCalled = false
    let pitchingFilters: Parameters<ChatQueryService['searchPitchingLines']>[0] | null = null
    const service = createChatService(createFakeQueryService({
      searchPitchingLines: async (filters) => {
        pitchingFilters = filters
        return [{
          gameId: 'f20260610db-e-01',
          gameDate: '2026-06-10',
          team: '横浜DeNAベイスターズ',
          pitcherName: '藤浪',
          inningsPitched: '6',
          pitchCount: 91,
          strikeouts: 7,
          runs: 0,
          earnedRuns: 0,
          sourceKind: 'box',
        }]
      },
      aggregatePitchingLines: async () => {
        aggregateCalled = true
        return []
      },
    }), {
      allowFinalAnswerFallback: false,
      parseStructuredQueryFromMessage: async () => ({
        intent: 'aggregate_pitching',
        filters: { pitcher_name: '藤浪', limit: 10 },
      }),
    })

    const response = await service.answerQuestion('去年と比べてどう？', {
      history: [
        { role: 'user', content: '藤浪って最近何してんの' },
        { role: 'assistant', content: '横浜DeNAベイスターズ 藤浪 晋太郎の確認できる最新5試合の投球内容です。2026年二軍での対象試合です。内容は5試合で22奪三振、8自責点です。' },
      ],
    })

    expect(aggregateCalled).toBe(false)
    expect(response.structured_query).toMatchObject({
      intent: 'search_pitching',
      filters: { pitcher_name: '藤浪', recent: true, limit: 5 },
    })
    expect(pitchingFilters).toMatchObject({ pitcher_name: '藤浪', recent: true, limit: 5 })
    expect(response.answer.summary).toContain('昨年の同条件と直接の通算比較はできません')
  })

  it('uses planner comparison metadata for player stats follow-up rewrite without comparison wording fallback', async () => {
    let aggregateCalled = false
    let pitchingFilters: Parameters<ChatQueryService['searchPitchingLines']>[0] | null = null
    const service = createChatService(createFakeQueryService({
      searchPitchingLines: async (filters) => {
        pitchingFilters = filters
        return [{
          gameId: 'f20260621db-d-01',
          gameDate: '2026-06-21',
          team: '横浜DeNAベイスターズ',
          pitcherName: '藤浪 晋太郎',
          inningsPitched: '5',
          pitchCount: 90,
          hitsAllowed: 3,
          homeRunsAllowed: 0,
          walks: 2,
          hitBatters: 0,
          strikeouts: 6,
          runs: 1,
          earnedRuns: 1,
          rawText: '藤浪 5回 1失点',
          sourceKind: 'box',
          sourceUrl: null,
        }]
      },
      aggregatePitchingLines: async () => {
        aggregateCalled = true
        return []
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: { pitcher_name: '藤浪', recent: true },
      }),
      resolveStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
      formatChatAnswer,
    })

    const response = await service.answerQuestion('藤浪の投球、移籍後は？', {
      history: [
        { role: 'user', content: '藤浪って最近何してんの' },
        { role: 'assistant', content: '横浜DeNAベイスターズ 藤浪 晋太郎の確認できる最新5試合の投球内容です。2026年二軍での対象試合です。内容は5試合で22奪三振、8自責点です。' },
      ],
    })

    expect(aggregateCalled).toBe(false)
    expect(response.structured_query).toMatchObject({
      intent: 'search_pitching',
      filters: { pitcher_name: '藤浪', recent: true },
    })
    expect(pitchingFilters).toMatchObject({ pitcher_name: '藤浪', recent: true })
  })

  it('keeps multi-pitcher recent comparisons as pitching evidence for each resolved player', async () => {
    const service = createChatService(createFakeQueryService({
      playerCandidatesForFilters: (filters) => {
        if (filters.name === '石田裕太郎') {
          return [{
            player_id: '21125159',
            name: '石田 裕太郎',
            primary_team: '横浜DeNAベイスターズ',
            roles: ['profile'],
            teams: ['横浜DeNAベイスターズ'],
            years: [2026],
          }]
        }
        if (filters.name === '東克樹') {
          return [{
            player_id: '51155136',
            name: '東 克樹',
            primary_team: '横浜DeNAベイスターズ',
            roles: ['profile'],
            teams: ['横浜DeNAベイスターズ'],
            years: [2026],
          }]
        }
        return []
      },
      searchPitchingLines: async (filters) => {
        const playerId = filters.pitcher_player_id
        const name = playerId === '21125159' ? '石田裕' : '東'
        return [0, 1, 2].map((index) => ({
          gameId: `r2026042${index}${playerId}`,
          gameDate: `2026-04-2${index}`,
          team: '横浜DeNAベイスターズ',
          pitcherName: name,
          inningsPitched: index === 0 ? '6' : '5',
          pitchCount: 90 + index,
          hitsAllowed: 4,
          homeRunsAllowed: 0,
          walks: 1,
          hitBatters: 0,
          strikeouts: 5 + index,
          runs: index,
          earnedRuns: index,
          sourceKind: 'box' as const,
          sourceUrl: null,
        }))
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: { pitcher_names: ['石田裕太郎', '東克樹'], recent: true, limit: 3 },
      }),
      formatChatAnswer,
    })

    const response = await service.answerQuestion('石田裕太郎と東克樹のそれぞれ直近3試合の成績を比較して')

    expect(response.structured_query).toEqual({
      intent: 'search_pitching',
      filters: {
        pitcher_names: ['石田裕太郎', '東克樹'],
        pitcher_player_ids: ['21125159', '51155136'],
        recent: true,
        limit: 3,
      },
    })
    expect(response.answer.execution_metadata?.player_id_satisfied).toBe(true)
    expect(response.answer.execution_metadata?.resolved_players?.map((player) => player.player_id)).toEqual([
      '21125159',
      '51155136',
    ])
    expect(response.results.pitching).toHaveLength(6)
    expect(response.answer.summary).toContain('石田 裕太郎: 3登板')
    expect(response.answer.summary).toContain('東 克樹: 3登板')
  })

  it('replans dissatisfaction follow-ups from the previous user question instead of off_topic', async () => {
    const previousQuestion = '石田裕太郎と東克樹のそれぞれ直近3試合の成績を比較して'
    const service = createChatService(createFakeQueryService({
      playerCandidatesForFilters: (filters) => {
        if (filters.name === '石田裕太郎') {
          return [{
            player_id: '21125159',
            name: '石田 裕太郎',
            primary_team: '横浜DeNAベイスターズ',
            roles: ['profile'],
            teams: ['横浜DeNAベイスターズ'],
            years: [2026],
          }]
        }
        if (filters.name === '東克樹') {
          return [{
            player_id: '51155136',
            name: '東 克樹',
            primary_team: '横浜DeNAベイスターズ',
            roles: ['profile'],
            teams: ['横浜DeNAベイスターズ'],
            years: [2026],
          }]
        }
        return []
      },
      searchPitchingLines: async (filters) => {
        const playerId = filters.pitcher_player_id
        const name = playerId === '21125159' ? '石田裕' : '東'
        return [{
          gameId: `r20260420${playerId}`,
          gameDate: '2026-04-20',
          team: '横浜DeNAベイスターズ',
          pitcherName: name,
          inningsPitched: '6',
          pitchCount: 90,
          hitsAllowed: 4,
          homeRunsAllowed: 0,
          walks: 1,
          hitBatters: 0,
          strikeouts: 5,
          runs: 1,
          earnedRuns: 1,
          sourceKind: 'box' as const,
          sourceUrl: null,
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async (message) => (
        message === previousQuestion
          ? {
              intent: 'search_pitching',
              filters: { pitcher_names: ['石田裕太郎', '東克樹'], recent: true, limit: 3 },
            }
          : { intent: 'off_topic', filters: {} }
      ),
      formatChatAnswer,
    })

    const response = await service.answerQuestion('は？答えになってない。', {
      history: [
        { role: 'user', content: previousQuestion },
        { role: 'assistant', content: '石田裕だけの最新1出場の打撃成績です。' },
      ],
    })

    expect(response.structured_query!.intent).toBe('search_pitching')
    expect(response.answer.execution_metadata?.follow_up_type).toBe('correction_request')
    expect(response.answer.summary).not.toContain('このサービスはNPB')
    expect(response.answer.summary).toContain('石田 裕太郎')
    expect(response.answer.summary).toContain('東 克樹')
  })

  it('replans correction requests when the current parse loses the previous comparison intent', async () => {
    const previousQuestion = '石田裕太郎と東克樹のそれぞれ直近3試合の成績を比較して'
    const service = createChatService(createFakeQueryService({
      playerCandidatesForFilters: (filters) => {
        if (filters.name === '石田裕太郎') {
          return [{
            player_id: '21125159',
            name: '石田 裕太郎',
            primary_team: '横浜DeNAベイスターズ',
            roles: ['profile'],
            teams: ['横浜DeNAベイスターズ'],
            years: [2026],
          }]
        }
        if (filters.name === '東克樹') {
          return [{
            player_id: '51155136',
            name: '東 克樹',
            primary_team: '横浜DeNAベイスターズ',
            roles: ['profile'],
            teams: ['横浜DeNAベイスターズ'],
            years: [2026],
          }]
        }
        return []
      },
      searchPitchingLines: async (filters) => {
        const playerId = filters.pitcher_player_id
        const name = playerId === '21125159' ? '石田裕' : '東'
        return [{
          gameId: `r20260420${playerId}`,
          gameDate: '2026-04-20',
          team: '横浜DeNAベイスターズ',
          pitcherName: name,
          inningsPitched: '6',
          pitchCount: 90,
          hitsAllowed: 4,
          homeRunsAllowed: 0,
          walks: 1,
          hitBatters: 0,
          strikeouts: 5,
          runs: 1,
          earnedRuns: 1,
          sourceKind: 'box' as const,
          sourceUrl: null,
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async (message) => (
        message === previousQuestion
          ? {
              intent: 'search_pitching',
              filters: { pitcher_names: ['石田裕太郎', '東克樹'], recent: true, limit: 3 },
            }
          : {
              intent: 'search_events',
              filters: {},
            }
      ),
      formatChatAnswer,
    })

    const response = await service.answerQuestion('は？答えになってない。', {
      history: [
        { role: 'user', content: previousQuestion },
        { role: 'assistant', content: '石田裕太郎と東克樹の直近3登板の比較です。' },
      ],
    })

    expect(response.structured_query!.intent).toBe('search_pitching')
    expect(response.structured_query!.filters).toMatchObject({
      pitcher_names: ['石田裕太郎', '東克樹'],
      recent: true,
      limit: 3,
    })
    expect(response.answer.summary).toContain('石田 裕太郎')
    expect(response.answer.summary).toContain('東 克樹')
  })

  it.skip('answers first-team scope clarifications from inherited farm pitching context', async () => {
    let pitchingFilters: Parameters<ChatQueryService['searchPitchingLines']>[0] | null = null
    const service = createChatService(createFakeQueryService({
      playerCandidates: [{
        player_id: '41045137',
        name: '藤浪 晋太郎',
        primary_team: 'DeNA',
        roles: ['pitcher'],
        teams: ['DeNA'],
        years: [2026],
      }],
      searchPitchingLines: async (filters) => {
        pitchingFilters = filters
        return [{
          gameId: 'f20260621db-d-01',
          gameDate: '2026-06-21',
          team: '横浜DeNAベイスターズ',
          pitcherName: '藤浪 晋太郎',
          inningsPitched: '5',
          pitchCount: 90,
          hitsAllowed: 3,
          homeRunsAllowed: 0,
          walks: 2,
          hitBatters: 0,
          strikeouts: 6,
          runs: 1,
          earnedRuns: 1,
          rawText: '藤浪 5回 1失点',
          sourceKind: 'box',
          sourceUrl: null,
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: { year: 2026, team: 'DeNA', pitcher_name: '藤浪 晋太郎', pitcher_player_id: '41045137', recent: true },
      }),
      resolveStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
      formatChatAnswer,
    })

    const response = await service.answerQuestion('一軍の話？', {
      history: [
        { role: 'user', content: '藤浪どう？' },
        { role: 'assistant', content: '横浜DeNAベイスターズ 藤浪 晋太郎の確認できる最新5試合の投球内容です。2026年二軍での対象試合です。' },
      ],
    })

    expect(response.structured_query).toMatchObject({
      intent: 'search_pitching',
      filters: { year: 2026, team: 'DeNA', pitcher_name: '藤浪 晋太郎', pitcher_player_id: '41045137', recent: true },
    })
    expect(pitchingFilters).toMatchObject({ year: 2026, team: 'DeNA', pitcher_name: '藤浪 晋太郎', pitcher_player_id: '41045137', recent: true })
    expect(response.answer.summary).toBe('いいえ、二軍の話です。確認できる最新5試合は二軍での登板です。')
  })

  it.skip('uses planner scope metadata for inherited farm pitching clarification without first-team wording fallback', async () => {
    let pitchingFilters: Parameters<ChatQueryService['searchPitchingLines']>[0] | null = null
    const service = createChatService(createFakeQueryService({
      playerCandidates: [{
        player_id: '41045137',
        name: '藤浪 晋太郎',
        primary_team: 'DeNA',
        roles: ['pitcher'],
        teams: ['DeNA'],
        years: [2026],
      }],
      searchPitchingLines: async (filters) => {
        pitchingFilters = filters
        return [{
          gameId: 'f20260621db-d-01',
          gameDate: '2026-06-21',
          team: '横浜DeNAベイスターズ',
          pitcherName: '藤浪 晋太郎',
          inningsPitched: '5',
          pitchCount: 90,
          hitsAllowed: 3,
          homeRunsAllowed: 0,
          walks: 2,
          hitBatters: 0,
          strikeouts: 6,
          runs: 1,
          earnedRuns: 1,
          rawText: '藤浪 5回 1失点',
          sourceKind: 'box',
          sourceUrl: null,
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: { year: 2026, team: 'DeNA', pitcher_name: '藤浪 晋太郎', pitcher_player_id: '41045137', recent: true },
      }),
      resolveStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
      formatChatAnswer,
    })

    const response = await service.answerQuestion('今の所属で見て', {
      history: [
        { role: 'user', content: '藤浪どう？' },
        { role: 'assistant', content: '横浜DeNAベイスターズ 藤浪 晋太郎の確認できる最新5試合の投球内容です。2026年二軍での対象試合です。' },
      ],
    })

    expect(response.structured_query).toMatchObject({
      intent: 'search_pitching',
      filters: { year: 2026, team: 'DeNA', pitcher_name: '藤浪 晋太郎', pitcher_player_id: '41045137', recent: true },
    })
    expect(pitchingFilters).toMatchObject({ year: 2026, team: 'DeNA', pitcher_name: '藤浪 晋太郎', pitcher_player_id: '41045137', recent: true })
  })

  it('does not inherit player stats context for ambiguous correction guards', async () => {
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { recent: true },
      }),
      resolveStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
      resolveCurrentStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
      resolveHistoricalStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
    })

    const response = await service.answerQuestion('いや、そうじゃなくて成績の話', {
      history: [
        { role: 'user', content: '藤浪の最近の打撃は？' },
        { role: 'assistant', content: '横浜DeNAベイスターズ 藤浪 晋太郎の2026年の打撃成績です。' },
      ],
    })

    expect(response.structured_query!.filters).not.toMatchObject({
      player_name: '藤浪 晋太郎',
      team: '横浜DeNAベイスターズ',
      year: 2026,
    })
    expect(response.answer.execution_metadata?.correction_guard).toMatchObject({
      inheritanceBlockedReason: 'ambiguous_correction',
      hasAmbiguousCorrection: true,
      shouldBlockInheritance: true,
    })
    expect(response.answer.execution_metadata?.follow_up_context_applied).toBeUndefined()
  })

  it('does not inherit player stats context for explicit scope override guards', async () => {
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: { recent: true },
      }),
      resolveStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
      resolveCurrentStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
      resolveHistoricalStructuredQueryPlayer: async (_queryService, structuredQuery) => ({
        structuredQuery,
        resolution: null,
      }),
    })

    const response = await service.answerQuestion('現所属ではどう？', {
      history: [
        { role: 'user', content: '藤浪の阪神時代の投球は？' },
        { role: 'assistant', content: '阪神タイガース 藤浪 晋太郎の2018年の投球成績です。' },
      ],
    })

    expect(response.structured_query!.filters).not.toMatchObject({
      pitcher_name: '藤浪 晋太郎',
      team: '阪神タイガース',
      year: 2018,
    })
    expect(response.answer.execution_metadata?.correction_guard).toMatchObject({
      inheritanceBlockedReason: 'explicit_scope_override',
      hasExplicitScopeOverride: true,
      shouldBlockInheritance: true,
    })
    expect(response.answer.execution_metadata?.follow_up_context_applied).toBeUndefined()
  })

  it('uses the current scoped resolver for current identity scope', async () => {
    const currentResolver = vi.fn(async (_queryService, structuredQuery) => ({
      structuredQuery: {
        ...structuredQuery,
        filters: {
          ...structuredQuery.filters,
          player_id: 'current-yamada',
        },
      },
      resolution: scopedResolution('current', 'current-yamada'),
    }))
    const historicalResolver = vi.fn()
    const unspecifiedResolver = vi.fn()
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { player_name: '山田', year: 2026 },
      }),
      resolveStructuredQueryPlayer: unspecifiedResolver,
      resolveCurrentStructuredQueryPlayer: currentResolver,
      resolveHistoricalStructuredQueryPlayer: historicalResolver,
    })

    const response = await service.answerQuestion('山田の今シーズン成績')

    expect(currentResolver).toHaveBeenCalledTimes(1)
    expect(historicalResolver).not.toHaveBeenCalled()
    expect(unspecifiedResolver).not.toHaveBeenCalled()
    expect(response.answer.execution_metadata?.identity_resolution?.context?.scope).toBe('current')
    expect(response.answer.summary).toContain('打撃成績')
  })

  it('uses the historical scoped resolver for historical identity scope', async () => {
    const currentResolver = vi.fn()
    const historicalResolver = vi.fn(async (_queryService, structuredQuery) => ({
      structuredQuery: {
        ...structuredQuery,
        filters: {
          ...structuredQuery.filters,
          player_id: 'historical-yamada',
        },
      },
      resolution: scopedResolution('historical', 'historical-yamada'),
    }))
    const unspecifiedResolver = vi.fn()
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { player_name: '山田', year: 2025 },
      }),
      resolveStructuredQueryPlayer: unspecifiedResolver,
      resolveCurrentStructuredQueryPlayer: currentResolver,
      resolveHistoricalStructuredQueryPlayer: historicalResolver,
    })

    const response = await service.answerQuestion('2025年の山田の打撃成績')

    expect(historicalResolver).toHaveBeenCalledTimes(1)
    expect(currentResolver).not.toHaveBeenCalled()
    expect(unspecifiedResolver).not.toHaveBeenCalled()
    expect(response.answer.execution_metadata?.identity_resolution?.context?.scope).toBe('historical')
    expect(response.answer.summary).toContain('打撃成績')
  })

  it('uses the default resolver for unspecified identity scope', async () => {
    const currentResolver = vi.fn()
    const historicalResolver = vi.fn()
    const unspecifiedResolver = vi.fn(async (_queryService, structuredQuery) => ({
      structuredQuery: {
        ...structuredQuery,
        filters: {
          ...structuredQuery.filters,
          player_id: 'unspecified-yamada',
        },
      },
      resolution: scopedResolution('unspecified', 'unspecified-yamada'),
    }))
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { player_name: '山田' },
      }),
      resolveStructuredQueryPlayer: unspecifiedResolver,
      resolveCurrentStructuredQueryPlayer: currentResolver,
      resolveHistoricalStructuredQueryPlayer: historicalResolver,
    })

    const response = await service.answerQuestion('山田の打撃成績')

    expect(unspecifiedResolver).toHaveBeenCalledTimes(1)
    expect(currentResolver).not.toHaveBeenCalled()
    expect(historicalResolver).not.toHaveBeenCalled()
    expect(response.answer.execution_metadata?.identity_resolution?.context?.scope).toBe('unspecified')
    expect(response.answer.summary).toContain('打撃成績')
  })

  it('does not apply current team correction for historical identity scope', async () => {
    let battingFilters: Parameters<ChatQueryService['searchBattingLines']>[0] | null = null
    const service = createChatService(createFakeQueryService({
      playerCandidates: [{
        player_id: 'yamakawa',
        name: '山川穂高',
        primary_team: 'ソフトバンク',
        roles: ['batter'],
        teams: ['西武', 'ソフトバンク'],
        years: [2025, 2026],
      }],
      searchBattingLines: async (filters) => {
        battingFilters = filters
        return []
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { year: 2025, team: '西武', player_name: '山川穂高' },
      }),
    })

    const response = await service.answerQuestion('去年の西武の山川穂高の成績は？')

    expect(battingFilters).toMatchObject({
      year: 2025,
      team: '西武',
      player_name: '山川穂高',
    })
    expect(response.answer.summary).not.toContain('現所属を優先')
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
      expect(response.answer.execution_metadata?.identity_resolution).toMatchObject({
        path: 'explicit_player_id',
        field: 'batter_name',
        input: '山村',
        status: 'resolved',
        playerId: 'yamamura',
        candidateCount: 1,
      })
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

  it('returns award_winners responses from normalized D1 facts with schema-compliant execution metadata', async () => {
    const service = createChatService(createFakeQueryService({
      searchAwardWinners: async () => [
        {
          year: 2025,
          awardType: 'rookie_of_the_year',
          league: 'セ・リーグ',
          playerName: '荘司宏太',
          team: '東京ヤクルト',
          sourceUrl: 'https://npb.jp/award/2025/',
        },
        {
          year: 2025,
          awardType: 'rookie_of_the_year',
          league: 'パ・リーグ',
          playerName: '西川史礁',
          team: '千葉ロッテ',
          sourceUrl: 'https://npb.jp/award/2025/',
        },
      ],
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'award_winners',
        filters: {
          year: 2025,
          award_type: 'rookie_of_the_year',
        },
      }),
    })

    const response = await service.answerQuestion('昨シーズン（2025年）の新人王は誰ですか？')

    expect(response.structured_query!.intent).toBe('award_winners')
    expect(response.answer.summary).toBe(
      '2025年度の最優秀新人賞（新人王）は、セ・リーグが荘司宏太（東京ヤクルト）、パ・リーグが西川史礁（千葉ロッテ）です。',
    )
    expect(response.answer.execution_metadata).toEqual({
      data_requirements: ['award_winners', 'source_snapshots'],
      repositories: ['searchAwardWinners', 'listSourceSnapshotsByGameIds'],
      player_id_required: false,
      player_id_satisfied: true,
      follow_up_type: 'standalone',
      referenced_context: {
        source: 'none',
        anchor: null,
        ordinal: null,
        summary: null,
      },
      target_entity: {
        kind: 'unknown',
        label: null,
        players: [],
        teams: [],
      },
      follow_up_context: {
        contextKind: 'unknown',
        inheritedPlayerId: null,
        inheritedPlayerName: null,
        inheritedTeam: null,
        inheritedSeason: 2025,
        inheritedScope: 'historical',
        inheritanceSource: 'structured_query',
        inheritanceConfidence: 0.55,
        shouldApplyInheritance: false,
      },
      target_game_id: null,
      target_player_id: null,
      answer_mode: 'direct_answer',
      identity_resolution_scope: 'historical',
    })
  }, 10000)

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

  it.skip('rewrites player matchup questions to event search even when the parser returns games', async () => {
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
      formatChatAnswer,
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

  it.skip('repairs clear natural-language categories when the parser picks the wrong intent', async () => {
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
          intent: 'aggregate_batting',
          filters: { team: 'ヤクルト', player_name: '村上' },
        },
      })
  })

  it.skip('routes venue matchup result questions to game search when parser extracts fake players', async () => {
    const service = createChatService(createFakeQueryService({
      searchGames: async (filters) => filters.year === 2026 &&
        filters.team === 'DeNA' &&
        filters.opponent === '巨人' &&
        filters.venue === '東京ドーム'
        ? [{
            gameId: 'r20260403g-db-01',
            date: '2026-04-03',
            awayTeamName: '横浜DeNAベイスターズ',
            homeTeamName: '読売ジャイアンツ',
            matchupText: '横浜DeNAベイスターズ vs 読売ジャイアンツ',
            venue: '東京ドーム',
            linescoreJson: JSON.stringify({
              away: { team: '横浜DeNAベイスターズ', innings: ['3'], totals: { runs: 3, hits: 8, errors: 0 } },
              home: { team: '読売ジャイアンツ', innings: ['1'], totals: { runs: 1, hits: 5, errors: 0 } },
            }),
          }]
        : [],
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: {
          year: 2026,
          batter_name: '東京ドームでのDeNA',
          pitcher_name: '試合結果（今シーズン）',
        },
      }),
    })

    const response = await service.answerQuestion('東京ドームでのDeNA対巨人の試合結果（今シーズン）')

    expect(response.structured_query).toEqual({
      intent: 'search_games',
      filters: {
        year: 2026,
        team: 'DeNA',
        opponent: '巨人',
        venue: '東京ドーム',
        limit: 50,
      },
    })
    expect(response.answer.summary).toContain('東京ドーム')
    expect(response.answer.summary).not.toContain('選手候補は0件')
  })

  it.skip('keeps team-scoped season batting aggregates off broad player resolution scans', async () => {
    const service = createChatService(createFakeQueryService({
      searchPlayerCandidates: async () => {
        throw new Error('searchPlayerCandidates should not be called')
      },
      aggregateBattingLines: async (filters) => {
        expect(filters).toMatchObject({
          year: 2026,
          team: '阪神',
          player_name: '佐藤',
        })
        return [{
          kind: 'batting',
          label: '佐藤 輝明',
          total: 44,
          stats: {
            team: '阪神タイガース',
            games: 44,
            atBats: 160,
            hits: 60,
            homeRuns: 12,
            runsBattedIn: 36,
            stolenBases: 2,
            walks: 25,
            strikeouts: 40,
            battingAverage: 0.375,
            ops: 1.198,
            isoP: 0.369,
            bbRate: 0.134,
          },
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'aggregate_batting',
        filters: {
          year: 2026,
          team: '阪神',
          player_name: '佐藤',
        },
      }),
    })

    const response = await service.answerQuestion('阪神の佐藤の成績を教えてください（今シーズン）')

    expect(response.structured_query).toEqual({
      intent: 'aggregate_batting',
      filters: {
        year: 2026,
        team: '阪神',
        player_name: '佐藤',
        limit: 10,
      },
    })
    expect(response.answer.summary).toContain('2026年シーズンの成績')
    expect(response.answer.summary).toContain('佐藤 輝明')
  })

  it('resolves known current-season batting metric queries through player_id and avoids aggregate fallback scans', async () => {
    const service = createChatService(createFakeQueryService({
      searchPlayerCandidates: async () => [{
        player_id: '13115153',
        name: '牧秀悟',
        primary_team: '横浜DeNAベイスターズ',
        roles: ['profile'],
        teams: ['横浜DeNAベイスターズ'],
        years: [2026],
      }],
      aggregateBattingLines: async (filters) => {
        expect(filters).toMatchObject({
          year: 2026,
          player_name: '牧秀悟',
          player_id: '13115153',
        })
        return [{
          kind: 'batting',
          label: '牧秀悟',
          total: 44,
          stats: {
            team: '横浜DeNAベイスターズ',
            games: 44,
            atBats: 170,
            hits: 58,
            homeRuns: 8,
            runsBattedIn: 31,
            stolenBases: 1,
            walks: 20,
            strikeouts: 35,
            battingAverage: 0.341,
          },
        }]
      },
      searchBattingLines: async () => {
        throw new Error('searchBattingLines should not be called')
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'aggregate_batting',
        filters: {
          year: 2026,
          player_name: '牧秀悟',
        },
      }),
    })

    const response = await service.answerQuestion('牧秀悟の今シーズンの通算打率は？')

    expect(response.structured_query).toEqual({
      intent: 'aggregate_batting',
      filters: {
        year: 2026,
        team: '横浜DeNAベイスターズ',
        player_name: '牧秀悟',
        player_id: '13115153',
        limit: 10,
      },
    })
    expect(response.answer.summary).toContain('牧秀悟')
  })

  it('resolves multi-year batting aggregate queries through player_id before repository fallback', async () => {
    const service = createChatService(createFakeQueryService({
      searchPlayerCandidates: async () => [{
        player_id: '13115153',
        name: '牧秀悟',
        primary_team: '横浜DeNAベイスターズ',
        roles: ['profile', 'batter'],
        teams: ['横浜DeNA', '横浜DeNAベイスターズ'],
        years: [2021, 2022, 2023, 2024, 2025, 2026],
      }],
      aggregateBattingLines: async (filters) => {
        expect(filters).toMatchObject({
          year_from: 2023,
          year_to: 2025,
          team: '横浜DeNAベイスターズ',
          player_name: '牧秀悟',
          player_id: '13115153',
        })
        return [{
          kind: 'batting',
          label: '牧',
          total: 391,
          stats: {
            team: '横浜DeNAベイスターズ',
            games: 391,
            atBats: 1522,
            hits: 437,
            homeRuns: 70,
            runsBattedIn: 235,
            stolenBases: 17,
            walks: 96,
            strikeouts: 233,
            battingAverage: 0.287,
          },
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'aggregate_batting',
        filters: {
          year_from: 2023,
          year_to: 2025,
          player_name: '牧秀悟',
          limit: 10,
        },
      }),
    })

    const response = await service.answerQuestion('牧秀悟の2023年から2025年の通算打率と本塁打数を教えてください')

    expect(response.structured_query).toEqual({
      intent: 'aggregate_batting',
      filters: {
        year_from: 2023,
        year_to: 2025,
        team: '横浜DeNAベイスターズ',
        player_name: '牧秀悟',
        player_id: '13115153',
        limit: 10,
      },
    })
    expect(response.answer.summary).toContain('牧')
    expect(response.answer.execution_metadata?.player_id_satisfied).toBe(true)
  })

  it('prefers the longest registered-name prefix for historical batting aggregates', async () => {
    const service = createChatService(createFakeQueryService({
      searchPlayerCandidates: async () => [
        {
          player_id: null,
          name: '岡本',
          primary_team: '広島東洋カープ',
          roles: ['batter'],
          teams: ['広島東洋カープ'],
          years: [2025, 2026],
        },
        {
          player_id: null,
          name: '岡本和',
          primary_team: '読売ジャイアンツ',
          roles: ['batter'],
          teams: ['読売ジャイアンツ'],
          years: [2021, 2022, 2023, 2024],
        },
      ],
      aggregateBattingLines: async (filters) => {
        expect(filters).toMatchObject({
          year_from: 2016,
          player_name: '岡本和',
          team: '読売ジャイアンツ',
          sort_by: 'homeRuns',
        })
        return [{
          kind: 'batting',
          label: '岡本和',
          total: 1083,
          stats: {
            team: '読売ジャイアンツ',
            games: 1083,
            atBats: 4000,
            hits: 1000,
            homeRuns: 252,
            runsBattedIn: 700,
            stolenBases: 2,
            walks: 350,
            strikeouts: 800,
            battingAverage: 0.25,
          },
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'aggregate_batting',
        filters: {
          year_from: 2016,
          player_name: '岡本和真',
          sort_by: 'homeRuns',
          limit: 10,
        },
      }),
    })

    const response = await service.answerQuestion('岡本和真の2016年以降の通算本塁打数を教えてください')

    expect(response.structured_query!.filters).toMatchObject({
      year_from: 2016,
      player_name: '岡本和',
      team: '読売ジャイアンツ',
      sort_by: 'homeRuns',
      limit: 10,
    })
    expect(response.answer.summary).toContain('252')
  })

  it.skip('recovers known QA historical player queries without broad player resolution scans', async () => {
    const service = createChatService(createFakeQueryService({
      searchPlayerCandidates: async () => {
        throw new Error('searchPlayerCandidates should not be called')
      },
      aggregatePitchingLines: async (filters) => {
        expect(filters).toMatchObject({
          year: 2023,
          team: 'オリックス',
          pitcher_name: '山本',
        })
        return [{
          kind: 'pitching',
          label: '山本',
          total: 26,
          stats: {
            team: 'オリックス・バファローズ',
            games: 26,
            inningsPitched: 185.67,
            earnedRuns: 35,
            strikeouts: 199,
            era: 1.70,
          },
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'aggregate_pitching',
        filters: {
          year: 2026,
          pitcher_name: '山本由伸',
        },
      }),
    })

    const response = await service.answerQuestion('オリックスの山本由伸の2026年の一軍での投球成績、登板数と防御率を教えてください')

    expect(response.structured_query).toEqual({
      intent: 'aggregate_pitching',
      filters: {
        year: 2023,
        team: 'オリックス',
        pitcher_name: '山本',
        limit: 10,
      },
    })
    expect(response.answer.summary).toContain('投手集計結果は1件です')
  })

  it('answers Ohtani historical batting queries through identity resolution and year shift', async () => {
    let candidateSearchCalled = false
    const service = createChatService(createFakeQueryService({
      playerCandidatesForFilters: (filters) => {
        candidateSearchCalled = true
        if (filters.name !== '大谷翔平') {
          return []
        }
        return [{
          player_id: 'otani-2017',
          name: '大谷 翔平',
          primary_team: '北海道日本ハムファイターズ',
          roles: ['batter'],
          teams: ['北海道日本ハムファイターズ'],
          years: [2017],
        }]
      },
      aggregateBattingLines: async (filters) => {
        if (filters.year !== 2017) {
          return []
        }
        expect(filters.player_id).toBe('otani-2017')
        return [{
          kind: 'batting',
          label: '大谷 翔平',
          total: 61,
          stats: {
            team: '北海道日本ハムファイターズ',
            games: 61,
            atBats: 202,
            hits: 67,
            homeRuns: 8,
            runsBattedIn: 31,
            walks: 24,
            strikeouts: 63,
            battingAverage: 0.332,
          },
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'aggregate_batting',
        filters: {
          year: 2025,
          team: '日本ハム',
          player_name: '大谷翔平',
        },
      }),
    })

    const response = await service.answerQuestion('2025年の大谷翔平の成績を教えてください')

    expect(candidateSearchCalled).toBe(true)
    expect(response.structured_query!.filters).toMatchObject({ year: 2017, player_id: 'otani-2017' })
    expect(response.answer.summary).toContain('大谷')
  })

  it('returns an ambiguous response for surname-only current-player queries without broad raw scans', async () => {
    const service = createChatService(createMultiYearQueryService({ sqliteDir: SQLITE_DIR }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: {
          year: 2026,
          player_name: '田中',
        },
      }),
    })

    const response = await service.answerQuestion('今シーズンの田中の成績を教えてください。')

    expect(response.answer.summary).toContain('どの田中ですか')
    expect(response.answer.summary).toContain('候補')
  })

  it.skip('recovers QA multi-year batting player extraction before player resolution', async () => {
    const service = createChatService(createFakeQueryService({
      searchPlayerCandidates: async () => {
        throw new Error('searchPlayerCandidates should not be called')
      },
      aggregateBattingLines: async (filters) => {
        expect(filters).toMatchObject({
          player_name: '牧秀悟',
          team: 'DeNA',
          year_from: 2023,
          year_to: 2025,
        })
        return [{
          kind: 'batting',
          label: '牧秀悟',
          total: 391,
          stats: {
            team: '横浜DeNAベイスターズ',
            games: 391,
            atBats: 1522,
            hits: 437,
            homeRuns: 70,
            runsBattedIn: 258,
            stolenBases: 9,
            battingAverage: 0.287,
          },
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'aggregate_batting',
        filters: {
          year_from: 2023,
          year_to: 2025,
          player_name: '通算打率と',
        },
      }),
    })

    const response = await service.answerQuestion('牧秀悟の2023年から2025年の通算打率と本塁打数を教えてください')

    expect(response.structured_query).toEqual({
      intent: 'aggregate_batting',
      filters: {
        player_name: '牧秀悟',
        team: 'DeNA',
        year_from: 2023,
        year_to: 2025,
        limit: 10,
      },
    })
    expect(response.answer.summary).toContain('牧秀悟')
  })

  it.skip('recovers QA team aggregate aliases without treating them as player names', async () => {
    const service = createChatService(createFakeQueryService({
      searchPlayerCandidates: async () => {
        throw new Error('searchPlayerCandidates should not be called')
      },
      aggregateBattingLines: async (filters) => {
        expect(filters).toMatchObject({
          year: 2026,
          team: 'DeNA',
          sort_by: 'ops',
          limit: 1,
        })
        return [{
          kind: 'batting',
          label: '勝又 温史',
          total: 7,
          stats: {
            team: '横浜DeNAベイスターズ',
            games: 7,
            battingAverage: 0.429,
            homeRuns: 0,
            runsBattedIn: 6,
            stolenBases: 0,
            ops: 0.935,
          },
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: {
          year: 2026,
          player_name: '外国人打者の中で最も',
        },
      }),
    })

    const response = await service.answerQuestion('今シーズンのDeNAの外国人打者の中で最もOPSが高いのは誰ですか？')

    expect(response.structured_query).toEqual({
      intent: 'aggregate_batting',
      filters: {
        year: 2026,
        team: 'DeNA',
        sort_by: 'ops',
        limit: 1,
      },
    })
    expect(response.answer.summary).toContain('勝又')
  })

  it.skip('sanitizes invalid player_name for aggregate batting ranking questions', async () => {
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

  it.skip('includes batting runs in BIS batting season summaries', async () => {
    const service = createChatService(createFakeQueryService({
      searchBattingLines: async () => [{
        gameId: 'bis:2026:db:idb1',
        gameDate: '2026-01-01',
        team: '横浜DeNAベイスターズ',
        playerName: '牧秀悟',
        battingOrder: null,
        position: null,
        atBats: 78,
        runs: 14,
        hits: 26,
        runsBattedIn: 10,
        stolenBases: 1,
        strikeouts: 13,
        walks: 11,
        rawText: JSON.stringify({
          試合: 21,
          打数: 78,
          安打: 26,
          本塁打: 2,
          打点: 10,
          得点: 14,
          盗塁: 1,
          打率: '.333',
          出塁率: '.400',
          長打率: '.551',
        }),
        sourceKind: 'bis_batting',
        statsJson: JSON.stringify({
          試合: 21,
          打数: 78,
          安打: 26,
          本塁打: 2,
          打点: 10,
          得点: 14,
          盗塁: 1,
          打率: '.333',
          出塁率: '.400',
          長打率: '.551',
        }),
      }],
    }), {
      allowFinalAnswerFallback: false,
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { year: 2026, player_name: '牧秀悟' },
      }),
    })

    const response = await service.answerQuestion('牧秀悟の2026年の成績を教えて')

    expect(response.answer.summary).toContain('14得点')
  })

  it.skip('sanitizes invalid pitcher_name for aggregate pitching ranking questions', async () => {
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

  it.skip('includes hits and walks in BIS pitching season summaries', async () => {
    const service = createChatService(createFakeQueryService({
      searchPitchingLines: async () => [{
        gameId: 'bis:2026:db:idp2',
        gameDate: '2026-01-01',
        team: '横浜DeNAベイスターズ',
        pitcherName: '藤浪晋太郎',
        inningsPitched: '14',
        pitchCount: 0,
        strikeouts: 19,
        runs: 5,
        earnedRuns: 3,
        sourceKind: 'bis_pitching_farm',
        statsJson: JSON.stringify({
          登板: 5,
          勝利: 1,
          敗北: 1,
          投球回: '14',
          被安打: 11,
          与四球: 7,
          三振: 19,
          失点: 5,
          自責点: 3,
          防御率: '1.93',
        }),
      }],
    }), {
      allowFinalAnswerFallback: false,
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: { year: 2026, pitcher_name: '藤浪晋太郎' },
      }),
    })

    const response = await service.answerQuestion('藤浪は2026年のここまでの二軍での成績はどうですか？')

    expect(response.answer.summary).toContain('被安打11')
    expect(response.answer.summary).toContain('与四球7')
  })

  it.skip('sanitizes invalid player_name for WHIP aggregate pitching ranking questions', async () => {
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
    expect(response.structured_query!.filters).not.toHaveProperty('pitcher_name')
  })

  it.skip('routes Norimoto career comparison questions through aggregate_pitching without player resolution', async () => {
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
    expect(response.answer.summary).toContain('則本昂大の防御率は')
    expect(response.answer.summary).toContain('楽天時代')
    expect(response.answer.summary).toContain('巨人移籍後')
    expect(response.answer.summary).not.toContain('1位')
  })

  it.skip('keeps top pitch count appearance questions on search_pitching', async () => {
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
    expect(response.answer.summary).toContain('1. 2021年4月16日')
    expect(response.answer.summary).toContain('該当数: 1件')
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
    expect(response.structured_query!.filters).toMatchObject({
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
    expect(response.structured_query!.filters).toMatchObject({
      year: 2025,
      team: 'ヤクルト',
      player_name: '村上',
      player_id: 'murakami',
    })
    expect(response.answer.result_count).toBe(0)
    expect(response.answer.summary).toContain('2026年はNPBに在籍していない')
    expect(response.answer.summary).not.toContain('選手を特定できない')
  })

  it('keeps season batting summaries on the aggregate path instead of falling back to game logs', async () => {
    const service = createChatService(createFakeQueryService({
      aggregateBattingLines: async () => [],
      searchBattingLines: async () => [{
        gameId: 'r20260501s-g-01',
        gameDate: '2026-05-01',
        team: '東京ヤクルトスワローズ',
        playerName: '村上宗隆',
        battingOrder: 4,
        position: '(三)',
        atBats: 4,
        runs: 1,
        hits: 2,
        runsBattedIn: 1,
        stolenBases: 0,
        strikeouts: 1,
        walks: 0,
        rawText: '村上 右安',
      }],
      playerCandidatesForFilters: () => [{
        player_id: 'murakami-2026',
        name: '村上宗隆',
        primary_team: '東京ヤクルトスワローズ',
        roles: ['batter'],
        teams: ['東京ヤクルトスワローズ'],
        years: [2026],
      }],
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'aggregate_batting',
        filters: {
          year: 2026,
          player_name: '村上宗隆',
          team: 'ヤクルト',
        },
      }),
    })

    const response = await service.answerQuestion('今シーズン（2026年）の村上宗隆の成績')

    expect(response.structured_query!.intent).toBe('aggregate_batting')
    expect(response.results.aggregates).toHaveLength(0)
    expect(response.results.batting).toHaveLength(0)
    expect(response.answer.summary).toContain('条件に一致する打撃成績は見つかりませんでした')
    expect(response.answer.summary).not.toContain('右安')
    expect(response.answer.summary).not.toContain('打撃内容')
  })

  it('does not let an explicit year silently choose one player for an ambiguous surname', async () => {
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

    expect(response.answer.resolved_player).toMatchObject({ input: '村上', status: 'ambiguous' })
    expect(response.answer.summary).toContain('どの村上ですか')
  })

  it('uses a team-qualified mention as a resolution hint but searches current team for non-era recent questions', async () => {
    let pitchingFilters: unknown = null
    const service = createChatService(createFakeQueryService({
      playerCandidates: [
        {
          player_id: '41445139',
          name: '藤浪',
          primary_team: '横浜DeNAベイスターズ',
          roles: ['pitcher'],
          teams: ['阪神', '横浜DeNAベイスターズ'],
          years: [2023, 2025, 2026],
        },
      ],
      searchPitchingLines: async (filters) => {
        pitchingFilters = filters
        return [{
          gameId: 'f20260522db-e-01',
          gameDate: '2026-05-22',
          team: '横浜DeNAベイスターズ',
          pitcherName: '藤浪',
          inningsPitched: '5',
          pitchCount: 80,
          strikeouts: 8,
          runs: 1,
          earnedRuns: 1,
          sourceKind: 'box',
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: { team: '阪神', pitcher_name: '藤浪', recent: true },
      }),
    })

    const response = await service.answerQuestion('阪神の藤浪の最近の成績は？')

    expect(pitchingFilters).toMatchObject({
      pitcher_name: '藤浪',
      pitcher_player_id: '41445139',
      recent: true,
    })
    expect(pitchingFilters).not.toMatchObject({ team: '阪神' })
    expect(response.answer.summary).toContain('現在のNPB所属は横浜DeNAベイスターズです')
    expect(response.answer.summary).toContain('2026年5月22日の二軍登板')
  })

  it.skip('routes 最近の打席内容 to batting instead of events', async () => {
    const service = createChatService(createFakeQueryService({
      searchBattingLines: async () => [{
        gameId: 'r20260605c-h-01',
        gameDate: '2026-06-05',
        team: '広島東洋カープ',
        playerName: '坂倉',
        battingOrder: 4,
        position: '(捕)',
        atBats: 4,
        runs: 1,
        hits: 2,
        runsBattedIn: 1,
        stolenBases: 0,
        strikeouts: 0,
        walks: 1,
        rawText: '坂倉 右安 四球',
      }],
    }))

    const response = await service.answerQuestion('坂倉将吾の最近の打席内容を教えてください')

    expect(response.structured_query!.intent).toBe('search_batting')
    expect(response.answer.summary).toContain('打撃内容')
    expect(response.answer.summary).toContain('坂倉')
  })

  it('keeps a singular latest pitching request to one appearance through repository and formatter', async () => {
    const pitchingFilters: Array<Record<string, unknown>> = []
    const service = createChatService(createFakeQueryService({
      searchPitchingLines: async (filters) => {
        pitchingFilters.push(filters)
        return [
        {
          gameId: 'f20260610db-e-01',
          gameDate: '2026-06-10',
          team: '横浜DeNAベイスターズ',
          pitcherName: '藤浪',
          inningsPitched: '6',
          pitchCount: 91,
          strikeouts: 7,
          runs: 0,
          earnedRuns: 0,
          sourceKind: 'box',
        },
        {
          gameId: 'f20260522db-e-01',
          gameDate: '2026-05-22',
          team: '横浜DeNAベイスターズ',
          pitcherName: '藤浪',
          inningsPitched: '5',
          pitchCount: 80,
          strikeouts: 8,
          runs: 1,
          earnedRuns: 1,
          sourceKind: 'box',
        },
        ]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: { pitcher_name: '藤浪', recent: true, limit: 1 },
      }),
    })

    const response = await service.answerQuestion('藤浪の直近試合の内容は')

    expect(response.structured_query!.filters).toMatchObject({ recent: true, limit: 1 })
    expect(pitchingFilters).toContainEqual(expect.objectContaining({ recent: true, limit: 1 }))
    expect(response.results.pitching).toHaveLength(1)
    expect(response.answer.result_count).toBe(1)
    expect(response.answer.summary).toContain('2026年6月10日')
    expect(response.answer.summary).toContain('2026年6月10日')
    expect(response.answer.summary).not.toContain('最新5試合')
    expect(response.answer.summary).not.toContain('2026年5月22日')
    expect(response.answer.summary).not.toMatch(/確認できる|対象試合|対象記録|対象データ|イベント集計|最新1試合|内容は1試合で/u)
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
      database.prepare(
        `INSERT INTO games
          (schema_version, game_id, year, mmdd, date, date_label, venue, canonical_url, matchup_text,
           away_team_name, home_team_name, linescore_json, result_pitchers_json,
           batteries_json, home_runs_json, latest_order_json, fetched_at, loaded_at)
         VALUES (1, 'r20221013s-t-02', 2022, '1013', '2022-10-13', '2022年10月13日',
                 '甲子園', 'https://npb.jp/bis/2022/games/s2022101301842.html',
                 '阪神 vs DeNA', '横浜DeNA', '阪神', '{}', '{}', '{}', '{}', '{}', datetime('now'), datetime('now'))`,
      ).run()
      database.prepare(
        `INSERT INTO pitching_lines
          (game_id, team, row_index, pitcher_name, pitcher_url, pitch_count, batters_faced,
           innings_pitched, hits, home_runs, walks, hit_batters, strikeouts, wild_pitches,
           balks, runs, earned_runs, headers_json)
         VALUES ('r20221013s-t-02', '阪神タイガース', 0, '藤浪', NULL, 91, 24,
                 '6', 4, 0, 2, 0, 7, 0, 0, 2, 2, '{}')`,
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
      expect(response.answer.summary).toContain('2026年5月22日の二軍登板')
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

  it('falls back to deterministic summary when final answer LLM is rate limited', async () => {
    const service = createChatService(createFakeQueryService(), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'player_affiliation',
        filters: { player_name: '山田' },
      }),
      generateFinalAnswer: async () => {
        throw new ChatFinalAnswerLlmHttpError('rate limited', 429)
      },
    })

    const response = await service.answerQuestion('山田は今どこの球団ですか？')

    expect(response.answer.result_count).toBeGreaterThan(0)
    expect(response.answer.summary).toContain('山田')
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

    expect(response.structured_query!.intent).toBe('game_detail')
    expect(response.answer.result_count).toBe(1)
    expect(response.results.gameDetails).toHaveLength(1)
    expect(response.results.events).toHaveLength(1)
    expect(response.answer.summary).toContain('### 主な得点シーン')
    expect(response.answer.summary).not.toContain('条件に一致するイベントは見つかりません')
  })

  it.skip('resolves ordinal follow-up references to the selected previous game_id', async () => {
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
    expect(response.answer.applied_filters).toEqual({ game_id: 'r20210416t-s-04', limit: 1 })
    expect(response.answer.execution_metadata?.follow_up_context).toMatchObject({
      contextKind: 'game',
      shouldApplyInheritance: false,
    })
    expect(response.answer.execution_metadata?.correction_guard).toMatchObject({
      inheritanceBlockedReason: 'game_context',
      shouldBlockInheritance: true,
    })
    expect(response.answer.execution_metadata?.follow_up_context_applied).toBeUndefined()
    expect(seenGameIds).toEqual(['r20210416t-s-04'])
    expect(response.answer.result_count).toBe(1)
    expect(response.results.batting.map((row) => row.gameId)).toEqual(['r20210416t-s-04'])
    expect(response.results.pitching.map((row) => row.gameId)).toEqual(['r20210416t-s-04'])
    expect(response.answer.summary).toContain('2021年4月16日')
    expect(response.answer.summary).toContain('得点経過:')
    expect(response.answer.summary).toContain('主な投手成績:')
    expect(response.answer.summary).toContain('主な打撃成績:')
    expect(response.answer.summary).not.toContain('該当する試合は1件です')
  })

  it.skip('keeps terse ordinal follow-ups with history inside the NPB planner path', async () => {
    const seenGameIds: string[] = []
    const service = createChatService(createFakeQueryService({
      searchGameDetails: async (filters) => {
        seenGameIds.push(filters.game_id ?? '')
        return filters.game_id === 'r20180916db-t-20'
          ? [{
              gameId: 'r20180916db-t-20',
              date: '2018-09-16',
              venue: '横浜スタジアム',
              competition: null,
              awayTeamName: '阪神タイガース',
              homeTeamName: '横浜DeNAベイスターズ',
              matchupText: '阪神タイガース vs 横浜DeNAベイスターズ',
              linescoreJson: JSON.stringify({
                away: { team: '阪神タイガース', innings: ['0', '0', '4'], totals: { runs: 4, hits: 5, errors: 0 } },
                home: { team: '横浜DeNAベイスターズ', innings: ['0', '0', '0'], totals: { runs: 0, hits: 3, errors: 0 } },
              }),
            }]
          : []
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'off_topic',
        filters: {},
      }),
    })

    const response = await service.answerQuestion('1本目はいつ？', {
      history: [
        { role: 'user', content: '藤浪ってホームラン打ったことある？' },
        {
          role: 'assistant',
          content: [
            '藤浪 晋太郎のホームランは2件です。',
            '1. 2018年9月16日 r20180916db-t-20 3回表 阪神 藤浪: レフト満塁ホームラン（打点4）',
            '2. 2021年4月16日 r20210416t-s-04 5回裏 阪神 藤浪: レフト2ランホームラン（打点2）',
          ].join('\n'),
        },
      ],
    })

    expect(response.structured_query).toEqual({
      intent: 'game_detail',
      filters: { game_id: 'r20180916db-t-20', game_date: '2018-09-16', limit: 1 },
    })
    expect(seenGameIds).toEqual(['r20180916db-t-20'])
    expect(response.answer.summary).not.toContain('NPB（日本プロ野球）に関するご質問')
  })

  it.skip('uses the most recent game from history for terse follow-up questions', async () => {
    const service = createChatService(createFakeQueryService({
      searchGameDetails: async (filters) => (filters.game_date === '2026-06-05')
        ? [{
            gameId: 'r20260605s-g-03',
            date: '2026-06-05',
            venue: '神宮球場',
            competition: null,
            awayTeamName: '阪神タイガース',
            homeTeamName: '東京ヤクルトスワローズ',
            matchupText: '阪神タイガース vs 東京ヤクルトスワローズ',
            linescoreJson: JSON.stringify({
              away: { team: '阪神タイガース', innings: ['0', '1', '0', '0', '0', '0', '0', '0', '0'], totals: { runs: 1, hits: 6, errors: 0 } },
              home: { team: '東京ヤクルトスワローズ', innings: ['0', '0', '0', '2', '0', '0', '0', '0', 'X'], totals: { runs: 2, hits: 7, errors: 0 } },
            }),
          }]
        : [],
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: {},
      }),
    })

    const response = await service.answerQuestion('それ詳しく', {
      history: [
        { role: 'user', content: '昨日の阪神戦どうだった？' },
        {
          role: 'assistant',
          content: [
            '1. 2026年6月4日 甲子園、阪神タイガースが東京ヤクルトスワローズに4-3で勝利しました。',
            '2. 2026年6月5日 神宮球場、東京ヤクルトスワローズが阪神タイガースに2-1で勝利しました。',
          ].join('\n'),
        },
      ],
    })

    expect(response.structured_query).toEqual({
      intent: 'game_detail',
      filters: { game_date: '2026-06-05', limit: 1 },
    })
    expect(response.answer.applied_filters).toEqual({ game_date: '2026-06-05', limit: 1 })
    expect(response.answer.execution_metadata?.follow_up_context).toMatchObject({
      contextKind: 'game',
      shouldApplyInheritance: false,
    })
    expect(response.answer.execution_metadata?.correction_guard).toMatchObject({
      inheritanceBlockedReason: 'game_context',
      shouldBlockInheritance: true,
    })
    expect(response.answer.execution_metadata?.follow_up_context_applied).toBeUndefined()
    expect(response.answer.summary).toContain('2026年6月5日')
    expect(response.answer.summary).not.toContain('該当する試合は1件です')
  })

  it('does not keep a question-specific Q-65 success response in the route catch boundary', () => {
    const source = readFileSync(CHAT_POST_SOURCE, 'utf8')
    expect(source).not.toMatch(/田中将大[\s\S]{0,300}chatResponseSchema\.parse/u)
    expect(source).not.toContain('投手集計結果は1件です。 1位: 田中将')
  })

  it('rejects explicit player_id when candidate lookup does not confirm that id', async () => {
    let aggregateCalled = false
    const service = createChatService(createFakeQueryService({
      playerCandidatesForFilters: () => [{
        player_id: 'correct-id',
        name: '田中 将大',
        primary_team: '読売ジャイアンツ',
        roles: ['pitcher'],
        teams: ['読売ジャイアンツ'],
        years: [2026],
      }],
      aggregatePitchingLines: async () => {
        aggregateCalled = true
        return []
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'aggregate_pitching',
        filters: {
          year: 2026,
          pitcher_name: '田中将大',
          pitcher_player_id: 'wrong-id',
        },
      }),
      formatChatAnswer,
    })

    const response = await service.answerQuestion('田中将大の今シーズンの成績を教えてください')

    expect(aggregateCalled).toBe(false)
    expect(response.answer.summary).toContain('選手候補')
    expect(response.answer.execution_metadata?.player_id_satisfied).toBe(false)
  })

  it('does not fall back to name-only recent pitching for unresolved multi-player comparisons', async () => {
    const searchedPitchingFilters: unknown[] = []
    const service = createChatService(createFakeQueryService({
      playerCandidatesForFilters: (filters) => {
        if (filters.name === '石田裕太郎') {
          return [{
            player_id: '21125159',
            name: '石田 裕太郎',
            primary_team: '横浜DeNAベイスターズ',
            roles: ['pitcher'],
            teams: ['横浜DeNAベイスターズ'],
            years: [2026],
          }]
        }
        return []
      },
      searchPitchingLines: async (filters) => {
        searchedPitchingFilters.push(filters)
        return []
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_pitching',
        filters: { pitcher_names: ['石田裕太郎', '存在しない選手'], recent: true, limit: 3 },
      }),
      formatChatAnswer,
    })

    const response = await service.answerQuestion('石田裕太郎と存在しない選手のそれぞれ直近3試合の成績を比較して')

    expect(searchedPitchingFilters).toHaveLength(0)
    expect(response.answer.summary).toContain('選手候補は0件です')
    expect(response.answer.execution_metadata?.player_id_satisfied).toBe(false)
  })

  it('compares recent batting rows for every resolved batter', async () => {
    const searchedPlayers: string[] = []
    const service = createChatService(createFakeQueryService({
      playerCandidatesForFilters: (filters) => [{
        player_id: filters.name === '佐藤輝明' ? 'sato' : 'maki',
        name: filters.name,
        primary_team: filters.name === '佐藤輝明' ? '阪神' : 'DeNA',
        roles: ['batter'],
        teams: [filters.name === '佐藤輝明' ? '阪神' : 'DeNA'],
        years: [2026],
      }],
      searchBattingLines: async (filters) => {
        searchedPlayers.push(filters.player_id ?? '')
        return [{
          gameId: filters.player_id === 'sato' ? 'r20260701t-db-01' : 'r20260701db-t-01',
          gameDate: '2026-07-01',
          team: filters.player_id === 'sato' ? '阪神' : 'DeNA',
          playerName: filters.player_id === 'sato' ? '佐藤輝明' : '牧秀悟',
          battingOrder: 4,
          position: '三',
          atBats: 4,
          runs: 1,
          hits: 2,
          runsBattedIn: 1,
          stolenBases: 0,
          strikeouts: 1,
          walks: 0,
          rawText: null,
        }]
      },
    }), {
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_batting',
        filters: { player_names: ['佐藤輝明', '牧秀悟'], recent: true, limit: 3 },
      }),
      formatChatAnswer,
    })

    const response = await service.answerQuestion('佐藤輝明と牧秀悟のそれぞれ直近3試合の打撃成績を比較して')

    expect(searchedPlayers).toEqual(expect.arrayContaining(['sato', 'maki']))
    expect(response.structured_query!.intent).toBe('search_batting')
    expect(response.results.batting.map((row) => row.playerName)).toEqual(
      expect.arrayContaining(['佐藤輝明', '牧秀悟']),
    )
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
  searchPlayerCandidates?: ChatQueryService['searchPlayerCandidates']
  searchEvents?: ChatQueryService['searchEvents']
  searchGames?: ChatQueryService['searchGames']
  searchBattingLines?: ChatQueryService['searchBattingLines']
  searchPitchingLines?: ChatQueryService['searchPitchingLines']
  searchGameDetails?: ChatQueryService['searchGameDetails']
  aggregateBattingLines?: ChatQueryService['aggregateBattingLines']
  aggregatePitchingLines?: ChatQueryService['aggregatePitchingLines']
  searchAwardWinners?: ChatQueryService['searchAwardWinners']
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
    searchGames: options.searchGames ?? (async () => []),
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
    searchAwardWinners: options.searchAwardWinners ?? (async () => []),
    getNormalizedRuntimeMetadata: async () => ({ schema_version: 'phase5-normalized-v1' }),
    searchPlayerCandidates: options.searchPlayerCandidates ?? (async (filters) => options.playerCandidatesForFilters?.(filters) ?? options.playerCandidates ?? (
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
    )),
    listSourceSnapshotsByGameIds: async (gameIds) => gameIds.map((gameId) => ({
      game_id: gameId,
      source_key: 'box',
      source_url: 'https://npb.jp/scores/2024/0401/g-t-01/box.html',
    })),
    close: () => {},
  }
}
