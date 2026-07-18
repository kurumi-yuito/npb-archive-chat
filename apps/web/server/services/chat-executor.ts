import type { ChatStructuredQuery } from '@npb/schemas'
import { buildIdentityResolutionMetadata, type IdentityResolutionMetadata } from './player-identity'
import type { PlayerResolution } from './player-resolution'
import {
  inferDataRequirements,
  queryHasPlayerId,
  queryHasPlayerName,
  repositoriesForQuery,
  type ChatExecutionMetadata,
  type ChatPlannerOutput,
} from './chat-query-plan'

export function buildChatExecutionMetadata(
  structuredQuery: ChatStructuredQuery,
  playerResolution: PlayerResolution | null,
  plannerOutput?: ChatPlannerOutput,
  playerResolutions?: PlayerResolution[],
): ChatExecutionMetadata {
  const playerIdRequired = queryHasPlayerName(structuredQuery)
  const resolvedPlayerId = playerResolution?.status === 'resolved' && Boolean(playerResolution.player_id)
  const resolvedPlayerIds = playerResolutions?.length
    ? playerResolutions.every((resolution) => resolution.status === 'resolved' && Boolean(resolution.player_id))
    : false
  const identityResolution = buildExecutionIdentityResolution(structuredQuery, playerResolution)
  return {
    dataRequirements: plannerOutput?.dataRequirements ?? inferDataRequirements(structuredQuery),
    repositories: repositoriesForQuery(structuredQuery),
    playerResolution,
    ...(playerResolutions ? { playerResolutions } : {}),
    ...(identityResolution
      ? { identityResolution }
      : {}),
    playerIdRequired,
    playerIdSatisfied: !playerIdRequired || queryHasPlayerId(structuredQuery) || resolvedPlayerId || resolvedPlayerIds,
    followUpType: plannerOutput?.followUpType ?? 'standalone',
    referencedContext: plannerOutput?.referencedContext ?? null,
    targetEntity: plannerOutput?.targetEntity ?? null,
    followUpContext: plannerOutput?.followUpContext ?? {
      contextKind: 'unknown',
      inheritedPlayerId: null,
      inheritedPlayerName: null,
      inheritedTeam: null,
      inheritedSeason: null,
      inheritedScope: 'unspecified',
      inheritanceSource: 'none',
      inheritanceConfidence: 0,
      shouldApplyInheritance: false,
    },
    ...(plannerOutput?.appliedFollowUpContext
      ? { appliedFollowUpContext: plannerOutput.appliedFollowUpContext }
      : {}),
    correctionGuard: plannerOutput?.correctionGuard ?? {
      inheritanceBlockedReason: 'none',
      hasAmbiguousCorrection: false,
      hasPlayerReplacement: false,
      hasExplicitSeasonOverride: false,
      hasExplicitScopeOverride: false,
      shouldBlockInheritance: false,
    },
    correction: plannerOutput?.correction ?? {
      isCorrection: false,
      target: 'unknown',
      value: { kind: 'unknown' },
      confidence: 0,
    },
    identityIntent: plannerOutput?.identityIntent ?? {
      scope: plannerOutput?.identityResolutionScope ?? 'unspecified',
      explicitSeasonOverride: false,
      explicitScopeOverride: false,
    },
    targetGameId: plannerOutput?.targetGameId ?? null,
    targetPlayerId: plannerOutput?.targetPlayerId ?? null,
    answerMode: plannerOutput?.answerMode ?? 'direct_answer',
    identityResolutionScope: plannerOutput?.identityResolutionScope ?? 'unspecified',
    ...(plannerOutput?.questionIntent
      ? { questionIntent: plannerOutput.questionIntent }
      : {}),
    ...(plannerOutput?.capabilityRoute
      ? { capabilityRoute: plannerOutput.capabilityRoute }
      : {}),
    ...(plannerOutput?.capabilityRequiresAnalysis !== undefined
      ? { capabilityRequiresAnalysis: plannerOutput.capabilityRequiresAnalysis }
      : {}),
    ...(plannerOutput?.capabilityUsesRepository !== undefined
      ? { capabilityUsesRepository: plannerOutput.capabilityUsesRepository }
      : {}),
    ...(plannerOutput?.capabilityExternalSourceUrl !== undefined
      ? { capabilityExternalSourceUrl: plannerOutput.capabilityExternalSourceUrl }
      : {}),
  }
}

function getResolverIdentityResolution(
  playerResolution: PlayerResolution | null,
): IdentityResolutionMetadata | null {
  if (!playerResolution || !('identityResolution' in playerResolution)) {
    return null
  }
  return playerResolution.identityResolution as IdentityResolutionMetadata
}

function buildExecutionIdentityResolution(
  structuredQuery: ChatStructuredQuery,
  playerResolution: PlayerResolution | null,
): IdentityResolutionMetadata | null {
  if (!playerResolution) {
    return null
  }
  const metadata = buildIdentityResolutionMetadata(structuredQuery, playerResolution)
  const resolverMetadata = getResolverIdentityResolution(playerResolution)
  return resolverMetadata
    ? { ...metadata, context: resolverMetadata.context }
    : metadata
}
