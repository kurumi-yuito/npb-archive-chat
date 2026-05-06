import { searchGamesFiltersSchema, type SearchGamesFilters } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'

/** 一覧・検索向けの最小列（詳細 JSON は含めない） */
export type GameSummaryRow = {
  gameId: string
  date: string
  awayTeamName: string
  homeTeamName: string
  matchupText: string
}

export type GameMatchingRow = {
  year: number
  mmdd: string
  gameId: string
  date: string
  homeTeamName: string
  awayTeamName: string
  competition: string | null
  venue: string
  startTime: string | null
  gameNumber: number | null
  canonicalUrl: string | null
}

export type GameYearRow = GameMatchingRow

export async function searchGames(
  database: QueryDatabase,
  filters: SearchGamesFilters = {},
): Promise<GameSummaryRow[]> {
  const normalized = searchGamesFiltersSchema.parse(filters)
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

  if (normalized.game_id) {
    clauses.push('games.game_id = ?')
    values.push(normalized.game_id)
  }

  if (normalized.team) {
    clauses.push('(games.home_team_short_name = ? OR games.away_team_short_name = ? OR games.home_team_name = ? OR games.away_team_name = ?)')
    values.push(normalized.team, normalized.team, normalized.team, normalized.team)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = normalized.limit ?? 50

  const rows = await database
    .prepare(
      `SELECT
        games.game_id AS gameId,
        games.date AS date,
        games.away_team_name AS awayTeamName,
        games.home_team_name AS homeTeamName,
        games.matchup_text AS matchupText
      FROM games
      ${whereClause}
      ORDER BY games.date ASC, games.game_id ASC
      LIMIT ?`,
    )
    .all(...values, limit)
  return rows as GameSummaryRow[]
}

export async function listLoadedGameIdsByYear(
  database: QueryDatabase,
  year: number,
): Promise<string[]> {
  const rows = (await database
    .prepare(
      `SELECT games.game_id AS gameId
        FROM games
        WHERE games.year = ?
        ORDER BY games.game_id ASC`,
    )
    .all(year)) as Array<{ gameId: string }>
  return rows.map((row) => row.gameId)
}

export async function listGamesByYear(
  database: QueryDatabase,
  year: number,
): Promise<GameYearRow[]> {
  return listGamesForScoresEnrichment(database, year)
}

export async function listGamesForScoresEnrichment(
  database: QueryDatabase,
  year: number,
  options: { limit?: number; league?: 'all' | 'regular'; dateFrom?: string; dateTo?: string } = {},
): Promise<GameYearRow[]> {
  const clauses = ['games.year = ?']
  const params: Array<number | string> = [year]
  if (options.league === 'regular') {
    clauses.push("games.game_id LIKE 'r________%'")
  }
  if (options.dateFrom) {
    clauses.push('games.date >= ?')
    params.push(options.dateFrom)
  }
  if (options.dateTo) {
    clauses.push('games.date <= ?')
    params.push(options.dateTo)
  }
  const limitClause = typeof options.limit === 'number' ? 'LIMIT ?' : ''
  if (typeof options.limit === 'number') {
    params.push(options.limit)
  }
  const rows = (await database
    .prepare(
      `SELECT
        games.year AS year,
        games.mmdd AS mmdd,
        games.game_id AS gameId,
        games.date AS date,
        games.home_team_name AS homeTeamName,
        games.away_team_name AS awayTeamName,
        games.competition AS competition,
        games.venue AS venue,
        games.start_time AS startTime,
        games.game_number AS gameNumber,
        games.canonical_url AS canonicalUrl
      FROM games
      WHERE ${clauses.join(' AND ')}
      ORDER BY games.date ASC, games.game_id ASC
      ${limitClause}`,
    )
    .all(...params)) as GameYearRow[]
  return rows
}

export async function listGamesByDate(
  database: QueryDatabase,
  date: string,
): Promise<GameMatchingRow[]> {
  const rows = (await database
    .prepare(
      `SELECT
        games.year AS year,
        games.mmdd AS mmdd,
        games.game_id AS gameId,
        games.date AS date,
        games.home_team_name AS homeTeamName,
        games.away_team_name AS awayTeamName,
        games.competition AS competition,
        games.venue AS venue,
        games.start_time AS startTime,
        games.game_number AS gameNumber,
        games.canonical_url AS canonicalUrl
      FROM games
      WHERE games.date = ?
      ORDER BY games.game_id ASC`,
    )
    .all(date)) as GameMatchingRow[]
  return rows
}
