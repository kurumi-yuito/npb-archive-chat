import {
  aggregateBattingFiltersSchema,
  aggregateEventsFiltersSchema,
  aggregatePitchingFiltersSchema,
  type AggregateBattingFilters,
  type AggregateEventsFilters,
  type AggregatePitchingFilters,
} from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import { toJapaneseTeamAliases } from './team-name-utils'

export type AggregateRow = {
  kind: 'batting' | 'pitching' | 'events'
  label: string
  total: number
  stats: Record<string, string | number | null>
}

export async function aggregateBattingLines(
  database: QueryDatabase,
  filters: AggregateBattingFilters = {},
): Promise<AggregateRow[]> {
  const normalized = aggregateBattingFiltersSchema.parse(filters)
  const clauses: string[] = []
  const values: Array<string | number> = []
  appendGameClauses(clauses, values, normalized)
  if (normalized.player_name) {
    clauses.push('batting_lines.player_name = ?')
    values.push(normalized.player_name)
  }
  if (normalized.team) {
    const teams = toJapaneseTeamAliases(normalized.team)
    clauses.push(`batting_lines.team IN (${teams.map(() => '?').join(', ')})`)
    values.push(...teams)
  }
  if (normalized.result_text_contains) {
    clauses.push('batting_lines.raw_text LIKE ?')
    values.push(`%${normalized.result_text_contains}%`)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = await database
    .prepare(
      `SELECT
        batting_lines.player_name AS label,
        COUNT(*) AS games,
        SUM(batting_lines.at_bats) AS atBats,
        SUM(batting_lines.runs) AS runs,
        SUM(batting_lines.hits) AS hits,
        SUM(batting_lines.runs_batted_in) AS runsBattedIn,
        SUM(batting_lines.stolen_bases) AS stolenBases,
        SUM(COALESCE(batting_lines.walks, 0)) AS walks,
        SUM(COALESCE(batting_lines.strikeouts, 0)) AS strikeouts
      FROM batting_lines
      INNER JOIN games ON games.game_id = batting_lines.game_id
      ${whereClause}
      GROUP BY batting_lines.player_name
      ORDER BY hits DESC, atBats DESC, label ASC
      LIMIT ?`,
    )
    .all(...values, normalized.limit ?? 50)

  return (rows as Array<Record<string, string | number | null>>).map((row) => ({
    kind: 'batting',
    label: String(row.label ?? ''),
    total: Number(row.games ?? 0),
    stats: {
      games: Number(row.games ?? 0),
      atBats: Number(row.atBats ?? 0),
      runs: Number(row.runs ?? 0),
      hits: Number(row.hits ?? 0),
      runsBattedIn: Number(row.runsBattedIn ?? 0),
      stolenBases: Number(row.stolenBases ?? 0),
      walks: Number(row.walks ?? 0),
      strikeouts: Number(row.strikeouts ?? 0),
    },
  }))
}

export async function aggregatePitchingLines(
  database: QueryDatabase,
  filters: AggregatePitchingFilters = {},
): Promise<AggregateRow[]> {
  const normalized = aggregatePitchingFiltersSchema.parse(filters)
  const clauses: string[] = []
  const values: Array<string | number> = []
  appendGameClauses(clauses, values, normalized)
  if (normalized.pitcher_name) {
    clauses.push('pitching_lines.pitcher_name = ?')
    values.push(normalized.pitcher_name)
  }
  if (normalized.team) {
    const teams = toJapaneseTeamAliases(normalized.team)
    clauses.push(`pitching_lines.team IN (${teams.map(() => '?').join(', ')})`)
    values.push(...teams)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = await database
    .prepare(
      `SELECT
        pitching_lines.pitcher_name AS label,
        COUNT(*) AS games,
        SUM(pitching_lines.pitch_count) AS pitches,
        SUM(pitching_lines.batters_faced) AS battersFaced,
        SUM(pitching_lines.hits) AS hitsAllowed,
        SUM(pitching_lines.home_runs) AS homeRunsAllowed,
        SUM(pitching_lines.walks) AS walks,
        SUM(pitching_lines.hit_batters) AS hitBatters,
        SUM(pitching_lines.strikeouts) AS strikeouts,
        SUM(pitching_lines.runs) AS runsAllowed,
        SUM(pitching_lines.earned_runs) AS earnedRuns
      FROM pitching_lines
      INNER JOIN games ON games.game_id = pitching_lines.game_id
      ${whereClause}
      GROUP BY pitching_lines.pitcher_name
      ORDER BY strikeouts DESC, games DESC, label ASC
      LIMIT ?`,
    )
    .all(...values, normalized.limit ?? 50)

  return (rows as Array<Record<string, string | number | null>>).map((row) => ({
    kind: 'pitching',
    label: String(row.label ?? ''),
    total: Number(row.games ?? 0),
    stats: {
      games: Number(row.games ?? 0),
      pitches: Number(row.pitches ?? 0),
      battersFaced: Number(row.battersFaced ?? 0),
      hitsAllowed: Number(row.hitsAllowed ?? 0),
      homeRunsAllowed: Number(row.homeRunsAllowed ?? 0),
      walks: Number(row.walks ?? 0),
      hitBatters: Number(row.hitBatters ?? 0),
      strikeouts: Number(row.strikeouts ?? 0),
      runsAllowed: Number(row.runsAllowed ?? 0),
      earnedRuns: Number(row.earnedRuns ?? 0),
    },
  }))
}

export async function aggregateEvents(
  database: QueryDatabase,
  filters: AggregateEventsFilters = {},
): Promise<AggregateRow[]> {
  const normalized = aggregateEventsFiltersSchema.parse(filters)
  const clauses: string[] = []
  const values: Array<string | number> = []
  appendGameClauses(clauses, values, normalized)
  if (normalized.team) {
    clauses.push('events.offense_team = ?')
    values.push(normalized.team)
  }
  if (normalized.batter_name) {
    clauses.push('events.batter_name = ?')
    values.push(normalized.batter_name)
  }
  if (normalized.pitcher_name) {
    clauses.push('events.pitcher_name = ?')
    values.push(normalized.pitcher_name)
  }
  if (normalized.runner_name) {
    clauses.push('events.runner_name = ?')
    values.push(normalized.runner_name)
  }
  if (normalized.player_name) {
    clauses.push('(events.batter_name = ? OR events.pitcher_name = ? OR events.runner_name = ?)')
    values.push(normalized.player_name, normalized.player_name, normalized.player_name)
  }
  if (normalized.event_type) {
    clauses.push('events.event_type = ?')
    values.push(normalized.event_type)
  }
  if (normalized.event_subtype) {
    clauses.push('events.event_subtype = ?')
    values.push(normalized.event_subtype)
  }
  if (normalized.result_text_contains) {
    clauses.push('events.result_text LIKE ?')
    values.push(`%${normalized.result_text_contains}%`)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = await database
    .prepare(
      `SELECT
        COALESCE(events.batter_name, events.pitcher_name, events.runner_name, events.offense_team, events.event_subtype) AS label,
        COUNT(*) AS total
      FROM events
      INNER JOIN games ON games.game_id = events.game_id
      ${whereClause}
      GROUP BY label
      ORDER BY total DESC, label ASC
      LIMIT ?`,
    )
    .all(...values, normalized.limit ?? 50)

  return (rows as Array<{ label: string | null; total: number }>).map((row) => ({
    kind: 'events',
    label: row.label ?? 'unknown',
    total: Number(row.total ?? 0),
    stats: {
      events: Number(row.total ?? 0),
    },
  }))
}

function appendGameClauses(
  clauses: string[],
  values: Array<string | number>,
  filters: { game_date?: string; year?: number; year_from?: number; year_to?: number },
) {
  if (filters.game_date) {
    clauses.push('games.date = ?')
    values.push(filters.game_date)
  }
  if (filters.year) {
    clauses.push('games.year = ?')
    values.push(filters.year)
  }
  if (filters.year_from) {
    clauses.push('games.year >= ?')
    values.push(filters.year_from)
  }
  if (filters.year_to) {
    clauses.push('games.year <= ?')
    values.push(filters.year_to)
  }
}
