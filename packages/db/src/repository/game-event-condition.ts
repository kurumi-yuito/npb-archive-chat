import { toEnglishLeagueTeams, toGameTeamAliases } from './team-name-utils'

/** A recorded play condition qualifies its own game and requested offense. */
export function appendGameEventCondition(clauses: string[], values: Array<string | number>, filters: { result_text_contains?: string; team?: string }): void {
  if (!filters.result_text_contains) return
  const aliases = filters.team ? toEnglishLeagueTeams(filters.team) ?? toGameTeamAliases(filters.team) : []
  clauses.push(`EXISTS (SELECT 1 FROM events qualified_event WHERE qualified_event.game_id=games.game_id
    AND qualified_event.result_text LIKE ? ESCAPE '\\'
    ${aliases.length ? `AND qualified_event.offense_team IN (${aliases.map(() => '?').join(', ')})` : ''})`)
  values.push(`%${filters.result_text_contains.replace(/[\\%_]/gu, '\\$&')}%`, ...aliases)
}
