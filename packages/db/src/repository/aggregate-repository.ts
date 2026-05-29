import {
  aggregateBattingFiltersSchema,
  aggregateEventsFiltersSchema,
  aggregateGamesFiltersSchema,
  aggregatePitchingFiltersSchema,
  type AggregateBattingFilters,
  type AggregateEventsFilters,
  type AggregateGamesFilters,
  type AggregatePitchingFilters,
} from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import { toJapaneseTeamAliases, toEnglishLeagueTeams } from './team-name-utils'

export type AggregateRow = {
  kind: 'batting' | 'pitching' | 'events' | 'games'
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
    clauses.push(`${compactNameSql('?')} LIKE ${compactNameSql('batting_lines.player_name')} || '%'`)
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
  const isSeasonRanking = !normalized.player_name && !normalized.game_date &&
    normalized.year && !normalized.year_from && !normalized.year_to
  const havingClause = (normalized.sort_by === 'battingAverage' || normalized.sort_by === 'ops')
    ? isSeasonRanking
      ? 'HAVING SUM(batting_lines.at_bats) >= 10 AND COUNT(*) >= 3'
      : 'HAVING SUM(batting_lines.at_bats) >= 10'
    : ''
  const rows = await database
    .prepare(
      `SELECT
        batting_lines.player_name AS label,
        batting_lines.team AS team,
        COUNT(*) AS games,
        SUM(batting_lines.at_bats) AS atBats,
        SUM(batting_lines.runs) AS runs,
        SUM(batting_lines.hits) AS hits,
        SUM(batting_lines.runs_batted_in) AS runsBattedIn,
        SUM(batting_lines.stolen_bases) AS stolenBases,
        SUM(COALESCE(batting_lines.walks, 0)) AS walks,
        SUM(COALESCE(batting_lines.strikeouts, 0)) AS strikeouts,
        COALESCE(SUM(hr_stats.hr_count), 0) AS homeRuns
      FROM batting_lines
      INNER JOIN games ON games.game_id = batting_lines.game_id
      LEFT JOIN (
        SELECT game_id, batter_name, COUNT(*) AS hr_count
        FROM events
        WHERE result_text LIKE '%ホームラン%'
        GROUP BY game_id, batter_name
      ) hr_stats ON hr_stats.game_id = batting_lines.game_id AND hr_stats.batter_name = batting_lines.player_name
      ${whereClause}
      GROUP BY batting_lines.player_name, batting_lines.team
      ${havingClause}
      ORDER BY ${battingSortClause(normalized.sort_by)}, label ASC
      LIMIT ?`,
    )
    .all(...values, normalized.limit ?? 50)

  return (rows as Array<Record<string, string | number | null>>).map((row) => ({
    kind: 'batting',
    label: String(row.label ?? ''),
    total: Number(row.games ?? 0),
    stats: {
      team: row.team ?? null,
      games: Number(row.games ?? 0),
      atBats: Number(row.atBats ?? 0),
      runs: Number(row.runs ?? 0),
      hits: Number(row.hits ?? 0),
      homeRuns: Number(row.homeRuns ?? 0),
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
    clauses.push(`${compactNameSql('?')} LIKE ${compactNameSql('pitching_lines.pitcher_name')} || '%'`)
    values.push(normalized.pitcher_name)
  }
  if (normalized.team) {
    const teams = toJapaneseTeamAliases(normalized.team)
    clauses.push(`pitching_lines.team IN (${teams.map(() => '?').join(', ')})`)
    values.push(...teams)
  }
  if (normalized.min_innings_per_start != null) {
    clauses.push(`${PER_GAME_IP_SQL} >= ?`)
    values.push(normalized.min_innings_per_start)
  }
  if (normalized.max_earned_runs_per_start != null) {
    clauses.push(`pitching_lines.earned_runs IS NOT NULL AND pitching_lines.earned_runs <= ?`)
    values.push(normalized.max_earned_runs_per_start)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const havingClause = (normalized.sort_by === 'era' || normalized.sort_by === 'whip')
    ? `HAVING ${IP_SQL} >= 5 AND ${IP_SQL} / COUNT(*) >= 5 AND COUNT(*) >= 3`
    : ''
  const rows = await database
    .prepare(
      `SELECT
        pitching_lines.pitcher_name AS label,
        pitching_lines.team AS team,
        COUNT(*) AS games,
        SUM(pitching_lines.pitch_count) AS pitches,
        SUM(pitching_lines.batters_faced) AS battersFaced,
        SUM(pitching_lines.hits) AS hitsAllowed,
        SUM(pitching_lines.home_runs) AS homeRunsAllowed,
        SUM(pitching_lines.walks) AS walks,
        SUM(pitching_lines.hit_batters) AS hitBatters,
        SUM(pitching_lines.strikeouts) AS strikeouts,
        SUM(pitching_lines.runs) AS runsAllowed,
        SUM(pitching_lines.earned_runs) AS earnedRuns,
        ${IP_SQL} AS inningsPitched
      FROM pitching_lines
      INNER JOIN games ON games.game_id = pitching_lines.game_id
      ${whereClause}
      GROUP BY pitching_lines.pitcher_name, pitching_lines.team
      ${havingClause}
      ORDER BY ${pitchingSortClause(normalized.sort_by)}, label ASC
      LIMIT ?`,
    )
    .all(...values, normalized.limit ?? 50)

  return (rows as Array<Record<string, string | number | null>>).map((row) => ({
    kind: 'pitching',
    label: String(row.label ?? ''),
    total: Number(row.games ?? 0),
    stats: {
      team: row.team ?? null,
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
      inningsPitched: Number(row.inningsPitched ?? 0),
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
    const leagueTeams = toEnglishLeagueTeams(normalized.team)
    if (leagueTeams) {
      clauses.push(`events.offense_team IN (${leagueTeams.map(() => '?').join(', ')})`)
      values.push(...leagueTeams)
    } else {
      clauses.push('events.offense_team = ?')
      values.push(normalized.team)
    }
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
        MAX(events.offense_team) AS team,
        COUNT(*) AS total
      FROM events
      INNER JOIN games ON games.game_id = events.game_id
      ${whereClause}
      GROUP BY label
      ORDER BY total DESC, label ASC
      LIMIT ?`,
    )
    .all(...values, normalized.limit ?? 50)

  return (rows as Array<{ label: string | null; team: string | null; total: number }>).map((row) => ({
    kind: 'events',
    label: row.label ?? 'unknown',
    total: Number(row.total ?? 0),
    stats: {
      team: row.team ?? null,
      events: Number(row.total ?? 0),
    },
  }))
}

const IP_SQL = `SUM(CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END)`

const PER_GAME_IP_SQL = `CASE WHEN pitching_lines.innings_pitched LIKE '%.%' THEN CAST(SUBSTR(pitching_lines.innings_pitched,1,INSTR(pitching_lines.innings_pitched,'.')-1) AS REAL)+CAST(SUBSTR(pitching_lines.innings_pitched,INSTR(pitching_lines.innings_pitched,'.')+1) AS REAL)/3.0 ELSE CAST(COALESCE(pitching_lines.innings_pitched,'0') AS REAL) END`

function battingSortClause(sortBy: string | undefined): string {
  switch (sortBy) {
    case 'battingAverage':
      return 'CASE WHEN SUM(batting_lines.at_bats) > 0 THEN CAST(SUM(batting_lines.hits) AS REAL)/SUM(batting_lines.at_bats) ELSE 0 END DESC'
    case 'ops': {
      // OPS ≈ OBP + SLG; approximate with available box-score columns (no TB or HBP)
      // OBP_approx = (H+BB)/(AB+BB), SLG_approx = H/AB
      const h = 'SUM(batting_lines.hits)'
      const ab = 'SUM(batting_lines.at_bats)'
      const bb = 'SUM(COALESCE(batting_lines.walks, 0))'
      return `CASE WHEN (${ab}+${bb}) > 0 AND ${ab} > 0 THEN (CAST(${h}+${bb} AS REAL)/(${ab}+${bb})) + CAST(${h} AS REAL)/${ab} ELSE 0 END DESC`
    }
    case 'atBats': return 'SUM(batting_lines.at_bats) DESC'
    case 'runsBattedIn': return 'SUM(batting_lines.runs_batted_in) DESC'
    case 'stolenBases': return 'SUM(batting_lines.stolen_bases) DESC'
    case 'walks': return 'SUM(COALESCE(batting_lines.walks, 0)) DESC'
    case 'strikeouts': return 'SUM(COALESCE(batting_lines.strikeouts, 0)) DESC'
    case 'games': return 'COUNT(*) DESC'
    default: return 'SUM(batting_lines.hits) DESC, SUM(batting_lines.at_bats) DESC'
  }
}

function pitchingSortClause(sortBy: string | undefined): string {
  switch (sortBy) {
    case 'era':
      return `CASE WHEN ${IP_SQL} > 0 THEN SUM(pitching_lines.earned_runs)*9.0/${IP_SQL} ELSE 999 END ASC`
    case 'whip':
      return `CASE WHEN ${IP_SQL} > 0 THEN (SUM(pitching_lines.hits)+SUM(COALESCE(pitching_lines.walks,0)))*1.0/${IP_SQL} ELSE 999 END ASC`
    case 'inningsPitched':
      return `${IP_SQL} DESC`
    case 'wins': return `SUM(CASE WHEN pitching_lines.decision = '○' THEN 1 ELSE 0 END) DESC`
    case 'games': return 'COUNT(*) DESC'
    case 'hitsAllowed': return 'SUM(pitching_lines.hits) ASC'
    case 'walks': return 'SUM(pitching_lines.walks) ASC'
    case 'earnedRuns': return 'SUM(pitching_lines.earned_runs) ASC'
    default: return 'SUM(pitching_lines.strikeouts) DESC, COUNT(*) DESC'
  }
}

function compactNameSql(column: string): string {
  return `REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), char(12288), ''), '*', ''), '＊', '')`
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

export async function aggregateGameResults(
  database: QueryDatabase,
  filters: AggregateGamesFilters = {},
): Promise<AggregateRow[]> {
  const normalized = aggregateGamesFiltersSchema.parse(filters)
  if (!normalized.team) {
    return []
  }

  const teamPattern = `%${normalized.team}%`
  const clauses: string[] = [
    "games.game_id NOT LIKE 'f%'",
    '(games.home_team_name LIKE ? OR games.away_team_name LIKE ?)',
  ]
  // Positional values: first two are for the WHERE team filter
  const values: Array<string | number> = [teamPattern, teamPattern]

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

  const whereClause = `WHERE ${clauses.join(' AND ')}`

  // CASE expressions follow WHERE values; teamPattern appears 4 more times for SELECT CASE
  const rows = await database
    .prepare(
      `SELECT
        COUNT(*) AS total_games,
        SUM(CASE
          WHEN (games.home_team_name LIKE ? AND CAST(json_extract(games.linescore_json, '$.runs.home') AS INTEGER) > CAST(json_extract(games.linescore_json, '$.runs.away') AS INTEGER))
            OR (games.away_team_name LIKE ? AND CAST(json_extract(games.linescore_json, '$.runs.away') AS INTEGER) > CAST(json_extract(games.linescore_json, '$.runs.home') AS INTEGER))
          THEN 1 ELSE 0 END) AS wins,
        SUM(CASE
          WHEN (games.home_team_name LIKE ? AND CAST(json_extract(games.linescore_json, '$.runs.home') AS INTEGER) < CAST(json_extract(games.linescore_json, '$.runs.away') AS INTEGER))
            OR (games.away_team_name LIKE ? AND CAST(json_extract(games.linescore_json, '$.runs.away') AS INTEGER) < CAST(json_extract(games.linescore_json, '$.runs.home') AS INTEGER))
          THEN 1 ELSE 0 END) AS losses,
        SUM(CASE
          WHEN json_extract(games.linescore_json, '$.runs.home') IS NOT NULL
            AND CAST(json_extract(games.linescore_json, '$.runs.home') AS INTEGER) = CAST(json_extract(games.linescore_json, '$.runs.away') AS INTEGER)
          THEN 1 ELSE 0 END) AS draws
      FROM games
      ${whereClause}`,
    )
    .all(teamPattern, teamPattern, teamPattern, teamPattern, ...values)

  const row = (rows as Array<Record<string, number | null>>)[0]
  if (!row) {
    return []
  }

  const total = Number(row.total_games ?? 0)
  if (total === 0) {
    return []
  }

  return [{
    kind: 'games',
    label: normalized.team,
    total,
    stats: {
      wins: Number(row.wins ?? 0),
      losses: Number(row.losses ?? 0),
      draws: Number(row.draws ?? 0),
      total_games: total,
    },
  }]
}
