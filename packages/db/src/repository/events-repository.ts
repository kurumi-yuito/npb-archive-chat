import {
  searchEventsFiltersSchema,
  type InningHalf,
  type PlayByPlayEventSubtype,
  type PlayByPlayEventType,
  type SearchEventsFilters,
} from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import { toEnglishLeagueTeams } from './team-name-utils'
import { isNormalizedFactsSchema } from './schema-detection'

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
  if (await isNormalizedFactsSchema(database)) {
    return listNormalizedEventsByGameId(database, gameId)
  }
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
  if (await isNormalizedFactsSchema(database) && hasNormalizedEventPlayerFilter(normalizedFilters)) {
    return searchNormalizedEvents(database, normalizedFilters)
  }
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
    const leagueTeams = toEnglishLeagueTeams(normalizedFilters.team)
    if (leagueTeams) {
      clauses.push(`events.offense_team IN (${leagueTeams.map(() => '?').join(', ')})`)
      values.push(...leagueTeams)
    } else {
      clauses.push('events.offense_team = ?')
      values.push(normalizedFilters.team)
    }
  }

  if (normalizedFilters.batter_name && !normalizedFilters.batter_player_id) {
    clauses.push('events.batter_name = ?')
    values.push(normalizedFilters.batter_name)
  }

  if (normalizedFilters.batter_player_id) {
    addPlayerIdFilter(clauses, values, 'events.batter_url', normalizedFilters.batter_player_id)
  }

  if (normalizedFilters.pitcher_name && !normalizedFilters.pitcher_player_id) {
    clauses.push('events.pitcher_name = ?')
    values.push(normalizedFilters.pitcher_name)
  }

  if (normalizedFilters.pitcher_player_id) {
    addPlayerIdFilter(clauses, values, 'events.pitcher_url', normalizedFilters.pitcher_player_id)
  }

  if (normalizedFilters.runner_name && !normalizedFilters.runner_player_id) {
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

  if (normalizedFilters.player_name && !normalizedFilters.player_id) {
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

async function listNormalizedEventsByGameId(
  database: QueryDatabase,
  gameId: string,
): Promise<EventRow[]> {
  const rows = await database
    .prepare(
      `${normalizedEventSelectSql()}
      WHERE event_facts.game_id = ?
      ORDER BY event_facts.sequence ASC`,
    )
    .all(gameId)
  return rows as EventRow[]
}

async function searchNormalizedEvents(
  database: QueryDatabase,
  normalizedFilters: SearchEventsFilters,
): Promise<EventRow[]> {
  const clauses: string[] = [
    "event_facts.game_id NOT LIKE 'f%'",
    "(source_snapshot_facts.source_url IS NULL OR source_snapshot_facts.source_url NOT LIKE '%#playbyplay-not-downloaded')",
    "result_codes.result_text NOT LIKE 'Play-by-play was not ingested from this source%'",
  ]
  const values: Array<string | number> = []

  if (normalizedFilters.game_date) {
    clauses.push('game_facts.game_date = ?')
    values.push(normalizedFilters.game_date)
  }
  if (normalizedFilters.game_id) {
    clauses.push('event_facts.game_id = ?')
    values.push(normalizedFilters.game_id)
  }
  if (normalizedFilters.year) {
    clauses.push('game_facts.year = ?')
    values.push(normalizedFilters.year)
  }
  if (normalizedFilters.year_from) {
    clauses.push('game_facts.year >= ?')
    values.push(normalizedFilters.year_from)
  }
  if (normalizedFilters.year_to) {
    clauses.push('game_facts.year <= ?')
    values.push(normalizedFilters.year_to)
  }
  if (normalizedFilters.inning) {
    clauses.push('event_facts.inning = ?')
    values.push(normalizedFilters.inning)
  }
  if (normalizedFilters.half) {
    clauses.push('event_facts.half_code = ?')
    values.push(normalizedFilters.half === 'top' ? 1 : 2)
  }
  if (normalizedFilters.team) {
    const leagueTeams = toEnglishLeagueTeams(normalizedFilters.team)
    if (leagueTeams) {
      clauses.push(`offense_team.team_name IN (${leagueTeams.map(() => '?').join(', ')})`)
      values.push(...leagueTeams)
    } else {
      clauses.push('offense_team.team_name = ?')
      values.push(normalizedFilters.team)
    }
  }
  if (normalizedFilters.batter_player_id) {
    clauses.push('event_facts.batter_player_id = ?')
    values.push(normalizedFilters.batter_player_id)
  } else if (normalizedFilters.batter_name) {
    clauses.push('batter_name.name = ?')
    values.push(normalizedFilters.batter_name)
  }
  if (normalizedFilters.pitcher_player_id) {
    clauses.push('event_facts.pitcher_player_id = ?')
    values.push(normalizedFilters.pitcher_player_id)
  } else if (normalizedFilters.pitcher_name) {
    clauses.push('pitcher_name.name = ?')
    values.push(normalizedFilters.pitcher_name)
  }
  if (normalizedFilters.runner_player_id) {
    clauses.push('event_facts.runner_player_id = ?')
    values.push(normalizedFilters.runner_player_id)
  } else if (normalizedFilters.runner_name) {
    clauses.push('runner_name.name = ?')
    values.push(normalizedFilters.runner_name)
  }
  if (normalizedFilters.player_id) {
    clauses.push(
      `(
        event_facts.batter_player_id = ?
        OR event_facts.pitcher_player_id = ?
        OR event_facts.runner_player_id = ?
      )`,
    )
    values.push(normalizedFilters.player_id, normalizedFilters.player_id, normalizedFilters.player_id)
  } else if (normalizedFilters.player_name) {
    clauses.push('(batter_name.name = ? OR pitcher_name.name = ? OR runner_name.name = ?)')
    values.push(normalizedFilters.player_name, normalizedFilters.player_name, normalizedFilters.player_name)
  }
  if (normalizedFilters.event_type) {
    clauses.push('event_types.event_type = ?')
    values.push(normalizedFilters.event_type)
  }
  if (normalizedFilters.event_subtype) {
    clauses.push('event_subtypes.event_subtype = ?')
    values.push(normalizedFilters.event_subtype)
  }
  if (normalizedFilters.result_text_contains) {
    clauses.push('result_codes.result_text LIKE ?')
    values.push(`%${normalizedFilters.result_text_contains}%`)
  }

  const rows = await database
    .prepare(
      `${normalizedEventSelectSql()}
      WHERE ${clauses.join(' AND ')}
      ORDER BY game_facts.game_date ASC, event_facts.game_id ASC, event_facts.sequence ASC
      LIMIT ?`,
    )
    .all(...values, normalizedFilters.limit ?? 50)
  return rows as EventRow[]
}

function hasNormalizedEventPlayerFilter(filters: SearchEventsFilters): boolean {
  return Boolean(
    filters.player_id ||
    filters.batter_player_id ||
    filters.pitcher_player_id ||
    filters.runner_player_id,
  )
}

function normalizedEventSelectSql(): string {
  return `SELECT
        event_facts.game_id AS gameId,
        game_facts.game_date AS gameDate,
        event_facts.sequence,
        event_facts.inning,
        CASE event_facts.half_code WHEN 1 THEN 'top' ELSE 'bottom' END AS half,
        COALESCE(offense_team.team_name, '') AS offenseTeam,
        event_types.event_type AS eventType,
        event_subtypes.event_subtype AS eventSubtype,
        batter_name.name AS batterName,
        pitcher_name.name AS pitcherName,
        runner_name.name AS runnerName,
        result_codes.result_text AS resultText,
        json_object(
          'batter_url', CASE WHEN event_facts.batter_player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || event_facts.batter_player_id || '.html' ELSE NULL END,
          'pitcher_url', CASE WHEN event_facts.pitcher_player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || event_facts.pitcher_player_id || '.html' ELSE NULL END,
          'runner_url', CASE WHEN event_facts.runner_player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || event_facts.runner_player_id || '.html' ELSE NULL END
        ) AS eventAttributesJson,
        source_snapshot_facts.source_url AS sourceUrl
      FROM event_facts
      INNER JOIN game_facts ON game_facts.game_id = event_facts.game_id
      LEFT JOIN teams AS offense_team ON offense_team.team_id = event_facts.offense_team_id
      INNER JOIN event_types ON event_types.event_type_id = event_facts.event_type_id
      INNER JOIN event_subtypes ON event_subtypes.event_subtype_id = event_facts.event_subtype_id
      INNER JOIN result_codes ON result_codes.result_code_id = event_facts.result_code_id
      LEFT JOIN person_names AS batter_name ON batter_name.name_id = event_facts.batter_name_id
      LEFT JOIN person_names AS pitcher_name ON pitcher_name.name_id = event_facts.pitcher_name_id
      LEFT JOIN person_names AS runner_name ON runner_name.name_id = event_facts.runner_name_id
      LEFT JOIN source_snapshot_facts ON source_snapshot_facts.source_snapshot_id = event_facts.source_snapshot_id`
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
