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
): ChatExecutionMetadata {
  const playerIdRequired = queryHasPlayerName(structuredQuery)
  const resolvedPlayerId = playerResolution?.status === 'resolved' && Boolean(playerResolution.player_id)
  const identityResolution = buildExecutionIdentityResolution(structuredQuery, playerResolution)
  return {
    dataRequirements: plannerOutput?.dataRequirements ?? inferDataRequirements(structuredQuery),
    repositories: repositoriesForQuery(structuredQuery),
    playerResolution,
    ...(identityResolution
      ? { identityResolution }
      : {}),
    playerIdRequired,
    playerIdSatisfied: !playerIdRequired || queryHasPlayerId(structuredQuery) || resolvedPlayerId,
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
    targetGameId: plannerOutput?.targetGameId ?? null,
    targetPlayerId: plannerOutput?.targetPlayerId ?? null,
    answerMode: plannerOutput?.answerMode ?? 'direct_answer',
    identityResolutionScope: plannerOutput?.identityResolutionScope ?? 'unspecified',
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
