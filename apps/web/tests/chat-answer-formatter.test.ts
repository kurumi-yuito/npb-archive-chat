import { describe, expect, it } from 'vitest'
import type { ChatResponse, ChatStructuredQuery } from '@npb/schemas'
import type { EventRow } from '@npb/db'
import { formatChatAnswer } from '../server/services/chat-answer-formatter'
import type { ChatExecutionMetadata } from '../server/services/chat-query-plan'

describe('chat-answer-formatter', () => {
  it('formats all search_events rows up to 20 and reports the remaining count', () => {
    const structuredQuery: ChatStructuredQuery = {
      intent: 'search_events',
      filters: {
        year: 2025,
        team: 'ヤクルト',
        batter_name: '山田',
        batter_player_id: '91895133',
        event_type: 'plate_appearance',
        result_text_contains: 'ホームラン',
      },
    }
    const results = emptyResults()
    results.events = Array.from({ length: 21 }, (_, index) => eventRow(index + 1))

    const answer = formatChatAnswer({
      question: '2025年にヤクルトの山田が打ったホームラン一覧',
      structuredQuery,
      results,
      sources: [],
      playerResolution: {
        input: '山田',
        player_id: '91895133',
        name: '山田',
        primary_team: 'ヤクルト',
        status: 'resolved',
        candidates: [],
      },
    })

    expect(answer.result_count).toBe(21)
    expect(answer.remaining_count).toBe(1)
    expect(answer.summary).toBe('2025年ヤクルト山田が打ったホームランは21件です。')
  })

  it('describes batter-vs-pitcher event searches with both player names', () => {
    const results = emptyResults()
    results.events = [{
      ...eventRow(1),
      batterName: '京田',
      pitcherName: '砂田',
      resultText: 'ファーストゴロ',
    }, {
      ...eventRow(2),
      gameDate: '2025-05-02',
      offenseTeam: 'ヤクルト',
      batterName: '京田',
      pitcherName: '砂田',
      resultText: 'センター前ヒット',
    }]

    const answer = formatChatAnswer({
      question: '横浜の京田と中日の砂田が対決したことってある？',
      structuredQuery: {
        intent: 'search_events',
        filters: {
          team: 'DeNA',
          batter_name: '京田',
          pitcher_name: '砂田',
        },
      },
      results,
      sources: [],
    })

    expect(answer.summary).toBe('DeNAの京田と砂田には直接対決があります。 確認できる記録は2件です。 最初の対戦は2025年5月1日のヤクルト戦で京田が砂田からファーストゴロ。 直近の対戦は2025年5月2日のヤクルト戦で京田が砂田からセンター前ヒット。')
    expect(answer.summary).not.toContain('打ったイベント')
  })

  it('surfaces follow-up planner metadata in the answer execution metadata', () => {
    const answer = formatChatAnswer({
      question: 'なんで？',
      structuredQuery: {
        intent: 'game_detail',
        filters: { game_date: '2021-04-16', team: '阪神' },
      },
      results: emptyResults(),
      sources: [],
      executionMetadata: {
        dataRequirements: ['game_details'],
        repositories: ['searchGameDetails'],
        playerResolution: null,
        playerIdRequired: false,
        playerIdSatisfied: true,
        followUpType: 'reason_request',
        referencedContext: {
          source: 'latest_assistant_entry',
          anchor: '1. 2021年4月16日 r20210416t-s-01 ...',
          ordinal: null,
          summary: '1. 2021年4月16日 r20210416t-s-01 ...',
        },
        targetEntity: {
          kind: 'game',
          label: '2021年4月16日 r20210416t-s-01 ...',
          players: [],
          teams: ['阪神'],
        },
        followUpContext: {
          contextKind: 'game',
          inheritedPlayerId: null,
          inheritedPlayerName: null,
          inheritedTeam: '阪神',
          inheritedSeason: null,
          inheritedScope: 'unspecified',
          inheritanceSource: 'latest_assistant_entry',
          inheritanceConfidence: 0.9,
          shouldApplyInheritance: false,
        },
        correctionGuard: {
          inheritanceBlockedReason: 'game_context',
          hasAmbiguousCorrection: false,
          hasPlayerReplacement: false,
          hasExplicitSeasonOverride: false,
          hasExplicitScopeOverride: false,
          shouldBlockInheritance: true,
        },
        correction: {
          isCorrection: false,
          target: 'unknown',
          value: { kind: 'unknown' },
          confidence: 0,
        },
        identityIntent: {
          scope: 'unspecified',
          explicitSeasonOverride: false,
          explicitScopeOverride: false,
        },
        targetGameId: 'r20210416t-s-01',
        targetPlayerId: null,
        answerMode: 'reason_explanation',
        identityResolutionScope: 'unspecified',
      },
    })

    expect(answer.execution_metadata?.follow_up_type).toBe('reason_request')
    expect(answer.execution_metadata?.answer_mode).toBe('reason_explanation')
    expect(answer.execution_metadata?.target_game_id).toBe('r20210416t-s-01')
    expect(answer.execution_metadata?.identity_resolution_scope).toBe('unspecified')
    expect(answer.execution_metadata?.follow_up_context).toMatchObject({
      contextKind: 'game',
      inheritedTeam: '阪神',
      shouldApplyInheritance: false,
    })
    expect(answer.execution_metadata?.correction_guard).toMatchObject({
      inheritanceBlockedReason: 'game_context',
      shouldBlockInheritance: true,
    })
    expect(answer.execution_metadata?.correction).toMatchObject({
      isCorrection: false,
      target: 'unknown',
      value: { kind: 'unknown' },
      confidence: 0,
    })
    expect(answer.execution_metadata?.identity_intent).toMatchObject({
      scope: 'unspecified',
      explicitSeasonOverride: false,
      explicitScopeOverride: false,
    })
  })

  it('describes pitcher-vs-pitcher matchup questions without batting language', () => {
    const results = emptyResults()
    results.events = [{
      ...eventRow(2),
      batterName: '田中将大',
      pitcherName: '柳',
      resultText: '空振り三振',
      offenseTeam: '巨人',
      gameDate: '2025-08-13',
      sourceUrl: 'https://npb.jp/scores/2025/0813/g-d-19/playbyplay.html',
    }]

    const answer = formatChatAnswer({
      question: '田中将大と柳は対決したことがあるか',
      structuredQuery: {
        intent: 'search_events',
        filters: {
          batter_name: '田中 将大',
          pitcher_name: '柳',
        },
      },
      results,
      sources: [],
    })

    expect(answer.summary).toBe('田中 将大と柳には直接対決があります。 確認できる記録は1件です。 最初の対戦は2025年8月13日の巨人戦で田中 将大が柳から空振り三振。')
    expect(answer.summary).not.toContain('打ったイベント')
  })

  it('formats game details with winner, score, and highlights without exposing game ids', () => {
    const results = emptyResults()
    results.gameDetails = [{
      gameId: 'r20260516g-db-08',
      date: '2026-05-16',
      venue: 'Tokyo Dome',
      competition: null,
      awayTeamName: 'DeNA',
      homeTeamName: 'Yomiuri',
      matchupText: 'DeNA vs Yomiuri',
      linescoreJson: JSON.stringify({
        away: { team: 'DeNA', innings: ['1', '0', '2', '0', '0', '0', '0', '0', '0'], totals: { runs: 3, hits: 10, errors: 1 } },
        home: { team: 'Yomiuri', innings: ['0', '1', '2', '0', '0', '0', '1', '0', 'X'], totals: { runs: 4, hits: 11, errors: 1 } },
      }),
    }]

    const answer = formatChatAnswer({
      question: '昨日の東京ドームでの試合について教えて',
      structuredQuery: { intent: 'game_detail', filters: { game_date: '2026-05-16', venue: '東京ドーム' } },
      results,
      sources: [],
    })

    expect(answer.summary).toContain('2026年5月16日 東京ドーム、巨人がDeNAに4-3で勝利しました。')
    expect(answer.summary).toContain('7回裏に巨人が1点を取り、ここでリードを奪いました。')
    expect(answer.summary).toContain('安打数はDeNAが10本、巨人が11本でした。')
    expect(answer.summary).not.toContain('r20260516g-db-08')
  })

  it('adds play-by-play evidence to game detail summaries for game reviews', () => {
    const results = emptyResults()
    results.gameDetails = [{
      gameId: 'r20260516g-db-08',
      date: '2026-05-16',
      venue: 'Tokyo Dome',
      competition: null,
      awayTeamName: 'DeNA',
      homeTeamName: 'Yomiuri',
      matchupText: 'DeNA vs Yomiuri',
      linescoreJson: JSON.stringify({
        away: { team: 'DeNA', innings: ['0'], totals: { runs: 0, hits: 4, errors: 0 } },
        home: { team: 'Yomiuri', innings: ['2'], totals: { runs: 2, hits: 6, errors: 0 } },
      }),
    }]
    results.events = [{
      ...eventRow(1),
      gameId: 'r20260516g-db-08',
      gameDate: '2026-05-16',
      inning: 1,
      half: 'bottom',
      offenseTeam: '巨人',
      batterName: '大城',
      resultText: 'ライト2ランホームラン（打点2）',
    }]

    const answer = formatChatAnswer({
      question: '2026年5月16日の東京ドームの試合を戦評して',
      structuredQuery: { intent: 'game_detail', filters: { game_date: '2026-05-16', venue: '東京ドーム' } },
      results,
      sources: [],
    })

    expect(answer.summary).toContain('主な得点・長打イベント')
    expect(answer.summary).toContain('1回裏 巨人 大城: ライト2ランホームラン')
  })

  it('formats recent batting lines as current batting form', () => {
    const results = emptyResults()
    results.batting = [
      battingRow('2026-05-16', 4, 2, 1, 0),
      battingRow('2026-05-15', 3, 1, 0, 1),
    ]

    const answer = formatChatAnswer({
      question: '村上の最近の評価は',
      structuredQuery: { intent: 'search_batting', filters: { player_name: '村上', recent: true } },
      results,
      sources: [],
    })

    expect(answer.summary).toContain('ヤクルト 村上の確認できる最新2出場の打撃内容です。')
    expect(answer.summary).toContain('2試合で3安打')
    expect(answer.summary).toContain('打点')
    expect(answer.summary).toContain('打率.429')
  })

  it('formats batting evaluation from execution metadata instead of question text', () => {
    const results = emptyResults()
    results.batting = [
      battingRow('2026-05-16', 4, 2, 1, 0),
      battingRow('2026-05-15', 3, 1, 0, 1),
    ]

    const answer = formatChatAnswer({
      question: '前の条件で見て',
      structuredQuery: { intent: 'search_batting', filters: { player_name: '村上' } },
      results,
      sources: [],
      executionMetadata: evaluationMetadata(),
    })

    expect(answer.summary).toContain('ヤクルト 村上の確認できる最新2出場の打撃内容です。')
    expect(answer.summary).toContain('2試合で3安打')
    expect(answer.summary).toContain('打率.429')
  })

  it('formats pitching evaluation from execution metadata instead of question text', () => {
    const results = emptyResults()
    results.pitching = [
      farmBoxRow('2026-05-22', 'f20260522db-d-05', '横浜DeNAベイスターズ', '藤浪', '5', 8, 1),
      farmBoxRow('2026-05-13', 'f20260513g-db-07', '横浜DeNAベイスターズ', '藤浪', '4', 3, 1),
    ]

    const answer = formatChatAnswer({
      question: '前の条件で見て',
      structuredQuery: { intent: 'search_pitching', filters: { pitcher_name: '藤浪' } },
      results,
      sources: [],
      executionMetadata: evaluationMetadata(),
    })

    expect(answer.summary).toContain('2試合で11奪三振、2自責点です。')
    expect(answer.summary).toContain('良かった点です')
  })

  it('pitching evaluation with only a BIS farm row shows current season farm stats cleanly', () => {
    const results = emptyResults()
    results.pitching = [
      bisPitchingFarmRow('2026', '横浜DeNAベイスターズ', '藤浪 晋太郎', {
        登板: '4', 勝利: '0', 敗北: '1', 三振: '11', 投球回: '9', 防御率: '2.00',
      }),
    ]

    const answer = formatChatAnswer({
      question: '藤浪の最近の調子は',
      structuredQuery: { intent: 'search_pitching', filters: { pitcher_name: '藤浪' } },
      results,
      sources: [],
    })

    expect(answer.result_count).toBe(1)
    expect(answer.summary).toContain('2026年二軍で4試合に登板')
    expect(answer.summary).toContain('藤浪 晋太郎')
    expect(answer.summary).toContain('4試合に登板')
    expect(answer.summary).toContain('防御率2.00')
    expect(answer.summary).not.toContain('2025年')
    expect(answer.summary).not.toContain('未登録')
    // 個別試合行がないので試合リストは出ない
    expect(answer.summary).not.toContain('個別試合記録')
  })

  it('pitching evaluation with BIS farm row + farm box scores labels all games as 二軍', () => {
    const results = emptyResults()
    results.pitching = [
      // BIS累計行（二軍）
      bisPitchingFarmRow('2026', '横浜DeNAベイスターズ', '藤浪 晋太郎', {
        登板: '5', 勝利: '1', 敗北: '1', 三振: '19', 投球回: '14', 防御率: '1.93',
      }),
      // 個別試合行 - 全てfプレフィックス（二軍）
      farmBoxRow('2026-05-22', 'f20260522db-d-05', '横浜DeNAベイスターズ', '藤浪', '5', 8, 1),
      farmBoxRow('2026-05-13', 'f20260513g-db-07', '横浜DeNAベイスターズ', '藤浪', '4', 3, 1),
      farmBoxRow('2026-05-08', 'f20260508db-v-05', '横浜DeNAベイスターズ', '藤浪', '1', 2, 0),
      farmBoxRow('2026-04-01', 'f20260401b-db-01', '横浜DeNAベイスターズ', '藤浪', '1', 0, 0),
      farmBoxRow('2026-03-18', 'f20260318db-l-02', '横浜DeNAベイスターズ', '藤浪', '3', 6, 1),
    ]

    const answer = formatChatAnswer({
      question: '藤浪の最近の調子は',
      structuredQuery: { intent: 'search_pitching', filters: { pitcher_name: '藤浪', recent: true } },
      results,
      sources: [],
    })

    expect(answer.result_count).toBe(6)
    // recent はBISシーズン行ではなく、試合単位の最新登板を優先する
    expect(answer.summary).toContain('横浜DeNAベイスターズ 藤浪 晋太郎の確認できる最新5試合の投球内容です。')
    expect(answer.summary).toContain('2026年二軍での対象試合です。')
    expect(answer.summary).not.toContain('シーズン成績')

    // 個別試合は全て「二軍」として扱う（「一軍」は一切出ない）
    expect(answer.summary).toContain('2026年5月22日')
    expect(answer.summary).toContain('2026年5月13日')
    expect(answer.summary).toContain('5試合で19奪三振')
    expect(answer.summary).not.toContain('一軍')

    // 5W1H: いつ・どこで（チーム）・誰が・何回・何奪三振・自責
    expect(answer.summary).toContain('2026年5月22日')
    expect(answer.summary).toContain('横浜DeNAベイスターズ')
    expect(answer.summary).toContain('5回')
  })

  it('formats pitching comparison follow-ups from execution metadata instead of question text', () => {
    const results = emptyResults()
    results.pitching = [
      regularBoxRow('2026-06-01', 'r20260601db-g-01', '横浜DeNAベイスターズ', '藤浪 晋太郎', '6', 7, 1),
      regularBoxRow('2026-05-25', 'r20260525db-g-01', '横浜DeNAベイスターズ', '藤浪 晋太郎', '5', 4, 0),
    ]

    const answer = formatChatAnswer({
      question: '前の条件で見て',
      structuredQuery: { intent: 'search_pitching', filters: { pitcher_name: '藤浪 晋太郎', recent: true } },
      results,
      sources: [],
      executionMetadata: {
        dataRequirements: ['pitching_lines'],
        repositories: ['searchPitchingLines'],
        playerResolution: null,
        playerIdRequired: true,
        playerIdSatisfied: true,
        followUpType: 'comparison_request',
        referencedContext: {
          source: 'latest_assistant_entry',
          anchor: null,
          ordinal: null,
          summary: null,
        },
        targetEntity: {
          kind: 'player',
          label: '藤浪 晋太郎',
          players: ['藤浪 晋太郎'],
          teams: [],
        },
        followUpContext: {
          contextKind: 'player_stats',
          inheritedPlayerId: null,
          inheritedPlayerName: '藤浪 晋太郎',
          inheritedTeam: null,
          inheritedSeason: 2026,
          inheritedScope: 'current',
          inheritanceSource: 'conversation_history',
          inheritanceConfidence: 0.62,
          shouldApplyInheritance: false,
        },
        correctionGuard: {
          inheritanceBlockedReason: 'explicit_season_override',
          hasAmbiguousCorrection: false,
          hasPlayerReplacement: false,
          hasExplicitSeasonOverride: true,
          hasExplicitScopeOverride: false,
          shouldBlockInheritance: true,
        },
        correction: {
          isCorrection: true,
          target: 'season',
          value: { kind: 'year', year: 2026 },
          confidence: 0.8,
        },
        identityIntent: {
          scope: 'current',
          explicitSeasonOverride: true,
          explicitScopeOverride: false,
        },
        targetGameId: null,
        targetPlayerId: null,
        answerMode: 'comparison_explanation',
        identityResolutionScope: 'current',
      },
    })

    expect(answer.summary).toContain('2026年の確認できる最新2試合は11奪三振、1自責点です。')
    expect(answer.summary).toContain('昨年の同条件と直接の通算比較はできません')
  })

  it('pitching evaluation with BIS regular row + regular box scores labels all games as 一軍', () => {
    const results = emptyResults()
    results.pitching = [
      // BIS累計行（一軍）
      bisPitchingRegularRow('2025', '阪神タイガース', '青柳 晃洋', {
        登板: '20', 勝利: '8', 敗北: '6', 三振: '130', 投球回: '120', 防御率: '3.15',
      }),
      // 個別試合行 - rプレフィックス（一軍）
      regularBoxRow('2025-09-20', 'r20250920t-g-10', '阪神タイガース', '青柳 晃洋', '7', 9, 1),
      regularBoxRow('2025-09-14', 'r20250914t-d-08', '阪神タイガース', '青柳 晃洋', '6', 7, 2),
    ]

    const answer = formatChatAnswer({
      question: '青柳の最近の調子は',
      structuredQuery: { intent: 'search_pitching', filters: { pitcher_name: '青柳', recent: true } },
      results,
      sources: [],
    })

    // recent はBISシーズン行ではなく、試合単位の最新登板を優先する
    expect(answer.summary).toContain('阪神タイガース 青柳 晃洋の確認できる最新2試合の投球内容です。')
    expect(answer.summary).toContain('2025年一軍での対象試合です。')
    expect(answer.summary).toContain('青柳 晃洋')

    // 個別試合は「一軍」として表示（「二軍」は出ない）
    expect(answer.summary).toContain('2025年9月20日')
    expect(answer.summary).toContain('2025年9月14日')
    expect(answer.summary).not.toContain('二軍')
  })

  it('pitching evaluation with mixed farm and regular box scores labels each game correctly', () => {
    const results = emptyResults()
    // BIS累計なし、box scoreのみ（一軍・二軍混在）
    results.pitching = [
      regularBoxRow('2026-05-20', 'r20260520t-g-05', '阪神タイガース', '伊藤 将司', '7', 8, 0),
      farmBoxRow('2026-05-14', 'f20260514t-h-03', '阪神タイガース', '伊藤 将司', '5', 5, 1),
    ]

    const answer = formatChatAnswer({
      question: '伊藤将司の最近の登板は',
      structuredQuery: { intent: 'search_pitching', filters: { pitcher_name: '伊藤将司', recent: true } },
      results,
      sources: [],
    })

    // 5W1H：いつ・どこ（チーム）・何回・何奪三振・自責、一/二軍区別
    expect(answer.summary).toContain('伊藤 将司')
    expect(answer.summary).not.toContain('個別試合記録') // BIS行なし時は別フォーマット
    // 対象試合の日付が含まれる
    expect(answer.summary).toContain('5月20日')
    expect(answer.summary).toContain('5月14日')
  })

  it('formats aggregate_pitching comparison questions as era comparisons instead of rankings', () => {
    const results = emptyResults()
    results.aggregates = [
      {
        kind: 'pitching',
        label: '則本昂',
        total: 60,
        stats: {
          team: '楽天',
          games: 60,
          inningsPitched: 356.67,
          earnedRuns: 130,
          hitsAllowed: 150,
          walks: 32,
          strikeouts: 142,
          saves: 0,
        },
      },
      {
        kind: 'pitching',
        label: '則本',
        total: 3,
        stats: {
          team: '巨人',
          games: 3,
          inningsPitched: 18,
          earnedRuns: 3,
          hitsAllowed: 10,
          walks: 2,
          strikeouts: 12,
          saves: 0,
        },
      },
      {
        kind: 'pitching',
        label: '則本昂',
        total: 5,
        stats: {
          team: '楽天',
          games: 5,
          inningsPitched: 25,
          earnedRuns: 4,
          hitsAllowed: 11,
          walks: 7,
          strikeouts: 23,
          saves: 0,
        },
      },
    ]

    const answer = formatChatAnswer({
      question: '則本昂大は楽天時代と巨人移籍後で防御率はどう変わりましたか？',
      structuredQuery: {
        intent: 'aggregate_pitching',
        filters: { pitcher_name: '則本昂大' },
      },
      results,
      sources: [],
    })

    expect(answer.summary).toContain('則本昂大の防御率は')
    expect(answer.summary).toContain('楽天時代が3.16')
    expect(answer.summary).toContain('巨人移籍後が1.50')
    expect(answer.summary).toContain('1.66改善')
    expect(answer.summary).not.toContain('1位')
  })

  it('formats BIS batting season stats with year, team, player name, and key stats', () => {
    const results = emptyResults()
    results.batting = [
      bisBattingRow('2025', '阪神タイガース', '佐藤 輝明', {
        試合: '143', 打席: '580', 打数: '490', 安打: '145', 本塁打: '28', 打点: '88',
        盗塁: '10', 打率: '.296', 出塁率: '.380', 長打率: '.521',
      }),
    ]

    const answer = formatChatAnswer({
      question: '2025年の佐藤輝明の成績',
      structuredQuery: { intent: 'search_batting', filters: { year: 2025, player_name: '佐藤', team: '阪神' } },
      results,
      sources: [],
    })

    // 5W1H: いつ（年）・誰が（選手名）・どこで（チーム）・何回（試合数）・どれだけ（各成績）
    expect(answer.summary).toContain('2025年')
    expect(answer.summary).toContain('阪神タイガース')
    expect(answer.summary).toContain('佐藤 輝明')
    expect(answer.summary).toContain('試合143')
    expect(answer.summary).toContain('安打145')
    expect(answer.summary).toContain('本塁打28')
    expect(answer.summary).toContain('打率.296')
  })

  it('BIS batting evaluation shows season stats and sabermetrics when only BIS row is available', () => {
    const results = emptyResults()
    results.batting = [
      bisBattingRow('2026', '読売ジャイアンツ', '岡本 和真', {
        試合: '40', 打席: '160', 打数: '140', 安打: '50', 本塁打: '12', 打点: '35',
        四球: '18', 三振: '30', 打率: '.357', 出塁率: '.431', 長打率: '.671',
      }),
    ]

    const answer = formatChatAnswer({
      question: '岡本の今の調子はどうですか',
      structuredQuery: { intent: 'search_batting', filters: { player_name: '岡本', recent: true } },
      results,
      sources: [],
    })

    // 5W1H: 年・チーム・選手・各成績値が全て含まれる
    expect(answer.summary).toContain('2026年')
    expect(answer.summary).toContain('読売ジャイアンツ')
    expect(answer.summary).toContain('岡本 和真')
    expect(answer.summary).toContain('本塁打12')
    expect(answer.summary).toContain('打率.357')
    // サブメトリクス（OPS）も含む
    expect(answer.summary).toContain('OPS')
    // ソース参照は本文ではなく source_urls に含める
    expect(answer.summary).not.toContain('source:')
    expect(answer.source_urls).toContain('https://npb.jp/bis/2026/stats/idb1_g.html')
  })

  it('batting evaluation with recent box scores shows dates and totals', () => {
    const results = emptyResults()
    results.batting = [
      battingRow('2026-05-22', 4, 2, 1, 1),
      battingRow('2026-05-21', 3, 0, 0, 0),
      battingRow('2026-05-20', 4, 3, 2, 0),
    ]

    const answer = formatChatAnswer({
      question: '村上の最近の調子は',
      structuredQuery: { intent: 'search_batting', filters: { player_name: '村上', recent: true } },
      results,
      sources: [],
    })

    // 5W1H: 試合数・成績・対象日付
    expect(answer.summary).toContain('3試合')
    expect(answer.summary).toContain('5安打')
    expect(answer.summary).toContain('3打点')
    // 対象試合の日付が含まれる
    expect(answer.summary).toContain('5月22日')
    expect(answer.summary).toContain('5月21日')
    expect(answer.summary).toContain('5月20日')
  })

  it('player affiliation shows player name, team, and year without ambiguity', () => {
    const results = emptyResults()
    results.affiliations = [
      affiliationRow(2026, '横浜DeNAベイスターズ', '藤浪 晋太郎', 'bis_roster'),
    ]

    const answer = formatChatAnswer({
      question: '藤浪はどこのチーム',
      structuredQuery: { intent: 'player_affiliation', filters: { player_name: '藤浪' } },
      results,
      sources: [],
      playerResolution: {
        input: '藤浪',
        player_id: 'idp2db',
        name: '藤浪 晋太郎',
        primary_team: '横浜DeNAベイスターズ',
        status: 'resolved',
        candidates: [],
      },
    })

    // 5W1H: 誰が（選手名）・どこで（チーム）・いつ（年）
    expect(answer.summary).toContain('2026年')
    expect(answer.summary).toContain('横浜DeNAベイスターズ')
    expect(answer.summary).toContain('藤浪')
    expect(answer.summary).toContain('所属')
  })

  it('roster query shows player, team, date, and starter status', () => {
    const results = emptyResults()
    results.roster = [
      rosterEntryRow('2026-05-22', 'f20260522db-d-05', '横浜DeNAベイスターズ', '藤浪 晋太郎', null, false),
    ]

    const answer = formatChatAnswer({
      question: '藤浪のロスターを確認したい',
      structuredQuery: { intent: 'search_roster', filters: { player_name: '藤浪', year: 2026 } },
      results,
      sources: [],
    })

    // 5W1H: いつ（日付）・誰が（選手名）・どこで（チーム）・登録状況
    expect(answer.summary).toContain('2026-05-22')
    expect(answer.summary).toContain('横浜DeNAベイスターズ')
    expect(answer.summary).toContain('藤浪 晋太郎')
  })

  it('search_games returns date, teams, and result count', () => {
    const results = emptyResults()
    results.games = [
      gameSummaryRow('2026-05-22', 'f20260522db-d-05', '横浜DeNAベイスターズ vs 中日ドラゴンズ'),
      gameSummaryRow('2026-05-21', 'f20260521db-h-04', '横浜DeNAベイスターズ vs 北海道日本ハムファイターズ'),
    ]

    const answer = formatChatAnswer({
      question: 'DeNAの最近の試合一覧',
      structuredQuery: { intent: 'search_games', filters: { team: 'DeNA', year: 2026 } },
      results,
      sources: [],
    })

    // 5W1H: 件数・先頭試合の日付・チーム
    expect(answer.result_count).toBe(2)
    expect(answer.summary).toContain('2件')
    expect(answer.summary).toContain('2026-05-22')
    expect(answer.summary).toContain('横浜DeNAベイスターズ vs 中日ドラゴンズ')
  })

  it('batting with fielding position filter shows date, player, team, and stats', () => {
    const results = emptyResults()
    results.batting = [
      {
        ...battingRow('2026-05-22', 4, 2, 1, 0),
        playerName: '木浪 聖也',
        team: '阪神タイガース',
        position: '遊',
        battingOrder: 8,
      },
    ]

    const answer = formatChatAnswer({
      question: '阪神でショートを守っているのは直近でいつ',
      structuredQuery: { intent: 'search_batting', filters: { team: '阪神', position: '遊', recent: true } },
      results,
      sources: [],
    })

    // 5W1H: いつ（日付）・誰が（選手名）・どこで（チーム）・どの程度（打撃数）
    expect(answer.result_count).toBe(1)
    expect(answer.summary).toContain('2026年5月22日')
    expect(answer.summary).toContain('木浪 聖也')
    expect(answer.summary).toContain('阪神タイガース')
  })

  it('aggregate_batting shows label and count', () => {
    const results = emptyResults()
    results.aggregates = [
      { kind: 'batting', label: '村上（ヤクルト）', total: 21, stats: { 本塁打: 21 } },
      { kind: 'batting', label: '岡本（巨人）', total: 18, stats: { 本塁打: 18 } },
    ]

    const answer = formatChatAnswer({
      question: '2025年本塁打王ランキング',
      structuredQuery: { intent: 'aggregate_batting', filters: { year: 2025 } },
      results,
      sources: [],
    })

    expect(answer.result_count).toBe(2)
    expect(answer.summary).toContain('2件')
    expect(answer.summary).toContain('村上（ヤクルト）')
    expect(answer.summary).toContain('21')
  })

  it('aggregate_pitching shows pitcher label and count', () => {
    const results = emptyResults()
    results.aggregates = [
      { kind: 'pitching', label: '山本由伸（オリックス）', total: 169, stats: { 奪三振: 169 } },
    ]

    const answer = formatChatAnswer({
      question: '2023年の奪三振王は誰',
      structuredQuery: { intent: 'aggregate_pitching', filters: { year: 2023 } },
      results,
      sources: [],
    })

    expect(answer.result_count).toBe(1)
    expect(answer.summary).toContain('山本由伸（オリックス）')
    expect(answer.summary).toContain('169')
  })

  it('calculates batting sabermetrics from official season stats', () => {
    const results = emptyResults()
    results.batting = [{
      gameId: 'bis:2026:g:idb1',
      gameDate: '2026-01-01',
      team: '巨人',
      playerName: '大城 卓三',
      battingOrder: null,
      position: null,
      atBats: 61,
      runs: 0,
      hits: 19,
      runsBattedIn: 11,
      stolenBases: 0,
      strikeouts: 14,
      walks: 11,
      rawText: JSON.stringify({
        試合: '24',
        打席: '72',
        打数: '61',
        安打: '19',
        二塁打: '3',
        三塁打: '0',
        本塁打: '4',
        四球: '11',
        三振: '14',
        打率: '.311',
        出塁率: '.417',
        長打率: '.557',
      }),
      sourceKind: 'bis_batting',
      sourceUrl: 'https://npb.jp/bis/2026/stats/idb1_g.html',
      statsJson: JSON.stringify({
        試合: '24',
        打席: '72',
        打数: '61',
        安打: '19',
        二塁打: '3',
        三塁打: '0',
        本塁打: '4',
        四球: '11',
        三振: '14',
        打率: '.311',
        出塁率: '.417',
        長打率: '.557',
      }),
    }]

    const answer = formatChatAnswer({
      question: '大城ってセイバー的に今どんな感じ',
      structuredQuery: { intent: 'search_batting', filters: { team: '巨人', player_name: '大城' } },
      results,
      sources: [],
    })

    expect(answer.summary).toContain('派生指標')
    expect(answer.summary).toContain('OPS.974')
    expect(answer.summary).toContain('IsoP.246')
    expect(answer.summary).toContain('BB/K0.79')
    expect(answer.summary).toContain('BB%15.3%')
    expect(answer.summary).toContain('K%19.4%')
  })
})

