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

    expect(answer.summary).toContain('巨人がDeNAに4-3で勝利しました。')
    expect(answer.summary).toContain('7回裏に巨人が1点を取り、ここでリードを奪いました。')
    expect(answer.summary).toContain('安打数はDeNAが10本、巨人が11本でした。')
    expect(answer.summary).not.toContain('r20260516g-db-08')
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
