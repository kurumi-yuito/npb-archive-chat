import type { ChatResponseCore, ChatStructuredQuery, QueryContract } from '@npb/schemas'
import { statisticDomain, statisticMetric, statisticSortField } from './chat-statistic-metrics'

type Predicate = QueryContract['predicates'][number]

export function isPlayerExclusion(predicate: Predicate): boolean {
  return ['player', 'player_name', 'playerName', 'name'].includes(predicate.field) && predicate.operator === 'ne' &&
    typeof predicate.value === 'string' && predicate.value.trim().length > 0
}

export function isStatisticPredicate(intent: ChatStructuredQuery['intent'], predicate: Predicate): boolean {
  const domain = statisticDomain(intent)
  return domain !== null && (isPlayerExclusion(predicate) || (statisticMetric(domain, predicate.field) !== null &&
    ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'].includes(predicate.operator) &&
    typeof predicate.value === 'number' && Number.isFinite(predicate.value)))
}

/** Preserve a qualified leading window, or filter a complete official candidate set. */
export function filterStatisticRows(query: ChatStructuredQuery, predicates: Predicate[], rows: ChatResponseCore['results']['aggregates'], excludedPlayers: Map<string, string> = new Map(), completePopulation = false) {
  if (!predicates.length) return rows
  const domain = statisticDomain(query.intent)
  const filters = query.filters as Record<string, unknown>
  if (!domain) throw new Error('invalid_statistic_predicate_domain')
  const matches = (row: ChatResponseCore['results']['aggregates'][number]) => predicates.every((predicate) => {
    if (isPlayerExclusion(predicate)) {
      const excludedId = excludedPlayers.get(String(predicate.value))
      if (!excludedId || typeof row.stats.playerId !== 'string') throw new Error('statistic_exclusion_identity_unverified')
      return row.stats.playerId !== excludedId
    }
    const metric = statisticMetric(domain, predicate.field)
    if (!metric || !isStatisticPredicate(query.intent, predicate)) throw new Error('invalid_statistic_predicate')
    const value = row.stats[metric.field]
    if (value === null) return false
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('statistic_predicate_value_unverified')
    const expected = predicate.value as number
    switch (predicate.operator) {
      case 'eq': return value === expected
      case 'ne': return value !== expected
      case 'gt': return value > expected
      case 'gte': return value >= expected
      case 'lt': return value < expected
      case 'lte': return value <= expected
      default: throw new Error('invalid_statistic_predicate_operator')
    }
  })
  const contract = query.query_contract
  const count = contract?.completeness.mode === 'top_n' ? contract.completeness.limit : null
  const order = contract?.ordering
  // Filtering cannot displace a leading window when every row in that
  // window qualifies and the requested ordering is the query ordering.
  if (query.intent === 'aggregate_batting' && count && rows.length >= count && order?.length === 1 &&
    order[0]!.direction === 'desc' && filters.sort_by === statisticSortField(query.intent, order[0]!.field) &&
    rows.slice(0, count).every(matches)) return rows.slice(0, count)
  if (typeof filters.year !== 'number' || filters.date_from || filters.date_to || filters.game_date ||
    (rows.length >= 100 && !completePopulation) || rows.some((row) => row.stats.evidenceStatus !== 'official_complete_scope')) {
    throw new Error('statistic_predicate_completeness_unverified')
  }
  const selected = rows.filter(matches)
  return count ? selected.slice(0, count) : selected
}
