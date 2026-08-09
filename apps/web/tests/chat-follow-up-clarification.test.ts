import { describe, expect, it, vi } from 'vitest'
import { chatResponseCoreSchema } from '@npb/schemas'
import { formatClarificationAnswer } from '../server/services/chat-answer-formatter'
import { buildClarificationResponse, clarificationForUnresolvedFollowUp } from '../server/services/chat-follow-up-clarification'
import { createChatPlanner } from '../server/services/chat-planner'
import { validateChatPlannerOutput } from '../server/services/chat-planner-validator'

describe('follow-up clarification contract', () => {
  it.each([
    ['調べなおして', undefined, 'missing_history'],
    ['違う、その前のやつ', undefined, 'missing_history'],
    ['それ詳しく', undefined, 'insufficient_context'],
    ['調べなおして', [{ role: 'user' as const, content: 'それ' }], 'history_target_unavailable'],
  ])('classifies unresolved context without using off_topic: %s', (message, history, reason) => {
    expect(clarificationForUnresolvedFollowUp(message, history)).toEqual({
      action: 'clarify',
      reason,
    })
  })

  it.each(['調べなおして', '違う、その前のやつ'])(
    'keeps a resolvable follow-up on the ordinary planner path: %s',
    (message) => {
      expect(clarificationForUnresolvedFollowUp(message, [
        { role: 'user', content: '2026年の藤浪の登板を教えて' },
        { role: 'assistant', content: '藤浪晋太郎の2026年の登板結果です。' },
      ])).toBeNull()
    },
  )

  it('builds a valid non-repository clarification plan before calling the LLM parser', async () => {
    const parser = vi.fn(async () => { throw new Error('parser must not be called') })
    const planner = createChatPlanner({
      parseStructuredQueryFromMessage: parser,
      normalizeStructuredQuery: (query) => query,
    })
    const output = await planner('調べなおして')

    expect(parser).not.toHaveBeenCalled()
    expect(output).toMatchObject({
      structuredQuery: null,
      responsePolicy: { action: 'clarify', reason: 'missing_history' },
      domain: 'npb',
      answerMode: 'clarification_request',
      dataRequirements: [],
    })
    expect(output.capability).toBeUndefined()
    expect(validateChatPlannerOutput(output)).toEqual({ status: 'valid', issues: [] })
    const response = chatResponseCoreSchema.parse(
      buildClarificationResponse('調べなおして', output, validateChatPlannerOutput(output)),
    )
    expect(response.answer).toMatchObject({
      summary: expect.stringContaining('直前の質問が確認できない'),
      result_count: 0,
      source_urls: [],
      execution_metadata: {
        answer_mode: 'clarification_request',
        capability_uses_repository: false,
        response_policy: { action: 'clarify', reason: 'missing_history' },
      },
    })
  })

  it('formats clarification without capability or query routing', () => {
    expect(formatClarificationAnswer({ action: 'clarify', reason: 'missing_history' }))
      .toContain('直前の質問が確認できない')
  })
})
