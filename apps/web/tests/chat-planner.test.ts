import { describe, expect, it } from 'vitest'
import type { ChatStructuredQuery } from '@npb/schemas'
import { buildPlannerOutput } from '../server/services/chat-planner'
import { validateChatPlannerOutput } from '../server/services/chat-planner-validator'
import { inferCorrectionGuardMetadata } from '../server/services/chat-query-plan'

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

  it('extracts non-applying game follow-up context metadata', () => {
    const planner = buildPlannerOutput(baseGameQuery(), false, {
      message: 'それ詳しく',
      history: historyWithGameContext,
    })

    expect(planner.followUpContext).toMatchObject({
      contextKind: 'game',
      inheritedTeam: '阪神',
      inheritedSeason: null,
      inheritedScope: 'unspecified',
      inheritanceSource: 'latest_assistant_entry',
      shouldApplyInheritance: false,
    })
    expect(planner.structuredQuery).toEqual(baseGameQuery())
  })

  it('extracts non-applying player stats follow-up context metadata', () => {
    const query = basePitchingQuery({
      pitcher_player_id: '41045137',
      year: 2026,
    })
    const planner = buildPlannerOutput(query, false, {
      message: '一軍の話？',
      history: [
        { role: 'assistant', content: '横浜DeNAベイスターズ 藤浪 晋太郎の確認できる最新5試合の投球内容です。' },
      ],
    })

    expect(planner.followUpContext).toMatchObject({
      contextKind: 'player_stats',
      inheritedPlayerId: '41045137',
      inheritedPlayerName: '藤浪',
      inheritedSeason: 2026,
      inheritedScope: 'current',
      shouldApplyInheritance: false,
    })
    expect(planner.structuredQuery).toEqual(query)
  })

  it.each([
    {
      target: 'player' as const,
      identityIntent: { explicitSeasonOverride: false, explicitScopeOverride: false },
      expected: {
        inheritanceBlockedReason: 'player_replacement',
        hasPlayerReplacement: true,
        hasExplicitSeasonOverride: false,
        hasExplicitScopeOverride: false,
      },
    },
    {
      target: 'season' as const,
      identityIntent: { explicitSeasonOverride: false, explicitScopeOverride: false },
      expected: {
        inheritanceBlockedReason: 'explicit_season_override',
        hasPlayerReplacement: false,
        hasExplicitSeasonOverride: true,
        hasExplicitScopeOverride: false,
      },
    },
    {
      target: 'scope' as const,
      identityIntent: { explicitSeasonOverride: false, explicitScopeOverride: false },
      expected: {
        inheritanceBlockedReason: 'explicit_scope_override',
        hasPlayerReplacement: false,
        hasExplicitSeasonOverride: false,
        hasExplicitScopeOverride: true,
      },
    },
    {
      target: 'unknown' as const,
      identityIntent: { explicitSeasonOverride: true, explicitScopeOverride: true },
      expected: {
        inheritanceBlockedReason: 'explicit_season_override',
        hasPlayerReplacement: false,
        hasExplicitSeasonOverride: true,
        hasExplicitScopeOverride: true,
      },
    },
  ])('prioritizes structured correction guard metadata for $target', ({ target, identityIntent, expected }) => {
    const guard = inferCorrectionGuardMetadata({
      message: 'plain follow up',
      query: basePitchingQuery({ pitcher_player_id: '41045137' }),
      followUpType: 'target_omission',
      followUpContext: {
        contextKind: 'player_stats',
        inheritedPlayerId: '41045137',
        inheritedPlayerName: '藤浪',
        inheritedTeam: 'DeNA',
        inheritedSeason: 2026,
        inheritedScope: 'current',
        inheritanceSource: 'latest_assistant_entry',
        inheritanceConfidence: 0.9,
        shouldApplyInheritance: false,
      },
      targetGameId: null,
      correction: {
        isCorrection: target !== 'unknown',
        target,
        value: { kind: 'unknown' },
        confidence: target !== 'unknown' ? 0.9 : 0,
      },
      identityIntent: {
        scope: 'unspecified',
        ...identityIntent,
      },
    })

    expect(guard).toMatchObject({
      ...expected,
      shouldBlockInheritance: true,
    })
  })

  it.each([
    {
      message: '今年じゃなくて去年',
      query: basePitchingQuery({ year: 2025 }),
      expected: {
        inheritanceBlockedReason: 'explicit_season_override',
        hasExplicitSeasonOverride: true,
        hasExplicitScopeOverride: true,
      },
    },
    {
      message: '一軍の話？',
      query: basePitchingQuery({ pitcher_player_id: '41045137' }),
      expected: {
        inheritanceBlockedReason: 'explicit_scope_override',
        hasExplicitSeasonOverride: false,
        hasExplicitScopeOverride: true,
      },
    },
    {
      message: 'いや藤浪じゃなくて村上',
      query: basePitchingQuery({ pitcher_player_id: '41045137', pitcher_name: '村上' }),
      expected: {
        inheritanceBlockedReason: 'player_replacement',
        hasPlayerReplacement: true,
      },
    },
    {
      message: 'いや、そうじゃなくて',
      query: basePitchingQuery({ pitcher_player_id: '41045137' }),
      expected: {
        inheritanceBlockedReason: 'ambiguous_correction',
        hasAmbiguousCorrection: true,
      },
    },
    {
      message: 'それ詳しく',
      query: baseGameQuery(),
      expected: {
        inheritanceBlockedReason: 'game_context',
      },
    },
  ])('exposes correction guard metadata for $message', ({ message, query, expected }) => {
    const planner = buildPlannerOutput(query, false, {
      message,
      history: historyWithGameContext,
    })

    expect(planner.correctionGuard).toMatchObject({
      ...expected,
      shouldBlockInheritance: true,
    })
    expect(planner.correction).toMatchObject({
      isCorrection: expected.inheritanceBlockedReason !== 'game_context',
      target: expected.hasPlayerReplacement
        ? 'player'
        : expected.hasExplicitSeasonOverride
          ? 'season'
          : expected.hasExplicitScopeOverride
            ? 'scope'
            : 'unknown',
    })
    expect(planner.identityIntent).toMatchObject({
      scope: planner.identityResolutionScope,
      explicitSeasonOverride: Boolean(expected.hasExplicitSeasonOverride),
      explicitScopeOverride: Boolean(expected.hasExplicitScopeOverride),
    })
    expect(planner.structuredQuery).toEqual(query)
  })
})

