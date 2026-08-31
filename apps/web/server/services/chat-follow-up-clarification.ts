import type { ChatRequest, ChatResponseCore } from '@npb/schemas'
import { formatClarificationAnswer } from './chat-answer-formatter'
import type { ChatClarificationPolicy, ChatPlannerOutput, ChatPlannerValidationResult } from './chat-query-plan'

const recheckPattern = /^(?:もう一度)?(?:調べ直して|調べなおして|再確認して|見直して|確認し直して)[。！？!?]*$/u
const priorReferencePattern = /^(?:違う[、,\s]*)?(?:その|あの)?前の(?:やつ|もの|方)?(?:を)?(?:調べて|教えて|見せて)?[。！？!?]*$/u
const contextReferencePattern = /^(?:それ|これ|その件|その内容|さっきの(?:やつ|もの)?)(?:について)?(?:詳しく|教えて|どうだった|どういう意味)?[。！？!?]*$/u
const missingEntityReferencePattern = /^(?:この前のカード|さっき言ってた選手).*/u

export function clarificationForUnresolvedFollowUp(
  message: string,
  history?: ChatRequest['history'],
): ChatClarificationPolicy | null {
  const normalized = message.trim().replace(/\s+/gu, '')
  if (/\d{1,2}月/u.test(normalized) && !/(?:19|20)\d{2}年/u.test(normalized)) {
    return { action: 'clarify', reason: 'missing_year' }
  }
  const isRecheck = recheckPattern.test(normalized)
  const isPriorReference = priorReferencePattern.test(normalized)
  const isContextReference = contextReferencePattern.test(normalized)
  const isMissingEntityReference = missingEntityReferencePattern.test(normalized)
  if (!isRecheck && !isPriorReference && !isContextReference && !isMissingEntityReference) return null

  if (!history?.length) {
    return {
      action: 'clarify',
      reason: isContextReference || isMissingEntityReference ? 'insufficient_context' : 'missing_history',
    }
  }
  if (history.some((entry) => isUsableHistoryAnchor(entry.content))) return null
  return {
    action: 'clarify',
    reason: 'history_target_unavailable',
  }
}

function isUsableHistoryAnchor(content: string): boolean {
  const normalized = content.trim().replace(/\s+/gu, '')
  if (normalized.length < 4) return false
  if (recheckPattern.test(normalized) || priorReferencePattern.test(normalized) || contextReferencePattern.test(normalized)) {
    return false
  }
  return !/(直前の質問|直前の会話|履歴|対象.*教えて|どの内容|確認できない)/u.test(normalized)
}

export function buildClarificationResponse(
  message: string,
  plan: ChatPlannerOutput,
  validation: ChatPlannerValidationResult,
): ChatResponseCore {
  if (!plan.responsePolicy) throw new Error('Clarification response policy is required')
  return {
    message,
    structured_query: null,
    answer: {
      summary: formatClarificationAnswer(plan.responsePolicy),
      result_count: 0,
      source_urls: [],
      execution_metadata: {
        data_requirements: [], repositories: [], player_id_required: false, player_id_satisfied: true,
        follow_up_type: plan.followUpType, referenced_context: plan.referencedContext,
        target_entity: plan.targetEntity, follow_up_context: plan.followUpContext,
        correction_guard: plan.correctionGuard, correction: plan.correction,
        identity_intent: plan.identityIntent, target_game_id: null, target_player_id: null,
        answer_mode: plan.answerMode, identity_resolution_scope: plan.identityResolutionScope,
        domain: plan.domain, planner_validation: validation, response_policy: plan.responsePolicy,
        capability_uses_repository: false,
      },
    },
    results: { events: [], games: [], pitching: [], batting: [], roster: [], affiliations: [], gameDetails: [], aggregates: [] },
    sources: [],
  }
}
