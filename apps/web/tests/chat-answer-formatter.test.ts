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
