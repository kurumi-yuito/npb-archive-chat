import type { ChatRequest, ChatStructuredQuery } from '@npb/schemas'
import type { ChatQueryParser } from './chat-query-parser'
import type { normalizeChatStructuredQuery } from './chat-query-normalizer'
import {
  classifyFollowUpContext,
  chatPlannerOutputSchema,
  extractPlannerEntities,
  extractPlannerTimeRange,
  extractFollowUpContextMetadata,
  inferCorrectionGuardMetadata,
  inferDataRequirements,
  type ChatPlannerOutput,
} from './chat-query-plan'
import { inferIdentityResolutionScope } from './chat-identity-scope'

export type ChatPlanner = (
  message: string,
  context?: { history?: ChatRequest['history'] },
) => Promise<ChatPlannerOutput>

type CreateChatPlannerOptions = {
  parseStructuredQueryFromMessage: ChatQueryParser
  normalizeStructuredQuery: typeof normalizeChatStructuredQuery
}

export function createChatPlanner({
  parseStructuredQueryFromMessage,
  normalizeStructuredQuery,
}: CreateChatPlannerOptions): ChatPlanner {
  return async (message, context = {}) => {
    const structuredQuery = normalizeStructuredQuery(
      await parseStructuredQueryFromMessage(message, {
        history: context.history,
      }),
    )
    return buildPlannerOutput(structuredQuery, false, {
      message,
      history: context.history,
    })
  }
}

export function buildPlannerOutput(
  structuredQuery: ChatStructuredQuery,
  legacyStabilizationApplied: boolean,
  context: { message?: string; history?: ChatRequest['history'] } = {},
): ChatPlannerOutput {
  const classification = classifyFollowUpContext(
    context.message ?? '',
    context.history,
    structuredQuery,
  )
  const identityResolutionScope = inferIdentityResolutionScope({
    message: context.message ?? '',
    structuredQuery,
  })
  const followUpContext = extractFollowUpContextMetadata({
    query: structuredQuery,
    identityResolutionScope,
    followUpType: classification.followUpType,
    referencedContext: classification.referencedContext,
    targetEntity: classification.targetEntity,
    targetGameId: classification.targetGameId,
    history: context.history,
  })
  return chatPlannerOutputSchema.parse({
    intent: structuredQuery.intent,
    structuredQuery,
    entities: extractPlannerEntities(structuredQuery),
    followUpType: classification.followUpType,
    referencedContext: classification.referencedContext,
    targetEntity: classification.targetEntity,
    followUpContext,
    correctionGuard: inferCorrectionGuardMetadata({
      message: context.message ?? '',
      query: structuredQuery,
      followUpType: classification.followUpType,
      followUpContext,
      targetGameId: classification.targetGameId,
    }),
    targetGameId: classification.targetGameId,
    targetPlayerId: classification.targetPlayerId,
    timeRange: extractPlannerTimeRange(structuredQuery),
    dataRequirements: inferDataRequirements(structuredQuery),
    answerMode: classification.answerMode,
    identityResolutionScope,
    confidence: legacyStabilizationApplied ? 0.72 : 0.86,
    clarificationRequired: false,
    legacyStabilizationApplied,
  })
}
