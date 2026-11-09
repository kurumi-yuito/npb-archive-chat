import type { PlayerAffiliationFilters } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import { officialRegistrationScopeSql } from './official-registration-scope'
import { matchesGameTeamFilter } from './team-name-utils'

export type RegistrationInformationRow = { playerId: string; playerName: string; year: number; team: string; position: string | null; uniformNumber: string | null; sourceUrl: string; fetchedAt: string }

/** Historical registration is proof of some membership in that year, not a
 * fabricated game date or an assertion of a continuing contract. */
export async function searchRegistrationInformation(database: QueryDatabase, filters: Partial<PlayerAffiliationFilters>): Promise<RegistrationInformationRow[]> {
  if (!filters.player_id) return []
  const clauses = ['roster.player_id=?', officialRegistrationScopeSql()], values: Array<string | number> = [filters.player_id]
  for (const [field, operator] of [['year', '='], ['year_from', '>='], ['year_to', '<=']] as const) {
    if (filters[field]) { clauses.push(`roster.year ${operator} ?`); values.push(filters[field]!) }
  }
  const rows = await database.prepare(`SELECT roster.player_id playerId,roster.player_name playerName,roster.year,roster.team_name team,
    roster.position,roster.uniform_number uniformNumber,roster.source_url sourceUrl,roster.loaded_at fetchedAt
    FROM current_team_roster roster WHERE ${clauses.join(' AND ')} ORDER BY roster.year DESC,roster.team_id,roster.player_key`).all(...values) as RegistrationInformationRow[]
  return rows.filter((row) => !filters.team || matchesGameTeamFilter(row.team, filters.team))
}
