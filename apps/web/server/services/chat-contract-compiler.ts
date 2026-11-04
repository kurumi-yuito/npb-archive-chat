import { chatStructuredQuerySchema, type ChatStructuredQuery, type QueryContract } from '@npb/schemas'
import { normalizeTeamName } from './chat-query-normalizer'

export class QueryContractCompileError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Query contract cannot be executed: ${issues.join(', ')}`)
    this.name = 'QueryContractCompileError'
  }
}

export type ContractOperation = { output: QueryContract['requested_output'][number]; query: ChatStructuredQuery }

/** Identity lookup does not require an executable statistical/competition plan. */
export function identityFiltersForContract(contract: QueryContract) {
  const time = contract.temporal_scope
  const implicitSeason = contract.requested_output.some((output) => ['batting_statistics', 'pitching_statistics', 'fielding_statistics'].includes(output.kind))
    && time.years.length === 0 && time.year_from === null && time.year_to === null && time.date_from === null && time.date_to === null && time.relative === null
  const team = contract.entities.find((entity) => entity.kind === 'team' && entity.role === 'subject')?.mention
  return {
    ...(implicitSeason ? { year: Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date())) } : {}),
    ...(time.years.length === 1 ? { year: time.years[0] } : {}),
    ...(time.years.length > 1 ? { year_from: Math.min(...time.years), year_to: Math.max(...time.years) } : {}),
    ...(time.year_from !== null ? { year_from: time.year_from } : {}),
    ...(time.year_to !== null ? { year_to: time.year_to } : {}),
    ...(team ? { team: normalizeTeamName(team) } : {}),
  }
}

export function operationIntent(output: QueryContract['requested_output'][number], contract: QueryContract): ChatStructuredQuery['intent'] {
  switch (output.kind) {
    case 'player_information': return 'player_affiliation'
    case 'event_records': return contract.aggregation.length ? 'aggregate_events' : 'search_events'
    case 'game_results': return contract.aggregation.length ? 'aggregate_games' : 'search_games'
    case 'game_details': return 'game_detail'
    case 'batting_records': return 'search_batting'
    case 'pitching_records': return 'search_pitching'
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
  if (contract.unresolved_constraints.length) throw new QueryContractCompileError(['unresolved_constraints'])
  if (contract.temporal_scope.relative && contract.temporal_scope.relative !== 'career' && !contract.temporal_scope.years.length && contract.temporal_scope.year_from === null && contract.temporal_scope.date_from === null) {
    throw new QueryContractCompileError(['relative_time_not_resolved'])
  }
  const discreteYears = [...new Set(contract.temporal_scope.years)].sort((a, b) => a - b)
  if (discreteYears.some((year, index) => index > 0 && year !== discreteYears[index - 1]! + 1)) {
    return discreteYears.flatMap((year) => compileQueryContract({ ...contract, temporal_scope: { ...contract.temporal_scope, years: [year], year_from: null, year_to: null } }))
  }
  const operations = contract.requested_output.map((output) => {
    const intent = operationIntent(output, contract)
    const filters: Record<string, unknown> = { ...identityFiltersForContract(contract) }
    const issues: string[] = []
    const time = contract.temporal_scope
    if (time.years.length > 1) {
      const years = [...new Set(time.years)].sort((a, b) => a - b)
      if (years.some((year, index) => index > 0 && year !== years[index - 1]! + 1)) issues.push('discrete_year_plan_required')
      filters.year_from = years[0]
      filters.year_to = years.at(-1)
    }
    if (time.date_from !== null || time.date_to !== null) {
      if (time.date_from !== time.date_to) issues.push('date_range_plan_required')
      else filters.game_date = time.date_from
    }
    for (const entity of contract.entities) {
      const eventOperation = intent === 'search_events' || intent === 'aggregate_events'
      const field = entity.kind === 'team' ? (entity.role === 'opponent' ? 'opponent' : 'team')
        : entity.kind === 'venue' ? 'venue'
          : !eventOperation ? subjectNameField(intent)
            : entity.role === 'batter' ? 'batter_name'
            : entity.role === 'pitcher' ? 'pitcher_name'
              : entity.role === 'runner' ? 'runner_name' : subjectNameField(intent)
      const value = entity.kind === 'team' ? normalizeTeamName(entity.mention) : entity.mention
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
    if (contract.grouping.length === 1) filters.group_by = contract.grouping[0]
    else if (contract.grouping.length > 1) issues.push('multi_group_plan_required')
    if (contract.ordering.length === 1) {
      const order = contract.ordering[0]!
      const naturalEventOrder = intent === 'search_events' && ['gameDate', 'game_date', 'date'].includes(order.field) && order.direction === 'asc'
      if (!naturalEventOrder) {
        if (order.direction !== 'desc') issues.push('ordering_plan_required')
        filters.sort_by = order.field
      }
    } else if (contract.ordering.length > 1) issues.push('multi_order_plan_required')
    if (contract.completeness.mode === 'top_n' || contract.completeness.mode === 'bounded') {
      if (contract.completeness.limit === null) issues.push('missing_output_limit')
      else filters.limit = contract.completeness.limit
    }
    if (contract.competition_scope.level !== 'unspecified') filters.level = contract.competition_scope.level
    if (contract.competition_scope.competitions.length === 1) filters.competition = contract.competition_scope.competitions[0]
    else if (contract.competition_scope.competitions.length > 1) issues.push('multi_competition_plan_required')
    if (issues.length) throw new QueryContractCompileError(issues)
    const operationContract = { ...contract, requested_output: [output] }
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
