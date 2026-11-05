import { normalizePlayerNameKey, type PlayerCandidate } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import type { SearchPlayerCandidatesFilters } from './player-repository'
import { canonicalTeamName, matchesGameTeamFilter, toJapaneseTeamAliases } from './team-name-utils'

const nameSql = `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(canonical_name,full_name),' ',''),char(12288),''),'・',''),'･',''),'.',''),'-',''),'_',''),'﨑','崎'),'髙','高'),'濵','浜'),'*',''),'+',''))`
type Profile = { player_id: string; full_name: string; team_name: string | null; year_teams_json: string | null; alias_match: number }
type Roster = { player_id: string; player_name: string; year: number; team_name: string }

function rosterScope(filters: SearchPlayerCandidatesFilters) {
  const prefix = "'bis:' || roster.year || ':' || roster.team_id || ':rst_' || roster.team_id || ':'"
  const clauses = [`roster.player_id IS NOT NULL`, `roster.source_url='https://npb.jp/bis/teams/rst_' || roster.team_id || '.html'`,
    `EXISTS (SELECT 1 FROM bis_source_snapshots source WHERE source.source_type='team_roster'
      AND source.year=roster.year AND source.team_id=roster.team_id AND source.source_url=roster.source_url
      AND source.source_key>=(${prefix}) AND source.source_key<(${prefix}) || char(65535)
      AND length(source.source_key)=length(${prefix})+64
      AND source.raw_path='data/raw/bis/' || roster.year || '/rst_' || roster.team_id || '/' || substr(source.source_key,-64) || '.html')`]
  const values: Array<string | number> = []
  for (const [field, operator] of [['year', '='], ['year_from', '>='], ['year_to', '<=']] as const) if (filters[field]) { clauses.push(`roster.year ${operator} ?`); values.push(filters[field]!) }
  if (filters.team) {
    const teams = toJapaneseTeamAliases(canonicalTeamName(filters.team))
    clauses.push(`REPLACE(REPLACE(roster.team_name,' ',''),char(12288),'') IN (${teams.map(() => '?').join(',')})`)
    values.push(...teams.map((team) => team.normalize('NFKC').replace(/\s+/gu, '')))
  }
  return { sql: clauses.join(' AND '), values }
}

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
    scope.push(`REPLACE(REPLACE(membership.value,' ',''),char(12288),'') IN (${teams.map(() => '?').join(',')})`)
    values.push(...teams.map((team) => team.normalize('NFKC').replace(/\s+/gu, '')))
  }
  const roster = rosterScope(filters)
  const membership = scope.length ? `AND (EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(year_teams_json) THEN year_teams_json ELSE '{}' END) season,
    json_each(CASE WHEN season.type='array' THEN season.value ELSE json_array(season.value) END) membership WHERE ${scope.join(' AND ')})
    OR EXISTS (SELECT 1 FROM current_team_roster roster WHERE roster.player_id=player_profiles.player_id AND ${roster.sql}))` : ''
  const alias = `player_id IN (SELECT player_id FROM player_aliases WHERE normalized_alias=?)`
  const select = `SELECT player_id,full_name,team_name,year_teams_json,(${alias}) AS alias_match FROM player_profiles
    WHERE source_url='https://npb.jp/bis/players/' || player_id || '.html' AND `
  const limit = Math.min(filters.limit ?? 51, 100)
  const candidates = `player_id IN (SELECT player_id FROM player_profiles INDEXED BY idx_player_profiles_identity_key
    WHERE ${nameSql}>=? AND ${nameSql}<? UNION SELECT player_id FROM player_aliases WHERE normalized_alias=?)`
  const profiles = await database.prepare(`${select}${candidates} ${membership} ORDER BY player_id LIMIT ?`)
    .all(input, input, `${input}\uffff`, input, ...values, ...(scope.length ? roster.values : []), limit) as Profile[]
  const registrations = await database.prepare(`SELECT roster.player_id,roster.player_name,roster.year,roster.team_name FROM current_team_roster roster WHERE ${roster.sql}`)
    .all(...roster.values) as Roster[]
  const registrationMatches = registrations.filter((row) => normalizePlayerNameKey(row.player_name).startsWith(input))
  const existingIds = new Set(profiles.map((profile) => profile.player_id))
  const additional = [...new Set(registrationMatches.map((row) => row.player_id))].filter((id) => !existingIds.has(id)).slice(0, limit)
  if (additional.length) profiles.push(...await database.prepare(`SELECT player_id,full_name,team_name,year_teams_json,0 AS alias_match FROM player_profiles
    WHERE player_id IN (${additional.map(() => '?').join(',')}) AND source_url='https://npb.jp/bis/players/' || player_id || '.html'`).all(...additional) as Profile[])
  return profiles.slice(0, limit).map((profile) => {
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
    for (const row of registrations.filter((entry) => entry.player_id === profile.player_id)) pairs.push({ year: row.year, team: row.team_name })
    pairs.sort((a, b) => a.year - b.year)
    return { player_id: profile.player_id, name: profile.full_name, primary_team: pairs.at(-1)?.team ?? profile.team_name,
      matched_aliases: [...new Set([...(profile.alias_match ? [filters.name] : []), ...registrationMatches.filter((row) => row.player_id === profile.player_id).map((row) => row.player_name)])],
      roles: ['profile'], teams: [...new Set(pairs.map((pair) => pair.team))], years: [...new Set(pairs.map((pair) => pair.year))] }
  })
}
