import type { ChatStructuredQuery } from '@npb/schemas'
import type { ChatQueryService } from '@npb/db'
export {
  buildAliases,
  normalizeAliases,
  resolveAlias,
  type AliasResolution,
  type AliasResolutionMetadata,
  type AliasResolutionStatus,
} from './player-alias'
export {
  type SourceUrlResolution,
  type SourceUrlResolutionKind,
  type SourceUrlResolutionMetadata,
  type SourceUrlResolutionStatus,
} from './player-source-url'
export { resolveSourceUrl } from './player-source-url'
import { resolveStructuredQueryPlayer, type PlayerResolution } from './player-resolution'

export type IdentityResolutionField = 'batter_name' | 'pitcher_name' | 'runner_name' | 'player_name' | null
export type IdentityResolutionScope = 'unspecified' | 'current' | 'historical'

export type IdentityResolutionContextMetadata = {
  scope: IdentityResolutionScope
  team: string | null
  season: number | null
  hasTeamFilter: boolean
  hasYearFilter: boolean
}

export type IdentityResolutionPath = 'explicit_player_id' | 'candidate_search' | 'none'

export type IdentityResolutionMetadata = {
  path: IdentityResolutionPath
  field: IdentityResolutionField
  input: string | null
  status: PlayerResolution['status'] | 'skipped'
  playerId: string | null
  candidateCount: number
  candidatePlayerIds: string[]
  candidateNames: string[]
  hasTeamFilter: boolean
  hasYearFilter: boolean
  context: IdentityResolutionContextMetadata
}

export type IdentityAwarePlayerResolution = PlayerResolution & {
  identityResolution: IdentityResolutionMetadata
}

export type CurrentIdentityResolutionMetadata = IdentityResolutionMetadata & {
  context: IdentityResolutionContextMetadata & {
    scope: 'current'
  }
}

export type HistoricalIdentityResolutionMetadata = IdentityResolutionMetadata & {
  context: IdentityResolutionContextMetadata & {
    scope: 'historical'
  }
}

export type CurrentIdentityAwarePlayerResolution = PlayerResolution & {
  identityResolution: CurrentIdentityResolutionMetadata
}

export type HistoricalIdentityAwarePlayerResolution = PlayerResolution & {
  identityResolution: HistoricalIdentityResolutionMetadata
}

export type ResolvePlayerResult = {
  structuredQuery: ChatStructuredQuery
  resolution: IdentityAwarePlayerResolution | null
}

export type ResolveCurrentPlayerResult = {
  structuredQuery: ChatStructuredQuery
  resolution: CurrentIdentityAwarePlayerResolution | null
}

export type ResolveHistoricalPlayerResult = {
  structuredQuery: ChatStructuredQuery
  resolution: HistoricalIdentityAwarePlayerResolution | null
}

type ScopedIdentityResolution<S extends IdentityResolutionScope> =
  S extends 'current'
    ? CurrentIdentityAwarePlayerResolution
    : S extends 'historical'
      ? HistoricalIdentityAwarePlayerResolution
      : IdentityAwarePlayerResolution

type ScopedResolvePlayerResult<S extends IdentityResolutionScope> = {
  structuredQuery: ChatStructuredQuery
  resolution: ScopedIdentityResolution<S> | null
}

export type ResolvePlayersResult = ResolvePlayerResult[]

export async function resolvePlayer(
  queryService: ChatQueryService,
  structuredQuery: ChatStructuredQuery,
): Promise<ResolvePlayerResult> {
  return resolvePlayerWithScope(queryService, structuredQuery, 'unspecified')
}

export async function resolveCurrentPlayer(
  queryService: ChatQueryService,
  structuredQuery: ChatStructuredQuery,
): Promise<ResolveCurrentPlayerResult> {
  return resolvePlayerWithScope(queryService, structuredQuery, 'current')
}

export async function resolveHistoricalPlayer(
  queryService: ChatQueryService,
  structuredQuery: ChatStructuredQuery,
): Promise<ResolveHistoricalPlayerResult> {
  return resolvePlayerWithScope(queryService, structuredQuery, 'historical')
}

export async function resolvePlayers(
  queryService: ChatQueryService,
  structuredQueries: ChatStructuredQuery[],
): Promise<ResolvePlayersResult> {
  const results: ResolvePlayersResult = []
  for (const structuredQuery of structuredQueries) {
    results.push(await resolvePlayer(queryService, structuredQuery))
  }
  return results
}

