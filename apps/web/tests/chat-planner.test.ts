import { describe, expect, it } from 'vitest'
import type { ChatStructuredQuery } from '@npb/schemas'
import { buildPlannerOutput } from '../server/services/chat-planner'

function baseGameQuery(overrides: Partial<ChatStructuredQuery['filters']> = {}): ChatStructuredQuery {
  return {
    intent: 'game_detail',
    filters: {
      game_date: '2021-04-16',
      team: '阪神',
      ...overrides,
    },
  } as ChatStructuredQuery
}

function basePitchingQuery(overrides: Record<string, unknown> = {}): ChatStructuredQuery {
  return {
    intent: 'search_pitching',
    filters: {
      pitcher_name: '藤浪',
      ...overrides,
    },
  } as ChatStructuredQuery
}

const historyWithGameContext = [
  {
    role: 'assistant' as const,
    content: [
      '1. 2021年4月16日 r20210416t-s-01 甲子園、阪神タイガースが東京ヤクルトスワローズに2-0で勝利しました。',
      '2. 2021年4月17日 r20210417t-s-02 甲子園、阪神タイガースが東京ヤクルトスワローズに1-0で勝利しました。',
    ].join('\n'),
  },
]

describe('chat-planner follow-up classification', () => {
  const cases = [
    {
      message: 'それ詳しく',
      query: baseGameQuery(),
      expected: {
        followUpType: 'detail_request',
        answerMode: 'detail_explanation',
        targetGameId: 'r20210417t-s-02',
      },
    },
    {
      message: 'なんで？',
      query: baseGameQuery(),
      expected: {
        followUpType: 'reason_request',
        answerMode: 'reason_explanation',
        targetGameId: 'r20210417t-s-02',
      },
    },
    {
      message: 'つまり？',
      query: baseGameQuery(),
      expected: {
        followUpType: 'summary_request',
        answerMode: 'summary_explanation',
        targetGameId: 'r20210417t-s-02',
      },
    },
    {
      message: '違う、今年の話',
      query: basePitchingQuery({ year: 2026 }),
      expected: {
        followUpType: 'correction_request',
        answerMode: 'correction_explanation',
        targetPlayerId: null,
      },
    },
    {
      message: 'ちがうはずなんだけど、おかしくない？',
      query: baseGameQuery(),
      expected: {
        followUpType: 'doubt_request',
        answerMode: 'evaluation_explanation',
        targetGameId: 'r20210417t-s-02',
      },
    },
    {
      message: '調べなおして',
      query: baseGameQuery(),
      expected: {
        followUpType: 'recheck_request',
        answerMode: 'recheck_explanation',
        targetGameId: 'r20210417t-s-02',
      },
    },
    {
      message: '去年と比べてどう？',
      query: basePitchingQuery({ pitcher_player_id: '41045137' }),
      expected: {
        followUpType: 'comparison_request',
        answerMode: 'comparison_explanation',
        targetPlayerId: '41045137',
      },
    },
    {
      message: '藤浪どう？',
      query: basePitchingQuery({ pitcher_player_id: '41045137' }),
      expected: {
        followUpType: 'target_omission',
        answerMode: 'contextual_answer',
        targetPlayerId: '41045137',
      },
    },
    {
      message: 'さっきの二つ目',
      query: baseGameQuery(),
      expected: {
        followUpType: 'context_reference',
        answerMode: 'detail_explanation',
        targetGameId: 'r20210417t-s-02',
      },
    },
    {
      message: 'これやばくない？',
      query: baseGameQuery(),
      expected: {
        followUpType: 'casual_followup',
        answerMode: 'evaluation_explanation',
        targetGameId: 'r20210417t-s-02',
      },
    },
    {
      message: 'それってどういう意味？',
      query: baseGameQuery(),
      expected: {
        followUpType: 'explanation_request',
        answerMode: 'detail_explanation',
        targetGameId: 'r20210417t-s-02',
      },
    },
    {
      message: '一軍の話？',
      query: baseGameQuery(),
      expected: {
        followUpType: 'scope_clarification',
        answerMode: 'clarification_request',
        targetGameId: 'r20210417t-s-02',
      },
    },
    {
      message: 'いや藤浪じゃなくて村上',
      query: basePitchingQuery({ pitcher_player_id: '41045137' }),
      expected: {
        followUpType: 'team_context_correction',
        answerMode: 'correction_explanation',
        targetPlayerId: '41045137',
      },
    },
    {
      message: '今年じゃなくて去年',
      query: basePitchingQuery({ year: 2026 }),
      expected: {
        followUpType: 'timeframe_correction',
        answerMode: 'correction_explanation',
        targetPlayerId: null,
      },
    },
    {
      message: 'どこがよかった？',
      query: baseGameQuery(),
      expected: {
        followUpType: 'evaluation_request',
        answerMode: 'evaluation_explanation',
        targetGameId: 'r20210417t-s-02',
      },
    },
    {
      message: '違う、その前のやつ',
      query: baseGameQuery(),
      expected: {
        followUpType: 'context_reference',
        answerMode: 'detail_explanation',
        targetGameId: 'r20210416t-s-01',
      },
    },
  ] as const

  it.each(cases)('$message', ({ message, query, expected }) => {
    const planner = buildPlannerOutput(query, false, {
      message,
      history: historyWithGameContext,
    })

    expect(planner.followUpType).toBe(expected.followUpType)
    expect(planner.answerMode).toBe(expected.answerMode)
    if ('targetGameId' in expected) {
      expect(planner.targetGameId).toBe(expected.targetGameId)
    }
    if ('targetPlayerId' in expected) {
      expect(planner.targetPlayerId).toBe(expected.targetPlayerId)
    }
    expect(['current', 'historical', 'unspecified']).toContain(planner.identityResolutionScope)
    expect(planner.referencedContext).not.toBeNull()
  })
})
