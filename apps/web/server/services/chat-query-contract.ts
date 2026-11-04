import { normalizePlayerNameKey, type ChatStructuredQuery, type QueryContract } from '@npb/schemas'
import type { ChatDataRequirement } from './chat-query-plan'
import { normalizeTeamName } from './chat-query-normalizer'
import { subjectNameField } from './chat-contract-compiler'

/** Plan by requested data, independently of the legacy operation label. */
export function requirementsForContract(contract: QueryContract): ChatDataRequirement[] {
  const aggregate = contract.aggregation.length > 0
  const requirements = contract.requested_output.flatMap(({ kind }): ChatDataRequirement[] => {
    switch (kind) {
      case 'player_information': return ['player_profiles']
      case 'event_records': return [aggregate ? 'aggregate_events' : 'events']
      case 'game_results': return [aggregate ? 'aggregate_games' : 'games']
      case 'game_details': return ['game_details', 'events', 'batting_lines', 'pitching_lines']
      case 'batting_records': return ['batting_lines']
      case 'pitching_records': return ['pitching_lines']
      case 'batting_statistics': return ['aggregate_batting']
      case 'pitching_statistics': return ['aggregate_pitching']
      case 'affiliations': return ['player_affiliations']
      case 'roster': return ['roster_entries']
      case 'awards': return ['award_winners']
      case 'fielding_statistics': return [] // No executor yet; validation refuses this request.
    }
  })
  return [...new Set([...requirements, 'source_snapshots' as const])]
}

/** A compatibility executor must prove it preserves the independent request. */
export function validateQueryContractExecution(
  contract: QueryContract,
  query: ChatStructuredQuery,
  available: ChatDataRequirement[],
): string[] {
  const issues: string[] = []
  if (contract.completeness.mode === 'all' && contract.completeness.limit !== null) issues.push('contradictory_completeness')
  if (contract.unresolved_constraints.length > 0) issues.push('unresolved_constraints')
  if (contract.requested_output.some(({ kind }) => kind === 'fielding_statistics')) issues.push('unsupported_output')
  for (const requirement of requirementsForContract(contract)) {
    if (!available.includes(requirement)) issues.push(`missing_data:${requirement}`)
  }
  const filters = query.filters as Record<string, unknown>
  if (contract.grouping.length > 0 && (contract.grouping.length !== 1 || filters.group_by !== contract.grouping[0])) issues.push('grouping_not_preserved')
  if (contract.ordering.length > 0) {
    const [order] = contract.ordering
    const naturalEventOrder = query.intent === 'search_events' && ['gameDate', 'game_date', 'date'].includes(order?.field ?? '') && order?.direction === 'asc'
    if (contract.ordering.length !== 1 || (!naturalEventOrder && (filters.sort_by !== order?.field || order?.direction !== 'desc'))) issues.push('ordering_not_preserved')
  }
  // Non-standard reductions cannot be represented by the legacy aggregators.
  if (contract.aggregation.some(({ operation }) => !['count', 'sum', 'rate'].includes(operation))) issues.push('aggregation_not_supported')
  const time = contract.temporal_scope
  if (time.year_from !== null && time.year_to !== null && time.year_from > time.year_to) issues.push('invalid_year_range')
  if (time.date_from !== null && time.date_to !== null && time.date_from > time.date_to) issues.push('invalid_date_range')
  if (time.years.length === 1 && filters.year !== time.years[0]) issues.push('year_mismatch')
  if (time.years.length > 1) {
    const sorted = [...new Set(time.years)].sort((a, b) => a - b)
    const contiguous = sorted.every((year, index) => index === 0 || year === sorted[index - 1]! + 1)
    if (!contiguous || filters.year !== undefined || filters.year_from !== sorted[0] || filters.year_to !== sorted.at(-1)) issues.push('year_set_mismatch')
  }
  const executionYearFrom = filters.year ?? filters.year_from
  const executionYearTo = filters.year ?? filters.year_to
  if (time.year_from !== null && executionYearFrom !== time.year_from) issues.push('year_from_mismatch')
  if (time.year_to !== null && executionYearTo !== time.year_to) issues.push('year_to_mismatch')
  if (time.date_from !== null || time.date_to !== null) {
    if (time.date_from !== time.date_to || filters.game_date !== time.date_from) issues.push('date_scope_not_preserved')
  }
  if (contract.completeness.mode === 'top_n' || contract.completeness.mode === 'bounded') {
    if (contract.completeness.limit === null || filters.limit !== contract.completeness.limit) issues.push('limit_mismatch')
  }
  for (const entity of contract.entities) {
    if (entity.kind === 'team') {
      const field = entity.role === 'opponent' ? 'opponent' : 'team'
      if (normalizeTeamName(String(filters[field] ?? '')) !== normalizeTeamName(entity.mention)) issues.push(`entity_mismatch:${field}`)
    } else if (entity.kind === 'venue') {
      if (filters.venue !== entity.mention) issues.push('entity_mismatch:venue')
    } else {
      const eventOperation = query.intent === 'search_events' || query.intent === 'aggregate_events'
      const field = !eventOperation ? subjectNameField(query.intent)
        : entity.role === 'batter' ? 'batter_name'
        : entity.role === 'pitcher' ? 'pitcher_name'
          : entity.role === 'runner' ? 'runner_name' : 'player_name'
      const mention = compact(entity.mention)
      const pluralField = field === 'player_name' ? 'player_names' : field === 'pitcher_name' ? 'pitcher_names' : null
      const values = [filters[field], ...(pluralField && Array.isArray(filters[pluralField]) ? filters[pluralField] as unknown[] : [])]
      if (!values.some((value) => typeof value === 'string' && compact(value) === mention)) issues.push(`entity_mismatch:${field}`)
    }
  }
  for (const predicate of contract.predicates) {
    const field = predicate.operator === 'contains' && predicate.field === 'result_text'
      ? 'result_text_contains' : predicate.field
    if (!['eq', 'contains'].includes(predicate.operator) || filters[field] !== predicate.value) issues.push(`predicate_not_preserved:${predicate.field}`)
  }
  const scope = contract.competition_scope
  if (scope.level !== 'unspecified' && filters.level !== scope.level && !(scope.level === 'first' && query.intent === 'search_events')) issues.push('level_not_preserved')
  if (scope.competitions.length > 0 && (scope.competitions.length !== 1 || filters.competition !== scope.competitions[0])) issues.push('competition_not_preserved')
  return [...new Set(issues)]
}

function compact(value: string): string {
  return normalizePlayerNameKey(value)
}
