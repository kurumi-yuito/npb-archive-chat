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
import { clarificationForUnresolvedFollowUp } from './chat-follow-up-clarification'

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
    const unresolvedFollowUp = clarificationForUnresolvedFollowUp(message, context.history)
    if (unresolvedFollowUp) return buildClarificationPlannerOutput(unresolvedFollowUp)
    let structuredQuery = normalizeStructuredQuery(
      await parseStructuredQueryFromMessage(message, {
        history: context.history,
      }),
    )
    let plannerOutput = buildPlannerOutput(structuredQuery, false, {
      message,
      history: context.history,
    })
    const referencedGameQuery = buildReferencedGameFollowUpQuery(plannerOutput)
    if (referencedGameQuery) {
      structuredQuery = normalizeStructuredQuery(referencedGameQuery)
      plannerOutput = buildPlannerOutput(structuredQuery, false, {
        message,
        history: context.history,
      })
    }
    if (structuredQuery.intent === 'off_topic') return plannerOutput
    const capability = classifyChatCapability(message, structuredQuery, plannerOutput)
    return chatPlannerOutputSchema.parse({
      ...plannerOutput,
      capability: {
        kind: capability.intent,
        route: capability.route,
        requiresAnalysis: capability.requiresAnalysis,
        usesRepository: capability.usesRepository,
        externalSourceUrl: capability.externalSourceUrl,
      },
    })
  }
}

function buildReferencedGameFollowUpQuery(
  plannerOutput: ChatPlannerOutput,
): ChatStructuredQuery | null {
  if (![
    'detail_request',
    'reason_request',
    'summary_request',
    'explanation_request',
    'casual_followup',
    'context_reference',
  ].includes(plannerOutput.followUpType)) {
    return null
  }
  const anchor = plannerOutput.referencedContext?.anchor
  if (!anchor) return null
  const dateMatch = anchor.match(/((?:19|20)\d{2})年(\d{1,2})月(\d{1,2})日/u)
  if (!dateMatch?.[1] || !dateMatch[2] || !dateMatch[3]) return null
  const gameDate = [
    dateMatch[1],
    dateMatch[2].padStart(2, '0'),
    dateMatch[3].padStart(2, '0'),
  ].join('-')
  const team = plannerOutput.targetEntity?.teams[0] ?? undefined
  return {
    intent: 'game_detail',
    filters: {
      game_date: gameDate,
      ...(team ? { team } : {}),
    },
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
    structuredQuery,
    responsePolicy: null,
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
    domain: structuredQuery.intent === 'off_topic' ? 'non_npb' : 'npb',
    legacyStabilizationApplied,
  })
}

function buildClarificationPlannerOutput(
  responsePolicy: NonNullable<ChatPlannerOutput['responsePolicy']>,
): ChatPlannerOutput {
  return chatPlannerOutputSchema.parse({
    structuredQuery: null,
    responsePolicy,
    entities: {},
    followUpType: 'context_reference',
    referencedContext: null,
    targetEntity: { kind: 'unknown', label: null, players: [], teams: [] },
    followUpContext: {
      contextKind: 'unknown', inheritedPlayerId: null, inheritedPlayerName: null,
      inheritedTeam: null, inheritedSeason: null, inheritedScope: 'unspecified',
      inheritanceSource: 'none', inheritanceConfidence: 0, shouldApplyInheritance: false,
    },
    correctionGuard: {
      inheritanceBlockedReason: 'none', hasAmbiguousCorrection: false,
      hasPlayerReplacement: false, hasExplicitSeasonOverride: false,
      hasExplicitScopeOverride: false, shouldBlockInheritance: false,
    },
    correction: { isCorrection: false, target: 'unknown', value: { kind: 'unknown' }, confidence: 0 },
    identityIntent: { scope: 'unspecified', explicitSeasonOverride: false, explicitScopeOverride: false },
    targetGameId: null, targetPlayerId: null, timeRange: null, dataRequirements: [],
    answerMode: 'clarification_request', identityResolutionScope: 'unspecified', confidence: 1,
    domain: 'npb', legacyStabilizationApplied: false,
  })
}
