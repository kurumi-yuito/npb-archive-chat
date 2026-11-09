import type { QueryContract } from '@npb/schemas'

const statisticIdentityFields = new Set(['name', 'player_name', 'playerName', 'player_id', 'playerId', 'team', 'team_name', 'teamName', 'sourceUrl', 'source_url'])

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
