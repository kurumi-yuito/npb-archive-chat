import { normalizePlayerNameKey, type ChatStructuredQuery, type QueryContract } from '@npb/schemas'
import type { ChatDataRequirement } from './chat-query-plan'
import { normalizePosition, normalizeResultTextContains } from './chat-query-normalizer'
import { subjectNameField, contractGroupingField, contractPredicateField, contractPredicateValue, appearancePredicateFilter, statisticOrderDirection } from './chat-contract-compiler'
import { isStatisticPredicate } from './chat-statistic-predicates'
import { statisticSortField } from './chat-statistic-metrics'
import { isStatisticIdentityProjection, projectsEventPlayers, requiresGameReduction, usesFirstTeamGameRepository } from './chat-output-capabilities'
import { competitionLeague, isRegularSeasonScope } from './chat-competition-scope'
import { matchesGameTeamFilter } from '@npb/db'
import { resolveContractTeamMention } from './chat-team-resolution'

/** Plan by requested data, independently of the legacy operation label. */
export function requirementsForContract(contract: QueryContract): ChatDataRequirement[] {
  const aggregate = contract.aggregation.length > 0
  const requirements = contract.requested_output.flatMap((output): ChatDataRequirement[] => {
    switch (output.kind) {
      case 'player_information': return isStatisticIdentityProjection(contract, output) ? [] : ['player_profiles']
      case 'player_statistics': return ['player_profiles']
      case 'unresolved_request': return []
      case 'event_records': return [aggregate ? 'aggregate_events' : 'events']
      case 'game_results': return [requiresGameReduction(contract, output) ? 'aggregate_games' : 'games']
      case 'series_result': return ['official_series_results']
      case 'game_schedule': return [] // Capability response, never a past-results repository query.
      case 'staff_information': return [] // Staff records must not enter the player repository.
      case 'causal_explanation': return [] // Recorded correlations cannot establish causes.
      case 'team_statistics': return [contract.entities.some((entity) => entity.kind === 'venue') ? 'aggregate_games' : 'official_team_statistics']
      case 'game_details': return ['game_details', 'events', 'batting_lines', 'pitching_lines']
      case 'batting_records': return [contract.aggregation.some((item) => item.operation === 'count' && item.field === 'games') ? 'aggregate_batting' : 'batting_lines']
      case 'pitching_records': return contract.aggregation.some((item) => item.operation === 'count' && item.field === 'games') ? ['aggregate_pitching']
        : output.fields.includes('opponentStarter') ? ['pitching_lines', 'game_details', 'events'] : ['pitching_lines']
      case 'appearance_records': return ['player_profiles'] // Position evidence selects the concrete record plan after identity resolution.
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
  statisticPredicates: QueryContract['predicates'] = [],
): string[] {
  const issues: string[] = []
  const grouping = contract.grouping.map(contractGroupingField)
  if (contract.completeness.mode === 'all' && contract.completeness.limit !== null) issues.push('contradictory_completeness')
  if (contract.unresolved_constraints.length > 0) issues.push('unresolved_constraints')
  if (contract.requested_output.some(({ kind }) => kind === 'fielding_statistics')) issues.push('unsupported_output')
  if (contract.requested_output.some(({ kind }) => kind === 'game_schedule')) issues.push('schedule_not_in_archive')
  if (contract.requested_output.some(({ kind }) => kind === 'staff_information')) issues.push('staff_not_in_archive')
  if (contract.requested_output.some(({ kind }) => kind === 'causal_explanation')) issues.push('causality_not_in_archive')
  for (const requirement of requirementsForContract(contract)) {
    if (!available.includes(requirement)) issues.push(`missing_data:${requirement}`)
  }
  const filters = query.filters as Record<string, unknown>
  const partitionedAppearances = ['recent_appearances', 'latest_appearance'].includes(contract.temporal_scope.relative ?? '') &&
    ['search_batting', 'search_pitching'].includes(query.intent) && filters.recent === true &&
    contract.entities.filter((entity) => entity.kind === 'player').length === 1 && grouping.length === 1 && grouping[0] === 'player'
  const projectedTeamSeasons = filters.official_season === true && filters.group_by === 'year' && grouping.length === 2 &&
    new Set(grouping).size === 2 && grouping.includes('team') && grouping.includes('year')
  if (grouping.length > 0 && !partitionedAppearances && !projectedTeamSeasons && !projectsEventPlayers(contract) && (grouping.length !== 1 || filters.group_by !== grouping[0])) issues.push('grouping_not_preserved')
  if (contract.ordering.length > 0) {
    const [order] = contract.ordering
    const naturalEventOrder = query.intent === 'search_events' && ['gameDate', 'game_date', 'date'].includes(order?.field ?? '') && order?.direction === 'asc'
    const naturalAppearanceOrder = (filters.recent === true || (query.intent === 'aggregate_games' && typeof filters.recent_games === 'number')) && ['gameDate', 'game_date', 'date'].includes(order?.field ?? '') && order?.direction === 'desc'
    const officialTeamOrder = query.intent === 'aggregate_games' && filters.official_season === true && filters.sort_by === statisticSortField(query.intent, order?.field ?? '') && filters.sort_direction === order?.direction
    const officialSeriesOrder = query.intent === 'aggregate_games' && filters.official_series_result === true && order?.field === 'year' && filters.series_order === order.direction
    const naturalAnnualOrder = query.intent === 'aggregate_batting' && filters.group_by === 'year' && order?.field === 'year' && order?.direction === 'asc'
    const naturalGameDetailOrder = query.intent === 'game_detail' && ['gameDate', 'game_date', 'date'].includes(order?.field ?? '') && order?.direction === 'desc'
    if (contract.ordering.length !== 1 || (!naturalEventOrder && !naturalAppearanceOrder && !officialTeamOrder && !officialSeriesOrder && !naturalAnnualOrder && !naturalGameDetailOrder && (filters.sort_by !== statisticSortField(query.intent, order?.field ?? '') || order?.direction !== statisticOrderDirection(query.intent, order?.field ?? '')))) issues.push('ordering_not_preserved')
  }
  if (['recent_appearances', 'latest_appearance'].includes(contract.temporal_scope.relative ?? '')) {
    const limit = contract.completeness.limit ?? (contract.temporal_scope.relative === 'latest_appearance' ? 1 : 5)
    const gameWindow = query.intent === 'aggregate_games' && filters.recent_games === limit && contract.requested_output.every(({ kind }) => kind === 'game_results')
    if (!gameWindow && (!['search_batting', 'search_pitching'].includes(query.intent) || filters.recent !== true || filters.limit !== limit)) issues.push('appearance_scope_not_preserved')
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
    if (time.date_from === time.date_to) {
      if (filters.game_date !== time.date_from) issues.push('date_scope_not_preserved')
    } else if ((time.date_from !== null && filters.date_from !== time.date_from) ||
      (time.date_to !== null && filters.date_to !== time.date_to)) issues.push('date_scope_not_preserved')
  }
  if (!statisticPredicates.length && (contract.completeness.mode === 'top_n' || contract.completeness.mode === 'bounded')) {
    if (contract.completeness.limit === null || (filters.recent_games ?? filters.limit) !== contract.completeness.limit) issues.push('limit_mismatch')
  }
  for (const entity of contract.entities) {
    if (entity.kind === 'team') {
      const eventOperation = query.intent === 'search_events' || query.intent === 'aggregate_events'
      const field = entity.role === 'opponent' || (eventOperation && entity.role === 'pitcher') ? 'opponent' : 'team'
      const league = field === 'team' ? competitionLeague(entity.mention) : null
      const membership = league && (['aggregate_batting', 'aggregate_pitching'].includes(query.intent) || filters.official_season === true) &&
        typeof filters.team === 'string' && matchesGameTeamFilter(filters.team, league) && (filters.level === 'first' || filters.official_season === true)
      if (!membership && resolveContractTeamMention(String(filters[field] ?? '')) !== resolveContractTeamMention(entity.mention)) issues.push(`entity_mismatch:${field}`)
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
  if (statisticPredicates.some((predicate) => !isStatisticPredicate(query.intent, predicate) || !contract.predicates.some((original) => JSON.stringify(original) === JSON.stringify(predicate))) ||
    (statisticPredicates.length && filters.limit !== 100)) issues.push('invalid_statistic_predicate_plan')
  for (const predicate of contract.predicates) {
    const appearancePredicate = appearancePredicateFilter(contract, predicate)
    if (appearancePredicate) {
      if (filters[appearancePredicate.field] !== appearancePredicate.value) issues.push(`predicate_not_preserved:${predicate.field}`)
      continue
    }
    if (statisticPredicates.some((planned) => JSON.stringify(planned) === JSON.stringify(predicate))) continue
    const field = contractPredicateField(predicate)
    const value = contractPredicateValue(predicate)
    const expected = typeof value !== 'string' ? value
      : field === 'result_text_contains' ? normalizeResultTextContains(value)
        : field === 'position' ? normalizePosition(value) : value
    if (!['eq', 'contains'].includes(predicate.operator) || filters[field] !== expected) issues.push(`predicate_not_preserved:${predicate.field}`)
  }
  const scope = contract.competition_scope
  const combinedAppearanceLevels = scope.level === 'both' && filters.level === undefined && filters.recent === true &&
    ['recent_appearances', 'latest_appearance'].includes(contract.temporal_scope.relative ?? '') && ['search_batting', 'search_pitching'].includes(query.intent)
  if (scope.level !== 'unspecified' && filters.level !== scope.level && !combinedAppearanceLevels && !(scope.level === 'first' && (query.intent === 'search_events' || usesFirstTeamGameRepository(query.intent, filters)))) issues.push('level_not_preserved')
  if (scope.competitions.length > 0) {
    const league = scope.competitions.length === 1 ? competitionLeague(scope.competitions[0]!) : null
    const mapped = league && (['aggregate_batting', 'aggregate_pitching'].includes(query.intent) || (query.intent === 'aggregate_games' && filters.official_season === true)) &&
      typeof filters.team === 'string' && (filters.team === league || matchesGameTeamFilter(filters.team, league)) && (filters.level === 'first' || filters.official_season === true)
    const regularTeamSeason = filters.official_season === true && scope.competitions.length === 1 && isRegularSeasonScope(scope.competitions[0]!)
    if (!mapped && !regularTeamSeason && (scope.competitions.length !== 1 || filters.competition !== scope.competitions[0])) issues.push('competition_not_preserved')
  }
  return [...new Set(issues)]
}

function compact(value: string): string {
  return normalizePlayerNameKey(value)
}
