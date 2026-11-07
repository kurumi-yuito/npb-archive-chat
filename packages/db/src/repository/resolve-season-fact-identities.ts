import { normalizePlayerNameKey } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import { matchesGameTeamFilter } from './team-name-utils'
import { normalizedIdentitySql } from './player-identity-link'

type Scope = { player_name_id: number; team_id: number; year: number; name: string; team: string }
type Profile = { player_id: string; name: string; rows_json: string }
type Alias = { player_id: string; alias: string; season_from: number; season_to: number }

/** Batch the official identity lookup for the distinct unlinked scopes. Never
 * execute a correlated dictionary scan per fact or change a stored fact ID. */
export async function resolveSeasonFactIdentities(database: QueryDatabase, scopes: Scope[]): Promise<Array<{ player_name_id: number; team_id: number; year: number; player_id: string; canonical_name: string }>> {
  if (!scopes.length) return []
  const names = [...new Set(scopes.map((scope) => normalizePlayerNameKey(scope.name)))]
  const aliases = await database.prepare(`SELECT player_id,alias,season_from,season_to FROM player_aliases
    WHERE normalized_alias IN (SELECT value FROM json_each(?))
      AND source_type IN ('player_profile','current_team_roster','player_batting_stats','player_pitching_stats','player_fielding_stats')`).all(JSON.stringify(names)) as Alias[]
  const canonical = normalizedIdentitySql('COALESCE(canonical_name,full_name)')
  const profileMap = new Map<string, Profile>()
  const years = [...new Set(scopes.map((scope) => scope.year))]
  // D1 has a 100-bound-parameter ceiling. The bridge itself uses one JSON
  // binding; dictionary requests stay below it even for a large fact slice.
  for (let start = 0; start < names.length; start += 30) {
    const batch = names.slice(start, start + 30)
    const aliasIds = [...new Set(aliases.filter((alias) => batch.includes(normalizePlayerNameKey(alias.alias))).map((alias) => alias.player_id))]
    const clauses = batch.map(() => `(${canonical}=? OR (LENGTH(?)>=2 AND ${canonical} LIKE ? || '%'))`)
    const profiles = await database.prepare(`SELECT player_id,COALESCE(canonical_name,full_name) name,
      json_extract(metadata,'$.official_profile_evidence.rows') rows_json FROM player_profiles
    WHERE (${clauses.join(' OR ')} OR player_id IN (SELECT value FROM json_each(?)))
      AND json_extract(metadata,'$.official_profile_evidence.playerId')=player_id
      AND EXISTS (SELECT 1 FROM json_each(?) requested_year WHERE json_extract(year_teams_json,'$."' || requested_year.value || '"') IS NOT NULL)
      AND source_url='https://npb.jp/bis/players/' || player_id || '.html'`)
      .all(...batch.flatMap((name) => [name, name, name]), JSON.stringify(aliasIds), JSON.stringify(years)) as Profile[]
    for (const profile of profiles) profileMap.set(profile.player_id, profile)
  }
  const official = [...profileMap.values()].map((profile) => ({ ...profile, key: normalizePlayerNameKey(profile.name), rows: JSON.parse(profile.rows_json ?? '[]') as Array<{ year?: unknown; team?: unknown; scope?: unknown }> }))
  return scopes.flatMap((scope) => {
    const name = normalizePlayerNameKey(scope.name)
    const candidates = official.filter((profile) => {
      const nameMatches = profile.key === name || (name.length >= 2 && profile.key.startsWith(name)) || aliases.some((alias) => alias.player_id === profile.player_id &&
        normalizePlayerNameKey(alias.alias) === name && (alias.season_from === 0 || alias.season_from <= scope.year) && (alias.season_to === 0 || alias.season_to >= scope.year))
      return nameMatches && Array.isArray(profile.rows) && profile.rows.some((row) => row.scope === 'team_season' && row.year === scope.year && typeof row.team === 'string' &&
        (matchesGameTeamFilter(row.team, scope.team) || matchesGameTeamFilter(scope.team, row.team)))
    })
    return candidates.length === 1 ? [{ player_name_id: scope.player_name_id, team_id: scope.team_id, year: scope.year, player_id: candidates[0]!.player_id, canonical_name: candidates[0]!.name }] : []
  })
}
