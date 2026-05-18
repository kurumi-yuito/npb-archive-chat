import {
  searchEventsFiltersSchema,
  type InningHalf,
  type PlayByPlayEventSubtype,
  type PlayByPlayEventType,
  type SearchEventsFilters,
} from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'

export type EventRow = {
  gameId: string
  gameDate: string
  sequence: number
  inning: number
  half: InningHalf
  offenseTeam: string
  eventType: PlayByPlayEventType
  eventSubtype: PlayByPlayEventSubtype
  batterName: string | null
  pitcherName: string | null
  runnerName: string | null
  resultText: string
  eventAttributesJson: string | null
  sourceUrl: string | null
}

export async function listEventsByGameId(
  database: QueryDatabase,
  gameId: string,
): Promise<EventRow[]> {
  const rows = await database
    .prepare(
      `SELECT
        events.game_id AS gameId,
        games.date AS gameDate,
        events.sequence,
        events.inning,
        events.half,
        events.offense_team AS offenseTeam,
        events.event_type AS eventType,
        events.event_subtype AS eventSubtype,
        events.batter_name AS batterName,
        events.pitcher_name AS pitcherName,
        events.runner_name AS runnerName,
        events.result_text AS resultText,
        events.event_attributes_json AS eventAttributesJson,
        COALESCE(events.source_url, source_snapshots.source_url) AS sourceUrl
      FROM events
      INNER JOIN games ON games.game_id = events.game_id
      LEFT JOIN source_snapshots
        ON source_snapshots.game_id = events.game_id
       AND source_snapshots.source_key = 'playbyplay'
      WHERE events.game_id = ?
      ORDER BY sequence ASC`,
    )
    .all(gameId)
  return rows as EventRow[]
}

export async function searchEvents(
  database: QueryDatabase,
  filters: SearchEventsFilters = {},
): Promise<EventRow[]> {
  const normalizedFilters = searchEventsFiltersSchema.parse(filters)
  const clauses: string[] = [
    "events.game_id NOT LIKE 'f%'",
    "(events.source_url IS NULL OR events.source_url NOT LIKE '%#playbyplay-not-downloaded')",
    "events.result_text NOT LIKE 'Play-by-play was not ingested from this source%'",
  ]
  const values: Array<string | number> = []

  if (normalizedFilters.game_date) {
    clauses.push('games.date = ?')
    values.push(normalizedFilters.game_date)
  }

  if (normalizedFilters.game_id) {
    clauses.push('events.game_id = ?')
    values.push(normalizedFilters.game_id)
  }

  if (normalizedFilters.year) {
    clauses.push('games.year = ?')
    values.push(normalizedFilters.year)
  }

  if (normalizedFilters.year_from) {
    clauses.push('games.year >= ?')
    values.push(normalizedFilters.year_from)
  }

  if (normalizedFilters.year_to) {
    clauses.push('games.year <= ?')
    values.push(normalizedFilters.year_to)
  }

  if (normalizedFilters.inning) {
    clauses.push('events.inning = ?')
    values.push(normalizedFilters.inning)
  }

  if (normalizedFilters.half) {
    clauses.push('events.half = ?')
    values.push(normalizedFilters.half)
  }

  if (normalizedFilters.team) {
    clauses.push('events.offense_team = ?')
    values.push(normalizedFilters.team)
  }

  if (normalizedFilters.batter_name) {
    clauses.push('events.batter_name = ?')
    values.push(normalizedFilters.batter_name)
  }

  if (normalizedFilters.batter_player_id) {
    addPlayerIdFilter(clauses, values, 'events.batter_url', normalizedFilters.batter_player_id)
  }

  if (normalizedFilters.pitcher_name) {
    clauses.push('events.pitcher_name = ?')
    values.push(normalizedFilters.pitcher_name)
  }

  if (normalizedFilters.pitcher_player_id) {
    addPlayerIdFilter(clauses, values, 'events.pitcher_url', normalizedFilters.pitcher_player_id)
  }

  if (normalizedFilters.runner_name) {
    clauses.push('events.runner_name = ?')
    values.push(normalizedFilters.runner_name)
  }

  if (normalizedFilters.runner_player_id) {
    addPlayerIdFilter(clauses, values, 'events.runner_url', normalizedFilters.runner_player_id)
  }

  if (normalizedFilters.event_type) {
    clauses.push('events.event_type = ?')
    values.push(normalizedFilters.event_type)
  }

  if (normalizedFilters.event_subtype) {
    clauses.push('events.event_subtype = ?')
    values.push(normalizedFilters.event_subtype)
  }

  if (normalizedFilters.player_name) {
    clauses.push(
      '(events.batter_name = ? OR events.pitcher_name = ? OR events.runner_name = ?)',
    )
    values.push(
      normalizedFilters.player_name,
      normalizedFilters.player_name,
      normalizedFilters.player_name,
    )
  }

  if (normalizedFilters.player_id) {
    clauses.push(
      `(
        events.batter_url LIKE ?
        OR events.pitcher_url LIKE ?
        OR events.runner_url LIKE ?
        OR events.event_attributes_json LIKE ?
      )`,
    )
    const playerIdLike = playerIdPattern(normalizedFilters.player_id)
    values.push(playerIdLike, playerIdLike, playerIdLike, playerIdPattern(normalizedFilters.player_id))
  }

  if (normalizedFilters.result_text_contains) {
    clauses.push('events.result_text LIKE ?')
    values.push(`%${normalizedFilters.result_text_contains}%`)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = normalizedFilters.limit ?? 50

  const rows = await database
    .prepare(
      `SELECT
        events.game_id AS gameId,
        games.date AS gameDate,
        events.sequence,
        events.inning,
        events.half,
        events.offense_team AS offenseTeam,
        events.event_type AS eventType,
        events.event_subtype AS eventSubtype,
        events.batter_name AS batterName,
        events.pitcher_name AS pitcherName,
        events.runner_name AS runnerName,
        events.result_text AS resultText,
        events.event_attributes_json AS eventAttributesJson,
        COALESCE(events.source_url, source_snapshots.source_url) AS sourceUrl
      FROM events
      INNER JOIN games ON games.game_id = events.game_id
      LEFT JOIN source_snapshots
        ON source_snapshots.game_id = events.game_id
       AND source_snapshots.source_key = 'playbyplay'
      ${whereClause}
      ORDER BY games.date ASC, events.game_id ASC, events.sequence ASC
      LIMIT ?`,
    )
    .all(...values, limit)
  return rows as EventRow[]
}

function addPlayerIdFilter(
  clauses: string[],
  values: Array<string | number>,
  urlColumn: string,
  playerId: string,
): void {
  clauses.push(`(${urlColumn} LIKE ? OR events.event_attributes_json LIKE ?)`)
  const pattern = playerIdPattern(playerId)
  values.push(pattern, pattern)
}

function playerIdPattern(playerId: string): string {
  return `%${playerId}.html%`
}
