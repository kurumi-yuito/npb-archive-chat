import type { ChatStructuredQuery } from '@npb/schemas'
import type { IdentityResolutionScope } from './player-identity'

type InferIdentityResolutionScopeInput = {
  message: string
  structuredQuery: ChatStructuredQuery
  currentYear?: number
}

export function inferIdentityResolutionScope({
  message,
  structuredQuery,
  currentYear = currentJstYear(),
}: InferIdentityResolutionScopeInput): IdentityResolutionScope {
  if (hasHistoricalContext(message) || hasPastYearFilter(structuredQuery, currentYear)) {
    return 'historical'
  }
  if (hasCurrentContext(message) || hasCurrentYearFilter(structuredQuery, currentYear)) {
    return 'current'
  }
  return 'unspecified'
}

function hasHistoricalContext(message: string): boolean {
  return /時代|在籍時|在籍中|所属時|所属していた|いた頃|移籍前|移籍後|退団前|退団後|昨シーズン|去年|前年/u.test(message)
}

function hasCurrentContext(message: string): boolean {
  return /今シーズン|今季|今期|今年|現在|今どこ|どこの球団|最近|直近|最新|ここまで/u.test(message)
}

function hasPastYearFilter(structuredQuery: ChatStructuredQuery, currentYear: number): boolean {
  const filters = structuredQuery.filters as Record<string, unknown>
  const year = typeof filters.year === 'number' ? filters.year : null
  const yearTo = typeof filters.year_to === 'number' ? filters.year_to : null
  if (year !== null) {
    return year < currentYear
  }
  return yearTo !== null && yearTo < currentYear
}

function hasCurrentYearFilter(structuredQuery: ChatStructuredQuery, currentYear: number): boolean {
  const filters = structuredQuery.filters as Record<string, unknown>
  const year = typeof filters.year === 'number' ? filters.year : null
  const yearFrom = typeof filters.year_from === 'number' ? filters.year_from : null
  const yearTo = typeof filters.year_to === 'number' ? filters.year_to : null
  if (year !== null) {
    return year === currentYear
  }
  return yearFrom !== null && yearTo !== null && yearFrom <= currentYear && currentYear <= yearTo
}

function currentJstYear(): number {
  const year = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
  }).formatToParts(new Date()).find((part) => part.type === 'year')?.value
  return Number(year)
}
