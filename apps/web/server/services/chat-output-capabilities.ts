import type { QueryContract } from '@npb/schemas'

const statisticIdentityFields = new Set(['name', 'player_name', 'playerName', 'player_id', 'playerId', 'team', 'team_name', 'teamName', 'sourceUrl', 'source_url'])

/** A statistic row already identifies its player; basic identity columns need no second name lookup. */
export function isStatisticIdentityProjection(contract: QueryContract, output: QueryContract['requested_output'][number]): boolean {
  const identifiesRankedPlayer = output.fields.length === 0 && contract.completeness.mode === 'top_n' &&
    !contract.entities.some((entity) => entity.kind === 'player')
  return output.kind === 'player_information' && (identifiesRankedPlayer || (output.fields.length > 0 && output.fields.every((field) => statisticIdentityFields.has(field)))) &&
    contract.requested_output.some((candidate) => ['batting_statistics', 'pitching_statistics'].includes(candidate.kind))
}
