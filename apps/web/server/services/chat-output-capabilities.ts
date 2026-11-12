import type { QueryContract } from '@npb/schemas'

/** These repositories exclude farm game IDs by default. Explicit inclusion
 * must never be mistaken for that first-team guarantee. */
export function usesFirstTeamGameRepository(intent: string, filters: Record<string, unknown>): boolean {
  return ['search_games', 'game_detail', 'aggregate_games'].includes(intent) && filters.include_farm !== true
}

const statisticIdentityFields = new Set(['name', 'player_name', 'playerName', 'player_id', 'playerId', 'team', 'team_name', 'teamName', 'sourceUrl', 'source_url'])

export function isUnavailableScoringPositionAverage(field: string): boolean {
  return ['battingAverageWithRunnersInScoringPosition', 'rispBattingAverage', 'risp_average', '得点圏打率'].includes(field)
}

export function isDirectMatchupPredicate(predicate: QueryContract['predicates'][number]): boolean {
  return predicate.field === 'relationship' && predicate.operator === 'eq' && predicate.value === 'direct_matchup'
}

export function isUnverifiedForeignRegistration(predicate: QueryContract['predicates'][number]): boolean {
  return predicate.field === 'player_category' && predicate.operator === 'eq' && ['外国人', 'foreign'].includes(String(predicate.value))
}

export function projectsEventPlayers(contract: QueryContract): boolean {
  return contract.requested_output.every((output) => output.kind === 'event_records') && contract.aggregation.length === 0 &&
    ['all', 'unspecified'].includes(contract.completeness.mode) && contract.grouping.length === 1 && ['player', 'player_name', 'playerName', 'player_id', 'playerId'].includes(contract.grouping[0]!)
}

/** Requested arithmetic outputs require a reduction even when an extractor
 * omits a redundant aggregation declaration. Individual scores cannot satisfy
 * requested win/loss/draw fields. */
export function requiresGameReduction(contract: QueryContract, output: QueryContract['requested_output'][number]): boolean {
  return output.kind === 'game_results' && (contract.aggregation.length > 0 ||
    output.fields.some((field) => ['wins', 'losses', 'draws', 'win_rate', 'winRate', 'games', 'count'].includes(field)))
}

/** A statistic row already identifies its player; basic identity columns need no second name lookup. */
export function isStatisticIdentityProjection(contract: QueryContract, output: QueryContract['requested_output'][number]): boolean {
  const identifiesRankedPlayer = output.fields.length === 0 && contract.completeness.mode === 'top_n' &&
    !contract.entities.some((entity) => entity.kind === 'player')
  return output.kind === 'player_information' && (identifiesRankedPlayer || (output.fields.length > 0 && output.fields.every((field) => statisticIdentityFields.has(field)))) &&
    contract.requested_output.some((candidate) => ['batting_statistics', 'pitching_statistics'].includes(candidate.kind))
}
