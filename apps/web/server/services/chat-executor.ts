import type { ChatStructuredQuery } from '@npb/schemas'
import { buildIdentityResolutionMetadata } from './player-identity'
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
  return {
    dataRequirements: plannerOutput?.dataRequirements ?? inferDataRequirements(structuredQuery),
    repositories: repositoriesForQuery(structuredQuery),
    playerResolution,
    ...(playerResolution
      ? { identityResolution: buildIdentityResolutionMetadata(structuredQuery, playerResolution) }
      : {}),
    playerIdRequired,
    playerIdSatisfied: !playerIdRequired || queryHasPlayerId(structuredQuery) || resolvedPlayerId,
    followUpType: plannerOutput?.followUpType ?? 'standalone',
    referencedContext: plannerOutput?.referencedContext ?? null,
    targetEntity: plannerOutput?.targetEntity ?? null,
    targetGameId: plannerOutput?.targetGameId ?? null,
    targetPlayerId: plannerOutput?.targetPlayerId ?? null,
    answerMode: plannerOutput?.answerMode ?? 'direct_answer',
  }
}