describe('chat-planner output validation', () => {
  it('accepts a self-consistent non-NPB result without reading the question', () => {
    const output = buildPlannerOutput({ intent: 'off_topic', filters: {} }, false)

    expect(validateChatPlannerOutput(output)).toEqual({ status: 'valid', issues: [] })
    expect(output.domain).toBe('non_npb')
  })

  it('marks off_topic with a resolved entity as an ambiguous contradiction', () => {
    const output = buildPlannerOutput({ intent: 'off_topic', filters: {} }, false)
    const candidate = {
      ...output,
      entities: { player: '藤浪' },
      targetPlayerId: '41045137',
    }
    const validated = validateChatPlannerOutput(candidate)

    expect(validated).toEqual({
      status: 'planner_output_inconsistent',
      issues: ['off_topic_with_entities', 'off_topic_with_target_id'],
    })
    expect(candidate.domain).toBe('non_npb')
  })

  it('marks off_topic with inherited NPB context as an ambiguous contradiction', () => {
    const output = buildPlannerOutput({ intent: 'off_topic', filters: {} }, false)
    const validated = validateChatPlannerOutput({
      ...output,
      referencedContext: {
        source: 'conversation_history',
        anchor: '藤浪',
        ordinal: null,
        summary: null,
      },
      followUpContext: {
        ...output.followUpContext,
        contextKind: 'player_stats',
        inheritedPlayerName: '藤浪',
        inheritanceSource: 'conversation_history',
      },
    })

    expect(validated).toEqual({
      status: 'planner_output_inconsistent',
      issues: ['off_topic_with_referenced_context', 'off_topic_with_inherited_context'],
    })
  })

  it('reports schema failures without creating a replacement plan', () => {
    expect(validateChatPlannerOutput({ domain: 'npb' })).toEqual({
      status: 'planner_output_invalid',
      issues: ['schema_invalid'],
    })
  })

  it('reports domain/intent and repository-route contradictions', () => {
    const output = buildPlannerOutput({ intent: 'off_topic', filters: {} }, false)
    const validated = validateChatPlannerOutput({
      ...output,
      domain: 'npb',
      capability: {
        kind: 'historical_record',
        route: 'repository_history',
        requiresAnalysis: false,
        usesRepository: true,
        externalSourceUrl: null,
      },
    })

    expect(validated).toEqual({
      status: 'planner_output_inconsistent',
      issues: ['intent_mismatch', 'off_topic_with_repository_route'],
    })
  })
})
