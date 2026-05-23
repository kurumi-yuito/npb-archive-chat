import { describe, expect, it } from 'vitest'
import type { ChatResponse, ChatStructuredQuery } from '@npb/schemas'
import type { EventRow } from '@npb/db'
import { formatChatAnswer } from '../server/services/chat-answer-formatter'

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
    expect(answer.summary).toContain('2025年ヤクルト山田が打ったホームランは21件です。')
    expect(answer.summary).toContain('1. 2025-05-01 r20250501s-d-01 1回裏')
    expect(answer.summary).toContain('松葉からレフト2ランホームラン（打点2）')
    expect(answer.summary).toContain('source: https://npb.jp/scores/2025/0501/s-d-01/playbyplay.html')
    expect(answer.summary).toContain('20. 2025-05-20 r20250520s-d-20 1回裏')
    expect(answer.summary).not.toContain('21. 2025-05-21')
    expect(answer.summary).toContain('ほか1件は省略しています。')
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

  it('formats recent batting lines as a positive player evaluation', () => {
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

    expect(answer.summary).toContain('村上は、DBで確認できる直近2試合の打撃内容を見る限り、ポジティブに評価できます。')
    expect(answer.summary).toContain('2試合で3安打')
    expect(answer.summary).toContain('打点')
    expect(answer.summary).toContain('打率.429')
  })

  it('pitching evaluation with only a BIS farm row shows current season farm stats cleanly', () => {
    const results = emptyResults()
    // multi-year serviceがdedupしてBIS行1件だけ返す想定
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
    expect(answer.summary).toContain('2026年二軍')
    expect(answer.summary).toContain('藤浪 晋太郎')
    expect(answer.summary).toContain('登板4')
    expect(answer.summary).toContain('防御率2.00')
    // 2025年・2022年・「試合単位成績はDBに未登録」などの余計な情報は出ない
    expect(answer.summary).not.toContain('2025年')
    expect(answer.summary).not.toContain('2022年')
    expect(answer.summary).not.toContain('未登録')
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

function pitchingBoxRow(
  gameDate: string,
  team: string,
  pitcherName: string,
  inningsPitched: string,
  strikeouts: number,
  earnedRuns: number,
) {
  const d = gameDate.replaceAll('-', '')
  return {
    gameId: `r${d}box-01`,
    gameDate,
    team,
    pitcherName,
    inningsPitched,
    pitchCount: 80,
    strikeouts,
    runs: earnedRuns,
    earnedRuns,
    sourceKind: 'box' as const,
    sourceUrl: null,
    statsJson: null,
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