export function buildIdentityResolutionMetadata(
  structuredQuery: ChatStructuredQuery,
  resolution: PlayerResolution | null,
  scope: IdentityResolutionScope = 'unspecified',
): IdentityResolutionMetadata {
  const target = findResolutionTarget(structuredQuery)
  const filters = structuredQuery.filters as Record<string, unknown>
  const explicitPlayerId =
    typeof filters.player_id === 'string'
      ? filters.player_id
      : typeof filters.pitcher_player_id === 'string'
        ? filters.pitcher_player_id
        : typeof filters.batter_player_id === 'string'
          ? filters.batter_player_id
          : typeof filters.runner_player_id === 'string'
            ? filters.runner_player_id
            : null
  const candidatePlayerIds = resolution?.candidates
    .map((candidate) => candidate.player_id)
    .filter((playerId): playerId is string => typeof playerId === 'string' && playerId.length > 0) ?? []
  const candidateNames = resolution?.candidates
    .map((candidate) => candidate.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0) ?? []

  return {
    path: explicitPlayerId ? 'explicit_player_id' : resolution ? 'candidate_search' : 'none',
    field: target?.field ?? null,
    input: target?.value ?? null,
    status: resolution?.status ?? 'skipped',
    playerId: resolution?.player_id ?? explicitPlayerId,
    candidateCount: resolution?.candidates.length ?? 0,
    candidatePlayerIds,
    candidateNames,
    hasTeamFilter: typeof filters.team === 'string' && filters.team.trim().length > 0,
    hasYearFilter:
      typeof filters.year === 'number' ||
      typeof filters.year_from === 'number' ||
      typeof filters.year_to === 'number',
    context: buildIdentityResolutionContext(structuredQuery, scope),
  }
}

async function resolvePlayerWithScope(
  queryService: ChatQueryService,
  structuredQuery: ChatStructuredQuery,
  scope: 'unspecified',
): Promise<ResolvePlayerResult>
async function resolvePlayerWithScope(
  queryService: ChatQueryService,
  structuredQuery: ChatStructuredQuery,
  scope: 'current',
): Promise<ResolveCurrentPlayerResult>
async function resolvePlayerWithScope(
  queryService: ChatQueryService,
  structuredQuery: ChatStructuredQuery,
  scope: 'historical',
): Promise<ResolveHistoricalPlayerResult>
async function resolvePlayerWithScope<S extends IdentityResolutionScope>(
  queryService: ChatQueryService,
  structuredQuery: ChatStructuredQuery,
  scope: S,
): Promise<ScopedResolvePlayerResult<S>> {
  const resolved = await resolveStructuredQueryPlayer(queryService, structuredQuery)
  return {
    structuredQuery: resolved.structuredQuery,
    resolution: resolved.resolution
      ? attachIdentityResolutionMetadata(structuredQuery, resolved.resolution, scope)
      : null,
  }
}

function attachIdentityResolutionMetadata<S extends IdentityResolutionScope>(
  structuredQuery: ChatStructuredQuery,
  resolution: PlayerResolution,
  scope: S,
): ScopedIdentityResolution<S> {
  return {
    ...resolution,
    identityResolution: buildIdentityResolutionMetadata(structuredQuery, resolution, scope),
  } as ScopedIdentityResolution<S>
}

function buildIdentityResolutionContext(
  structuredQuery: ChatStructuredQuery,
  scope: IdentityResolutionScope,
): IdentityResolutionContextMetadata {
  const filters = structuredQuery.filters as Record<string, unknown>
  const team = typeof filters.team === 'string' && filters.team.trim().length > 0
    ? filters.team
    : null
  const season = typeof filters.year === 'number'
    ? filters.year
    : typeof filters.year_from === 'number'
      ? filters.year_from
      : typeof filters.year_to === 'number'
        ? filters.year_to
        : null

  return {
    scope,
    team,
    season,
    hasTeamFilter: team !== null,
    hasYearFilter:
      typeof filters.year === 'number' ||
      typeof filters.year_from === 'number' ||
      typeof filters.year_to === 'number',
  }
}

function findResolutionTarget(structuredQuery: ChatStructuredQuery): { field: IdentityResolutionField; value: string } | null {
  const filters = structuredQuery.filters as Record<string, unknown>
  for (const field of ['batter_name', 'pitcher_name', 'runner_name', 'player_name'] as const) {
    const value = filters[field]
    if (typeof value === 'string' && value.trim()) {
      return { field, value }
    }
  }
  return null
}

export type { PlayerResolution }
