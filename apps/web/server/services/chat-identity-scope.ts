import type { ChatStructuredQuery } from '@npb/schemas'
import type {
  ChatFollowUpContextMetadata,
  ChatFollowUpType,
  ChatIdentityIntentMetadata,
} from './chat-query-plan'
import type { IdentityResolutionScope } from './player-identity'

type InferIdentityResolutionScopeInput = {
  structuredQuery: ChatStructuredQuery
  followUpType?: ChatFollowUpType
  followUpContext?: Pick<
    ChatFollowUpContextMetadata,
    'contextKind' | 'inheritedScope' | 'inheritedSeason'
  >
  identityIntent?: Pick<
    ChatIdentityIntentMetadata,
    'explicitScopeOverride' | 'explicitSeasonOverride'
  >
  currentYear?: number
}

export function inferIdentityResolutionScope({
  structuredQuery,
  followUpType = 'standalone',
  followUpContext,
  identityIntent,
  currentYear = currentJstYear(),
}: InferIdentityResolutionScopeInput): IdentityResolutionScope {
  const structuredScope = inferScopeFromStructuredQuery(structuredQuery, currentYear)
  if (structuredScope !== 'unspecified') {
    return structuredScope
  }
  if (
    followUpType !== 'standalone' &&
    followUpContext?.inheritedScope &&
    followUpContext.inheritedScope !== 'unspecified' &&
    !identityIntent?.explicitScopeOverride
  ) {
    return followUpContext.inheritedScope
  }
  if (
    followUpContext?.contextKind === 'player_stats' &&
    typeof followUpContext.inheritedSeason === 'number'
  ) {
    return followUpContext.inheritedSeason < currentYear ? 'historical' : 'current'
  }
  if (
    followUpContext?.contextKind === 'team_stats' &&
    typeof followUpContext.inheritedSeason === 'number'
  ) {
    return followUpContext.inheritedSeason < currentYear ? 'historical' : 'current'
  }
  return 'unspecified'
}

function inferScopeFromStructuredQuery(
  structuredQuery: ChatStructuredQuery,
  currentYear: number,
): IdentityResolutionScope {
  const filters = structuredQuery.filters as Record<string, unknown>
  if (filters.recent === true) {
    return 'current'
  }
  const year = typeof filters.year === 'number' ? filters.year : null
  const yearFrom = typeof filters.year_from === 'number' ? filters.year_from : null
  const yearTo = typeof filters.year_to === 'number' ? filters.year_to : null
  if (year !== null) {
    return year < currentYear ? 'historical' : 'current'
  }
  if (yearFrom !== null && yearTo !== null) {
    if (yearTo < currentYear) {
      return 'historical'
    }
    if (yearFrom <= currentYear && currentYear <= yearTo) {
      return 'current'
    }
  }
  return 'unspecified'
}

function currentJstYear(): number {
  const year = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
  }).formatToParts(new Date()).find((part) => part.type === 'year')?.value
  return Number(year)
}