function emptyResults(): ChatResponse['results'] {
  return {
    events: [],
    games: [],
    pitching: [],
    batting: [],
    roster: [],
    affiliations: [],
    gameDetails: [],
    aggregates: [],
  }
}

function evaluationMetadata(): ChatExecutionMetadata {
  return {
    dataRequirements: ['batting_lines'],
    repositories: ['searchBattingLines'],
    playerResolution: null,
    playerIdRequired: true,
    playerIdSatisfied: true,
    followUpType: 'evaluation_request',
    referencedContext: {
      source: 'latest_assistant_entry',
      anchor: null,
      ordinal: null,
      summary: null,
    },
    targetEntity: {
      kind: 'player',
      label: '対象選手',
      players: ['対象選手'],
      teams: [],
    },
    followUpContext: {
      contextKind: 'player_stats',
      inheritedPlayerId: null,
      inheritedPlayerName: '対象選手',
      inheritedTeam: null,
      inheritedSeason: 2026,
      inheritedScope: 'current',
      inheritanceSource: 'conversation_history',
      inheritanceConfidence: 0.62,
      shouldApplyInheritance: false,
    },
    correctionGuard: {
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
    identityIntent: {
      scope: 'current',
      explicitSeasonOverride: false,
      explicitScopeOverride: false,
    },
    targetGameId: null,
    targetPlayerId: null,
    answerMode: 'evaluation_explanation',
    identityResolutionScope: 'current',
  }
}

function eventRow(index: number): EventRow {
  const day = String(index).padStart(2, '0')
  return {
    gameId: `r202505${day}s-d-${day}`,
    gameDate: `2025-05-${day}`,
    sequence: index,
    inning: 1,
    half: 'bottom',
    offenseTeam: 'ヤクルト',
    eventType: 'plate_appearance',
    eventSubtype: 'standard',
    batterName: '山田',
    pitcherName: '松葉',
    runnerName: null,
    resultText: 'レフト2ランホームラン（打点2）',
    eventAttributesJson: null,
    sourceUrl: `https://npb.jp/scores/2025/05${day}/s-d-${day}/playbyplay.html`,
  }
}

function farmBoxRow(
  gameDate: string,
  gameId: string,
  team: string,
  pitcherName: string,
  inningsPitched: string,
  strikeouts: number,
  earnedRuns: number,
) {
  return {
    gameId,
    gameDate,
    team,
    pitcherName,
    inningsPitched,
    pitchCount: 0,
    strikeouts,
    runs: earnedRuns,
    earnedRuns,
    sourceKind: 'box' as const,
    sourceUrl: `https://npb.jp/bis/${gameDate.slice(0, 4)}/games/fs${gameDate.replaceAll('-', '')}.html`,
    statsJson: null,
  }
}

function regularBoxRow(
  gameDate: string,
  gameId: string,
  team: string,
  pitcherName: string,
  inningsPitched: string,
  strikeouts: number,
  earnedRuns: number,
) {
  return {
    gameId,
    gameDate,
    team,
    pitcherName,
    inningsPitched,
    pitchCount: 80,
    strikeouts,
    runs: earnedRuns,
    earnedRuns,
    sourceKind: 'box' as const,
    sourceUrl: `https://npb.jp/scores/${gameDate.slice(0, 4)}/${gameDate.slice(5, 7)}${gameDate.slice(8, 10)}/index.html`,
    statsJson: null,
  }
}

function bisPitchingRegularRow(
  year: string,
  team: string,
  pitcherName: string,
  stats: Record<string, string>,
) {
  return {
    gameId: `bis:${year}:reg:idp1`,
    gameDate: `${year}-01-01`,
    team,
    pitcherName,
    inningsPitched: stats['投球回'] ?? '0',
    pitchCount: 0,
    strikeouts: Number(stats['三振'] ?? 0),
    runs: Number(stats['失点'] ?? 0),
    earnedRuns: Number(stats['自責点'] ?? 0),
    sourceKind: 'bis_pitching' as const,
    sourceUrl: `https://npb.jp/bis/${year}/stats/idp1_t.html`,
    statsJson: JSON.stringify({ ...stats }),
  }
}

function bisPitchingFarmRow(
  year: string,
  team: string,
  pitcherName: string,
  stats: Record<string, string>,
) {
  return {
    gameId: `bis:${year}:farm:idp2`,
    gameDate: `${year}-01-01`,
    team,
    pitcherName,
    inningsPitched: stats['投球回'] ?? '0',
    pitchCount: 0,
    strikeouts: Number(stats['三振'] ?? 0),
    runs: Number(stats['失点'] ?? 0),
    earnedRuns: Number(stats['自責点'] ?? 0),
    sourceKind: 'bis_pitching_farm' as const,
    sourceUrl: `https://npb.jp/bis/${year}/stats/idp2_db.html`,
    statsJson: JSON.stringify({ ...stats }),
  }
}

function bisBattingRow(
  year: string,
  team: string,
  playerName: string,
  stats: Record<string, string>,
) {
  return {
    gameId: `bis:${year}:g:idb1`,
    gameDate: `${year}-01-01`,
    team,
    playerName,
    battingOrder: null,
    position: null,
    atBats: Number(stats['打数'] ?? 0),
    runs: 0,
    hits: Number(stats['安打'] ?? 0),
    runsBattedIn: Number(stats['打点'] ?? 0),
    stolenBases: Number(stats['盗塁'] ?? 0),
    strikeouts: Number(stats['三振'] ?? 0),
    walks: Number(stats['四球'] ?? 0),
    rawText: JSON.stringify({ ...stats }),
    sourceKind: 'bis_batting' as const,
    sourceUrl: `https://npb.jp/bis/${year}/stats/idb1_g.html`,
    statsJson: JSON.stringify({ ...stats }),
  }
}

function affiliationRow(
  year: number,
  team: string,
  playerName: string,
  sourceKind: 'bis_roster' | 'roster' | 'batting' | 'pitching' | 'event',
) {
  return {
    year,
    gameId: `bis:${year}:roster`,
    gameDate: `${year}-03-01`,
    team,
    playerName,
    playerId: null,
    sourceKind,
    sourceUrl: `https://npb.jp/bis/${year}/stats/idp1.html`,
  }
}

function rosterEntryRow(
  gameDate: string,
  gameId: string,
  team: string,
  playerName: string,
  position: string | null,
  starter: boolean | null,
) {
  return {
    gameId,
    gameDate,
    team,
    groupLabel: starter ? 'スタメン' : '登録',
    playerName,
    uniformNumber: null,
    position,
    starter,
    battingOrder: null,
  }
}

function gameSummaryRow(
  date: string,
  gameId: string,
  matchupText: string,
) {
  const [away, home] = matchupText.split(' vs ')
  return {
    gameId,
    date,
    awayTeamName: away ?? '',
    homeTeamName: home ?? '',
    matchupText,
    venue: '',
  }
}

function battingRow(
  gameDate: string,
  atBats: number,
  hits: number,
  runsBattedIn: number,
  walks: number,
) {
  return {
    gameId: `r${gameDate.replaceAll('-', '')}s-d-01`,
    gameDate,
    team: 'ヤクルト',
    playerName: '村上',
    battingOrder: 4,
    position: '三',
    atBats,
    runs: 0,
    hits,
    runsBattedIn,
    stolenBases: 0,
    strikeouts: 1,
    walks,
    rawText: null,
    sourceKind: 'box' as const,
    sourceUrl: null,
    statsJson: null,
  }
}
