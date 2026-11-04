import { normalizePlayerNameKey, type PlayerCandidate } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import type { SearchPlayerCandidatesFilters } from './player-repository'
import { canonicalTeamName, matchesGameTeamFilter, toJapaneseTeamAliases } from './team-name-utils'

const nameSql = `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(canonical_name,full_name),' ',''),char(12288),''),'・',''),'･',''),'.',''),'-',''),'_',''),'﨑','崎'),'髙','高'),'濵','浜'),'*',''),'+',''))`
type Profile = { player_id: string; full_name: string; team_name: string | null; year_teams_json: string | null; alias_match: number }

/** Resolve from official identity records without searching every game appearance. */
export async function searchOfficialDictionary(database: QueryDatabase, filters: SearchPlayerCandidatesFilters): Promise<PlayerCandidate[]> {
  const input = normalizePlayerNameKey(filters.name)
  if (!input) return []
  const values: Array<string | number> = []
  const scope: string[] = []
  if (filters.year) { scope.push('CAST(season.key AS INTEGER)=?'); values.push(filters.year) }
  if (filters.year_from) { scope.push('CAST(season.key AS INTEGER)>=?'); values.push(filters.year_from) }
  if (filters.year_to) { scope.push('CAST(season.key AS INTEGER)<=?'); values.push(filters.year_to) }
  if (filters.team) {
    const teams = [...new Set(toJapaneseTeamAliases(canonicalTeamName(filters.team)).flatMap((team) => toJapaneseTeamAliases(canonicalTeamName(team))))]
    scope.push(`membership.value IN (${teams.map(() => '?').join(',')})`)
    values.push(...teams)
  }
  const membership = scope.length ? `AND EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(year_teams_json) THEN year_teams_json ELSE '{}' END) season,
    json_each(CASE WHEN season.type='array' THEN season.value ELSE json_array(season.value) END) membership WHERE ${scope.join(' AND ')})` : ''
  const alias = `player_id IN (SELECT player_id FROM player_aliases WHERE normalized_alias=?)`
  const select = `SELECT player_id,full_name,team_name,year_teams_json,(${alias}) AS alias_match FROM player_profiles
    WHERE source_url='https://npb.jp/bis/players/' || player_id || '.html' AND `
  const limit = Math.min(filters.limit ?? 51, 100)
  const candidates = `player_id IN (SELECT player_id FROM player_profiles INDEXED BY idx_player_profiles_identity_key
    WHERE ${nameSql}>=? AND ${nameSql}<? UNION SELECT player_id FROM player_aliases WHERE normalized_alias=?)`
  const profiles = await database.prepare(`${select}${candidates} ${membership} ORDER BY player_id LIMIT ?`)
    .all(input, input, `${input}\uffff`, input, ...values, limit) as Profile[]
  return profiles.map((profile) => {
    const pairs: Array<{ year: number; team: string }> = []
    try {
      for (const [yearText, teams] of Object.entries(JSON.parse(profile.year_teams_json ?? '{}') as Record<string, unknown>)) {
        const year = Number(yearText)
        if (!Number.isInteger(year) || (filters.year && year !== filters.year) || (filters.year_from && year < filters.year_from) || (filters.year_to && year > filters.year_to)) continue
        for (const team of Array.isArray(teams) ? teams : [teams]) {
          if (typeof team === 'string' && (!filters.team || matchesGameTeamFilter(team, filters.team))) pairs.push({ year, team })
        }
      }
    } catch { /* A malformed profile cannot prove dated membership. */ }
    pairs.sort((a, b) => a.year - b.year)
    return { player_id: profile.player_id, name: profile.full_name, primary_team: pairs.at(-1)?.team ?? profile.team_name,
      ...(profile.alias_match ? { matched_aliases: [filters.name] } : {}),
      roles: ['profile'], teams: [...new Set(pairs.map((pair) => pair.team))], years: [...new Set(pairs.map((pair) => pair.year))] }
  })
}
