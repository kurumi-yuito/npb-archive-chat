import { chatStructuredQuerySchema, type ChatStructuredQuery, type QueryContract } from '@npb/schemas'
import { resolveContractTeamMention } from './chat-team-resolution'
import { statisticSortField } from './chat-statistic-metrics'
import { isStatisticIdentityProjection, requiresGameReduction } from './chat-output-capabilities'
import { competitionLeague, isRegularSeasonScope } from './chat-competition-scope'
import { matchesGameTeamFilter } from '@npb/db'

export class QueryContractCompileError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Query contract cannot be executed: ${issues.join(', ')}`)
    this.name = 'QueryContractCompileError'
  }
}

export type ContractOperation = { output: QueryContract['requested_output'][number]; query: ChatStructuredQuery }

/** A scoped output is a complete semantic scope, never a bag of physical SQL
 * filters. Global unresolved conditions cannot disappear in a subquery. */
export function contractForOutput(contract: QueryContract, output: QueryContract['requested_output'][number]): QueryContract {
  const { scope, ...projection } = output
  return { ...contract, ...scope, requested_output: [projection],
    unresolved_constraints: [...new Set([...contract.unresolved_constraints, ...(scope?.unresolved_constraints ?? [])])] }
}

/** Identity lookup does not require an executable statistical/competition plan. */
export function identityFiltersForContract(contract: QueryContract) {
  const time = contract.temporal_scope
  const implicitSeason = contract.requested_output.some((output) => ['series_result', 'team_statistics', 'batting_statistics', 'pitching_statistics', 'fielding_statistics'].includes(output.kind))
    && time.years.length === 0 && time.year_from === null && time.year_to === null && time.date_from === null && time.date_to === null && time.relative === null
  const relativeSeason = ['current_season', 'previous_season'].includes(time.relative ?? '') &&
    time.years.length === 0 && time.year_from === null && time.year_to === null && time.date_from === null && time.date_to === null
  const team = contract.entities.find((entity) => entity.kind === 'team' && entity.role === 'subject')?.mention
  return {
    ...(implicitSeason ? { year: Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date())) } : {}),
    ...(relativeSeason ? { year: Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date())) - (time.relative === 'previous_season' ? 1 : 0) } : {}),
    ...(time.years.length === 1 ? { year: time.years[0] } : {}),
    ...(time.years.length > 1 ? { year_from: Math.min(...time.years), year_to: Math.max(...time.years) } : {}),
    ...(time.year_from !== null ? { year_from: time.year_from } : {}),
    ...(time.year_to !== null ? { year_to: time.year_to } : {}),
    ...(!time.years.length && time.year_from === null && time.date_from !== null ? { year_from: Number(time.date_from.slice(0, 4)) } : {}),
    ...(!time.years.length && time.year_to === null && time.date_to !== null ? { year_to: Number(time.date_to.slice(0, 4)) } : {}),
    ...(team ? { team: resolveContractTeamMention(team) } : {}),
  }
}

export function operationIntent(output: QueryContract['requested_output'][number], contract: QueryContract): ChatStructuredQuery['intent'] {
  switch (output.kind) {
    case 'player_information': return 'player_affiliation'
    case 'event_records': return contract.aggregation.length ? 'aggregate_events' : 'search_events'
    case 'game_results': return requiresGameReduction(contract, output) ? 'aggregate_games' : 'search_games'
    case 'series_result': return 'aggregate_games'
    case 'game_schedule': throw new QueryContractCompileError(['schedule_not_in_archive'])
    case 'staff_information': throw new QueryContractCompileError(['staff_not_in_archive'])
    case 'game_details': return 'game_detail'
    case 'team_statistics': return 'aggregate_games'
    case 'batting_records': return 'search_batting'
    case 'pitching_records': return 'search_pitching'
    case 'appearance_records': throw new QueryContractCompileError(['appearance_domain_resolution_required'])
    case 'batting_statistics': return 'aggregate_batting'
    case 'pitching_statistics': return 'aggregate_pitching'
    case 'affiliations': return 'player_affiliation'
    case 'roster': return 'search_roster'
    case 'awards': return 'award_winners'
    case 'fielding_statistics': throw new QueryContractCompileError(['fielding_executor_required'])
  }
}

export function subjectNameField(intent: ChatStructuredQuery['intent']): string {
  return intent === 'search_pitching' || intent === 'aggregate_pitching' ? 'pitcher_name' : 'player_name'
}

/** The semantic contract is the only input. No natural-language keyword routing. */
export function compileQueryContract(contract: QueryContract): ContractOperation[] {
  if (contract.requested_output.some((output) => output.scope)) return contract.requested_output.flatMap((output) => compileQueryContract(contractForOutput(contract, output)))
  if (contract.unresolved_constraints.length) throw new QueryContractCompileError(['unresolved_constraints'])
  const appearanceRelative = ['recent_appearances', 'latest_appearance'].includes(contract.temporal_scope.relative ?? '')
  const subjectPlayers = contract.entities.filter((entity) => entity.kind === 'player')
  if (appearanceRelative && subjectPlayers.length > 1) {
    return subjectPlayers.flatMap((player) => compileQueryContract({ ...contract,
      entities: contract.entities.filter((entity) => entity.kind !== 'player' || entity === player) }))
  }
  const subjectTeams = contract.entities.filter((entity) => entity.kind === 'team' && entity.role === 'subject')
  if (subjectTeams.length > 1 && contract.requested_output.every((output) => ['batting_statistics', 'team_statistics'].includes(output.kind)) &&
    !contract.entities.some((entity) => entity.kind === 'player')) {
    const officialTeamSeasons = contract.requested_output.every((output) => output.kind === 'team_statistics')
    const validGrouping = officialTeamSeasons ? contract.grouping.length <= 2 && new Set(contract.grouping).size === contract.grouping.length && contract.grouping.every((field) => ['team', 'year'].includes(field))
      : contract.grouping.length === 0 || (contract.grouping.length === 1 && contract.grouping[0] === 'team')
    if (!validGrouping) throw new QueryContractCompileError(['conflicting_team_comparison_grouping'])
    return subjectTeams.flatMap((team) => compileQueryContract({ ...contract,
      entities: contract.entities.filter((entity) => !subjectTeams.includes(entity) || entity === team), grouping: officialTeamSeasons && contract.grouping.includes('year') ? ['year'] : ['team'] }))
  }
  if (contract.temporal_scope.relative && !appearanceRelative && !['career', 'current_season', 'previous_season'].includes(contract.temporal_scope.relative) && !contract.temporal_scope.years.length && contract.temporal_scope.year_from === null && contract.temporal_scope.date_from === null) {
    throw new QueryContractCompileError(['relative_time_not_resolved'])
  }
  const discreteYears = [...new Set(contract.temporal_scope.years)].sort((a, b) => a - b)
  if (discreteYears.some((year, index) => index > 0 && year !== discreteYears[index - 1]! + 1)) {
    return discreteYears.flatMap((year) => compileQueryContract({ ...contract, temporal_scope: { ...contract.temporal_scope, years: [year], year_from: null, year_to: null } }))
  }
  const projections = contract.requested_output.filter((output) => isStatisticIdentityProjection(contract, output))
  const operations = contract.requested_output.filter((output) => !isStatisticIdentityProjection(contract, output)).map((output) => {
    const intent = operationIntent(output, contract)
    const filters: Record<string, unknown> = { ...identityFiltersForContract(contract) }
    const issues: string[] = []
    if (output.kind === 'series_result') {
      filters.official_series_result = true
      if (contract.entities.length || contract.predicates.length || contract.aggregation.length ||
        contract.temporal_scope.date_from !== null || contract.temporal_scope.date_to !== null ||
        contract.competition_scope.competitions.length !== 1 || ['farm', 'both'].includes(contract.competition_scope.level) ||
        contract.grouping.some((field) => field !== 'year') || contract.grouping.length > 1 ||
        output.fields.some((field) => !['year', 'winner', 'winnerName', 'loser', 'loserName', 'wins', 'losses', 'draws', 'winnerWins', 'loserWins', 'competition', 'sourceUrl'].includes(field))) issues.push('official_series_scope_required')
    }
    if (output.kind === 'pitching_statistics' && !contract.entities.some((entity) => entity.kind === 'player') &&
      subjectTeams.length && !contract.grouping.includes('player')) issues.push('pitching_statistic_subject_required')
    if (output.kind === 'team_statistics') {
      filters.official_season = true
      if (contract.entities.some((entity) => entity.kind !== 'team' || entity.role === 'opponent') || contract.predicates.length ||
        contract.temporal_scope.date_from !== null || contract.temporal_scope.date_to !== null ||
        contract.competition_scope.level === 'farm' || contract.competition_scope.level === 'both') issues.push('official_team_season_scope_required')
    }
    if (appearanceRelative) {
      if (!['search_batting', 'search_pitching'].includes(intent)) issues.push('appearance_records_required')
      if (subjectPlayers.length !== 1) issues.push('appearance_player_required')
      if (contract.completeness.mode === 'all') issues.push('contradictory_appearance_completeness')
      if (contract.temporal_scope.relative === 'latest_appearance' && contract.completeness.limit !== null && contract.completeness.limit !== 1) issues.push('contradictory_latest_appearance_limit')
      filters.recent = true
      filters.limit = contract.completeness.limit ?? (contract.temporal_scope.relative === 'latest_appearance' ? 1 : 5)
    }
    const time = contract.temporal_scope
    if (time.years.length > 1) {
      const years = [...new Set(time.years)].sort((a, b) => a - b)
      if (years.some((year, index) => index > 0 && year !== years[index - 1]! + 1)) issues.push('discrete_year_plan_required')
      filters.year_from = years[0]
      filters.year_to = years.at(-1)
    }
    if (time.date_from !== null || time.date_to !== null) {
      if (time.date_from !== time.date_to) {
        if (time.date_from !== null) filters.date_from = time.date_from
        if (time.date_to !== null) filters.date_to = time.date_to
      } else filters.game_date = time.date_from
    }
    for (const entity of contract.entities) {
      const eventOperation = intent === 'search_events' || intent === 'aggregate_events'
      const field = entity.kind === 'team' ? (entity.role === 'opponent' ? 'opponent' : 'team')
        : entity.kind === 'venue' ? 'venue'
          : !eventOperation ? subjectNameField(intent)
            : entity.role === 'batter' ? 'batter_name'
            : entity.role === 'pitcher' ? 'pitcher_name'
              : entity.role === 'runner' ? 'runner_name' : subjectNameField(intent)
      const value = entity.kind === 'team' ? resolveContractTeamMention(entity.mention) : entity.mention
      const pluralField = field === 'player_name' ? 'player_names' : field === 'pitcher_name' ? 'pitcher_names' : null
      if (pluralField && Array.isArray(filters[pluralField])) {
        filters[pluralField] = [...new Set([...(filters[pluralField] as string[]), String(value)])]
        continue
      }
      if (filters[field] !== undefined && filters[field] !== value) {
        if (entity.kind === 'player' && field === 'player_name') {
          filters.player_names = [...new Set([...(filters.player_names as string[] ?? [String(filters[field])]), String(value)])]
          delete filters.player_name
        } else if (entity.kind === 'player' && field === 'pitcher_name') {
          filters.pitcher_names = [...new Set([...(filters.pitcher_names as string[] ?? [String(filters[field])]), String(value)])]
          delete filters.pitcher_name
        } else issues.push(`multi_entity_plan_required:${field}`)
      } else filters[field] = value
    }
    for (const predicate of contract.predicates) {
      const field = predicate.field === 'result_text' && predicate.operator === 'contains' ? 'result_text_contains' : predicate.field
      if (!['eq', 'contains'].includes(predicate.operator) || Array.isArray(predicate.value)) {
        issues.push(`predicate_plan_required:${predicate.field}:${predicate.operator}`)
      } else if (filters[field] !== undefined && filters[field] !== predicate.value) {
        issues.push(`contradictory_predicate:${field}`)
      } else filters[field] = predicate.value
    }
    if (output.kind === 'team_statistics' && contract.grouping.length === 2 && new Set(contract.grouping).size === 2 && contract.grouping.includes('team') && contract.grouping.includes('year')) {
      // The official source already contains one row per club and season.
      // Keep both dimensions as a projection rather than reducing either away.
      filters.group_by = 'year'
    } else if (contract.grouping.length === 1 && appearanceRelative && contract.grouping[0] === 'player') {
      // Each player has a separate bounded operation, so no SQL grouping may
      // collapse the appearance lines before the per-player window is applied.
    } else if (contract.grouping.length === 1) filters.group_by = contract.grouping[0]
    else if (contract.grouping.length > 1) issues.push('multi_group_plan_required')
    if (contract.ordering.length === 1) {
      const order = contract.ordering[0]!
      const naturalSeriesOrder = output.kind === 'series_result' && order.field === 'year'
      if (naturalSeriesOrder) filters.series_order = order.direction
      const naturalEventOrder = intent === 'search_events' && ['gameDate', 'game_date', 'date'].includes(order.field) && order.direction === 'asc'
      const naturalAppearanceOrder = appearanceRelative && ['gameDate', 'game_date', 'date'].includes(order.field) && order.direction === 'desc'
      if (!naturalEventOrder && !naturalAppearanceOrder && !naturalSeriesOrder) {
        if (order.direction !== 'desc' && output.kind !== 'team_statistics') issues.push('ordering_plan_required')
        filters.sort_by = statisticSortField(intent, order.field)
        if (output.kind === 'team_statistics') filters.sort_direction = order.direction
      }
    } else if (contract.ordering.length > 1) issues.push('multi_order_plan_required')
    if (contract.completeness.mode === 'top_n' || contract.completeness.mode === 'bounded') {
      if (contract.completeness.limit === null) issues.push('missing_output_limit')
      else filters.limit = contract.completeness.limit
    }
    if (contract.competition_scope.level !== 'unspecified' && !(['team_statistics', 'series_result'].includes(output.kind) && contract.competition_scope.level === 'first')) filters.level = contract.competition_scope.level
    if (contract.competition_scope.competitions.length === 1) {
      const competition = contract.competition_scope.competitions[0]!, league = competitionLeague(competition)
      if (league && (['aggregate_batting', 'aggregate_pitching'].includes(intent) || output.kind === 'team_statistics')) {
        if (filters.team && filters.team !== league && !matchesGameTeamFilter(String(filters.team), league)) issues.push('contradictory_league_team')
        else if (!filters.team) filters.team = league
        if (filters.level === 'farm') issues.push('contradictory_league_level')
        else if (output.kind !== 'team_statistics') filters.level = 'first'
      } else if (!(output.kind === 'team_statistics' && isRegularSeasonScope(competition))) filters.competition = competition
    }
    else if (contract.competition_scope.competitions.length > 1) issues.push('multi_competition_plan_required')
    if (issues.length) throw new QueryContractCompileError(issues)
    const operationContract = { ...contract, requested_output: [output, ...(['batting_statistics', 'pitching_statistics'].includes(output.kind) ? projections : [])] }
    const parsed = chatStructuredQuerySchema.safeParse({ intent, filters, query_contract: operationContract })
    if (!parsed.success) throw new QueryContractCompileError(parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.code}`))
    // Zod's compatibility schemas strip unknown fields. A planner may not drop constraints this way.
    for (const field of Object.keys(filters)) {
      if (!(field in parsed.data.filters)) issues.push(`unrepresented_constraint:${field}`)
    }
    if (issues.length) throw new QueryContractCompileError(issues)
    return { output, query: parsed.data }
  })
  return operations
}
