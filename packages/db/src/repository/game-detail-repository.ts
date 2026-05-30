import { gameDetailFiltersSchema, type GameDetailFilters } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import { venueSearchValues } from './venue-aliases'
import { toGameTeamAliases } from './team-name-utils'

export type GameDetailRow = {
  gameId: string
  date: string
  venue: string
  competition: string | null
  awayTeamName: string
  homeTeamName: string
  matchupText: string
  linescoreJson: string
}

export async function searchGameDetails(
  database: QueryDatabase,
  filters: GameDetailFilters = {},
): Promise<GameDetailRow[]> {
  const normalized = gameDetailFiltersSchema.parse(filters)
  const clauses: string[] = ["games.game_id NOT LIKE 'f%'"]
  const values: Array<string | number> = []

  if (normalized.game_id) {
    clauses.push('games.game_id = ?')
    values.push(normalized.game_id)
  }
  if (normalized.game_date) {
    clauses.push('games.date = ?')
    values.push(normalized.game_date)
  }
  if (normalized.year) {
    clauses.push('games.year = ?')
    values.push(normalized.year)
  }
  if (normalized.year_from) {
    clauses.push('games.year >= ?')
    values.push(normalized.year_from)
  }
  if (normalized.year_to) {
    clauses.push('games.year <= ?')
    values.push(normalized.year_to)
  }
  if (normalized.team) {
    const searchTerms = toGameTeamAliases(normalized.team)
    const teamClauses = searchTerms.flatMap(() => [
      'games.home_team_name LIKE ?',
      'games.away_team_name LIKE ?',
    ])
    clauses.push(`(${teamClauses.join(' OR ')})`)
    for (const term of searchTerms) {
      values.push(`%${term}%`, `%${term}%`)
    }
  }
  if (normalized.venue) {
    const venues = venueSearchValues(normalized.venue)
    clauses.push(`games.venue IN (${venues.map(() => '?').join(', ')})`)
    values.push(...venues)
  }
  if (normalized.competition) {
    clauses.push('games.competition LIKE ?')
    values.push(`%${normalized.competition}%`)
  }
  if (normalized.player_name) {
    clauses.push(`EXISTS (
      SELECT 1 FROM roster_entries
      WHERE roster_entries.game_id = games.game_id
        AND roster_entries.player_name = ?
    )`)
    values.push(normalized.player_name)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = normalized.limit ?? 20
  const rows = await database
    .prepare(
      `SELECT
        games.game_id AS gameId,
        games.date AS date,
        games.venue AS venue,
        games.competition AS competition,
        games.away_team_name AS awayTeamName,
        games.home_team_name AS homeTeamName,
        games.matchup_text AS matchupText,
        games.linescore_json AS linescoreJson
      FROM games
      ${whereClause}
      ORDER BY games.date DESC, games.game_id DESC
      LIMIT ?`,
    )
    .all(...values, limit)
  return rows as GameDetailRow[]
}
