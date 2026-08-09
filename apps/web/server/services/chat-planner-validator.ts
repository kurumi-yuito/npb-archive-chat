import {
  chatPlannerOutputSchema,
  type ChatPlannerOutput,
  type ChatPlannerValidationResult,
} from './chat-query-plan'

type PlannerValidationIssue = ChatPlannerValidationResult['issues'][number]

/** Planner contractの構造とフィールド間整合性だけを検査し、入力を変更しない。 */
export function validateChatPlannerOutput(output: unknown): ChatPlannerValidationResult {
  const parsed = chatPlannerOutputSchema.safeParse(output)
  if (!parsed.success) {
    return { status: 'planner_output_invalid', issues: ['schema_invalid'] }
  }

  const plan: ChatPlannerOutput = parsed.data
  const issues: PlannerValidationIssue[] = []
  if (plan.responsePolicy) {
    if (plan.structuredQuery !== null) issues.push('clarification_with_structured_query')
    if (plan.dataRequirements.length > 0) issues.push('clarification_with_data_requirements')
    if (plan.capability) issues.push('clarification_with_capability')
    return issues.length > 0
      ? { status: 'planner_output_inconsistent', issues }
      : { status: 'valid', issues: [] }
  }
  if (!plan.structuredQuery) {
    return { status: 'planner_output_inconsistent', issues: ['intent_mismatch'] }
  }
  const intent = plan.structuredQuery.intent

  if (
    (plan.domain === 'non_npb' && intent !== 'off_topic') ||
    (plan.domain === 'npb' && intent === 'off_topic')
  ) {
    issues.push('intent_mismatch')
  }

  if (intent === 'off_topic') {
    if (Object.keys(plan.entities).length > 0) issues.push('off_topic_with_entities')
    if (plan.targetPlayerId || plan.targetGameId) issues.push('off_topic_with_target_id')
    if (plan.referencedContext?.source && plan.referencedContext.source !== 'none') {
      issues.push('off_topic_with_referenced_context')
    }
    if (
      plan.followUpContext.inheritanceSource !== 'none' ||
      plan.followUpContext.inheritedPlayerId ||
      plan.followUpContext.inheritedPlayerName ||
      plan.followUpContext.inheritedTeam ||
      plan.followUpContext.inheritedSeason !== null
    ) {
      issues.push('off_topic_with_inherited_context')
    }
    if (plan.dataRequirements.length > 0) issues.push('off_topic_with_data_requirements')
    if (plan.capability?.usesRepository === true) issues.push('off_topic_with_repository_route')
  }

  return issues.length > 0
    ? { status: 'planner_output_inconsistent', issues }
    : { status: 'valid', issues: [] }
}
