import type { ChatPlannerOutput } from './chat-query-plan'

type PlannerValidationIssue = ChatPlannerOutput['validation']['issues'][number]

/**
 * Planner が生成した構造化フィールド間の矛盾だけを検査する。
 * 元の自然文は入力に取らず、domain/intent を別のルールで再分類しない。
 */
export function validateChatPlannerOutput(output: ChatPlannerOutput): ChatPlannerOutput {
  if (output.structuredQuery.intent !== 'off_topic') {
    return {
      ...output,
      domain: 'npb',
      validation: { valid: true, issues: [] },
    }
  }

  const issues: PlannerValidationIssue[] = []
  if (Object.keys(output.entities).length > 0) {
    issues.push('off_topic_with_entities')
  }
  if (output.targetPlayerId || output.targetGameId) {
    issues.push('off_topic_with_target_id')
  }
  if (output.referencedContext !== null && output.referencedContext.source !== 'none') {
    issues.push('off_topic_with_referenced_context')
  }
  if (
    output.followUpContext.inheritanceSource !== 'none' ||
    output.followUpContext.inheritedPlayerId ||
    output.followUpContext.inheritedPlayerName ||
    output.followUpContext.inheritedTeam ||
    output.followUpContext.inheritedSeason !== null
  ) {
    issues.push('off_topic_with_inherited_context')
  }
  if (output.dataRequirements.length > 0) {
    issues.push('off_topic_with_data_requirements')
  }
  if (output.capabilityUsesRepository === true) {
    issues.push('off_topic_with_repository_route')
  }

  return {
    ...output,
    domain: issues.length > 0 ? 'ambiguous' : 'non_npb',
    clarificationRequired: issues.length > 0,
    confidence: issues.length > 0 ? Math.min(output.confidence, 0.5) : output.confidence,
    validation: {
      valid: issues.length === 0,
      issues,
    },
  }
}
