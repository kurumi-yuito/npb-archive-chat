import { searchPitchingLinesFiltersSchema } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import type { SearchPitchingLinesFilters } from '@npb/schemas'

/** 投手成績の検索向け最小列 */
export type PitchingLineRow = {
  gameId: string
  gameDate: string
  team: string
  pitcherName: string
  inningsPitched: string
  pitchCount: number
  strikeouts: number
  runs: number
  earnedRuns: number
}

export async function searchPitchingLines(
  database: QueryDatabase,
  filters: SearchPitchingLinesFilters = {},
): Promise<PitchingLineRow[]> {
  const normalized = searchPitchingLinesFiltersSchema.parse(filters)
  const clauses: string[] = []
  const values: Array<string | number> = []

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

  if (normalized.pitcher_name) {
    clauses.push('pitching_lines.pitcher_name = ?')
    values.push(normalized.pitcher_name)
  }

  if (normalized.team) {
    clauses.push('pitching_lines.team = ?')
    values.push(normalized.team)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = normalized.limit ?? 50

  const rows = await database
    .prepare(
      `SELECT
        pitching_lines.game_id AS gameId,
        games.date AS gameDate,
        pitching_lines.team AS team,
        pitching_lines.pitcher_name AS pitcherName,
        pitching_lines.innings_pitched AS inningsPitched,
        pitching_lines.pitch_count AS pitchCount,
        pitching_lines.strikeouts AS strikeouts,
        pitching_lines.runs AS runs,
        pitching_lines.earned_runs AS earnedRuns
      FROM pitching_lines
      INNER JOIN games ON games.game_id = pitching_lines.game_id
      ${whereClause}
      ORDER BY games.date ${normalized.recent ? 'DESC' : 'ASC'}, pitching_lines.game_id ASC, pitching_lines.row_index ASC
      LIMIT ?`,
    )
    .all(...values, limit)
  return rows as PitchingLineRow[]
}
