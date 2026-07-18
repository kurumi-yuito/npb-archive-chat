import type { ChatRequest, ChatStructuredQuery } from '@npb/schemas'
import type { ChatQueryParser } from './chat-query-parser'
import type { normalizeChatStructuredQuery } from './chat-query-normalizer'
import {
  classifyFollowUpContext,
  chatPlannerOutputSchema,
  extractPlannerEntities,
  extractPlannerTimeRange,
  extractFollowUpContextMetadata,
  inferCorrectionMetadata,
  inferCorrectionGuardMetadata,
  inferDataRequirements,
  inferIdentityIntentMetadata,
  type ChatPlannerOutput,
} from './chat-query-plan'
import { inferIdentityResolutionScope } from './chat-identity-scope'
import { classifyChatCapability } from './chat-capability'

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
    const plannerOutput = buildPlannerOutput(structuredQuery, false, {
      message,
      history: context.history,
    })
    const capability = classifyChatCapability(message, structuredQuery, plannerOutput)
    return {
      ...plannerOutput,
      questionIntent: capability.intent,
      capabilityRoute: capability.route,
      capabilityRequiresAnalysis: capability.requiresAnalysis,
      capabilityUsesRepository: capability.usesRepository,
      capabilityExternalSourceUrl: capability.externalSourceUrl,
    }
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
    structuredQuery,
    followUpType: classification.followUpType,
    followUpContext: undefined,
    identityIntent: undefined,
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
  const updatedIdentityResolutionScope = inferIdentityResolutionScope({
    structuredQuery,
    followUpType: classification.followUpType,
    followUpContext,
    identityIntent: undefined,
  })
  const initialCorrectionGuard = inferCorrectionGuardMetadata({
    message: context.message ?? '',
    query: structuredQuery,
    followUpType: classification.followUpType,
    followUpContext,
    targetGameId: classification.targetGameId,
  })
  const initialCorrection = inferCorrectionMetadata({
    query: structuredQuery,
    followUpType: classification.followUpType,
    correctionGuard: initialCorrectionGuard,
    identityResolutionScope,
  })
  const initialIdentityIntent = inferIdentityIntentMetadata({
    identityResolutionScope: updatedIdentityResolutionScope,
    correctionGuard: initialCorrectionGuard,
  })
  const correctionGuard = inferCorrectionGuardMetadata({
    message: context.message ?? '',
    query: structuredQuery,
    followUpType: classification.followUpType,
    followUpContext,
    targetGameId: classification.targetGameId,
    correction: initialCorrection,
    identityIntent: initialIdentityIntent,
  })
  const correction = inferCorrectionMetadata({
    query: structuredQuery,
    followUpType: classification.followUpType,
    correctionGuard,
    identityResolutionScope,
  })
  const identityIntent = inferIdentityIntentMetadata({
    identityResolutionScope: updatedIdentityResolutionScope,
    correctionGuard,
  })
  return chatPlannerOutputSchema.parse({
    intent: structuredQuery.intent,
    structuredQuery,
    entities: extractPlannerEntities(structuredQuery),
    followUpType: classification.followUpType,
    referencedContext: classification.referencedContext,
    targetEntity: classification.targetEntity,
    followUpContext,
    correctionGuard,
    correction,
    identityIntent,
    targetGameId: classification.targetGameId,
    targetPlayerId: classification.targetPlayerId,
    timeRange: extractPlannerTimeRange(structuredQuery),
    dataRequirements: inferDataRequirements(structuredQuery),
    answerMode: classification.answerMode,
    identityResolutionScope: updatedIdentityResolutionScope,
    confidence: legacyStabilizationApplied ? 0.72 : 0.86,
    clarificationRequired: false,
    legacyStabilizationApplied,
  })
}
