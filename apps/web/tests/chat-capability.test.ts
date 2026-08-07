import { describe, expect, it } from 'vitest'
import type { ChatStructuredQuery } from '@npb/schemas'
import { classifyChatCapability, SPORTS_NAVI_NPB_URL } from '../server/services/chat-capability'
import { createChatPlanner } from '../server/services/chat-planner'

const baseQuery = {
  intent: 'search_pitching',
  filters: { pitcher_name: '藤浪', recent: true, limit: 5 },
} as ChatStructuredQuery

describe('chat capability routing', () => {
  it('classifies realtime questions as external-source guidance', () => {
    const capability = classifyChatCapability('今日のスタメンは？', {
      intent: 'search_roster',
      filters: { team: '阪神' },
    } as ChatStructuredQuery)

    expect(capability).toMatchObject({
      intent: 'realtime',
      route: 'external_source_guidance',
      usesRepository: false,
      externalSourceUrl: SPORTS_NAVI_NPB_URL,
    })
  })

  it('classifies news questions as external-source guidance', () => {
    const capability = classifyChatCapability('村上宗隆ってケガした？', baseQuery)

    expect(capability).toMatchObject({
      intent: 'news',
      route: 'external_source_guidance',
      usesRepository: false,
      externalSourceUrl: SPORTS_NAVI_NPB_URL,
    })
  })

  it('classifies opinion as analysis before commentary', () => {
    const capability = classifyChatCapability('藤浪の最近の投球をどう評価する？', baseQuery, {
      followUpType: 'evaluation_request',
      answerMode: 'evaluation_explanation',
    })

    expect(capability).toMatchObject({
      intent: 'opinion',
      route: 'analysis_then_opinion',
      requiresAnalysis: true,
      usesRepository: true,
    })
  })

  it('classifies aggregate and recent questions as analytical', () => {
    const capability = classifyChatCapability('牧秀悟の2026年成績を分析して', {
      intent: 'aggregate_batting',
      filters: { player_name: '牧秀悟', year: 2026 },
    } as ChatStructuredQuery)

    expect(capability).toMatchObject({
      intent: 'analytical',
      route: 'repository_analysis',
      requiresAnalysis: true,
      usesRepository: true,
    })
  })

  it('does not treat current-season historical stat questions as realtime', () => {
    const capability = classifyChatCapability(
      '藤浪は今シーズン二軍で何回登板してる？直近の試合ではどんな投球だった？',
      baseQuery,
    )

    expect(capability).toMatchObject({
      intent: 'analytical',
      route: 'repository_analysis',
      usesRepository: true,
    })
  })

  it('does not treat current-season lineup aggregates as realtime starting lineup requests', () => {
    const capability = classifyChatCapability('今シーズンDeNAで捕手（スタメン）として最も多く出場しているのは誰？', {
      intent: 'aggregate_events',
      filters: { year: 2026, team: 'DeNA' },
    } as ChatStructuredQuery)

    expect(capability).toMatchObject({
      intent: 'analytical',
      route: 'repository_analysis',
      usesRepository: true,
    })
  })

  it('classifies ordinary past records as historical_record in the planner output', async () => {
    const planner = createChatPlanner({
      parseStructuredQueryFromMessage: async () => ({
        intent: 'search_events',
        filters: { year: 2025, batter_name: '山田' },
      }),
      normalizeStructuredQuery: (query) => query,
    })

    const output = await planner('2025年に山田が打ったホームラン一覧')

    expect(output.capability).toMatchObject({
      kind: 'historical_record',
      route: 'repository_history',
      usesRepository: true,
    })
  })
})
