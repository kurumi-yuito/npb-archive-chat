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
import { isNormalizedFactsSchema } from './schema-detection'
import { canonicalTeamName, toJapaneseTeamAliases, toEnglishLeagueTeams, toGameTeamAliases } from './team-name-utils'
import { venueSearchValues } from './venue-aliases'

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
  const groupByYear = normalized.group_by === 'year'
  const careerPlayerQuery = (normalized.player_name || normalized.player_id) &&
    !normalized.year && !normalized.year_from && !normalized.year_to
  if (!careerPlayerQuery && !groupByYear && !normalized.game_date && !normalized.batting_order && !normalized.position) {
    const bisRows = await aggregateCurrentBattingStats(database, normalized)
    if (bisRows.length > 0) {
      return bisRows
    }
  }
  if (await isNormalizedFactsSchema(database)) {
    return aggregateNormalizedBattingLines(database, normalized)
  }
  const clauses: string[] = []
  const values: Array<string | number> = []
  appendGameClauses(clauses, values, normalized)
  if (normalized.player_id) {
    addBattingLinePlayerIdFilter(clauses, values, normalized.player_id)
  } else if (normalized.player_name) {
    clauses.push(prefixMatchesCompactNameSql('?', 'batting_lines.player_name', normalized.team ? 1 : 2))
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
  if (normalized.batting_order !== undefined) {
    clauses.push('batting_lines.batting_order = ?')
    values.push(normalized.batting_order)
  }
  if (normalized.position) {
    clauses.push('batting_lines.position LIKE ?')
    values.push(`%${normalized.position}%`)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const isSeasonRanking = !groupByYear && !normalized.player_name && !normalized.game_date &&
    normalized.year && !normalized.year_from && !normalized.year_to
  const havingClause = (normalized.sort_by === 'battingAverage' || normalized.sort_by === 'ops')
    ? isSeasonRanking
      ? 'HAVING SUM(batting_lines.at_bats) >= 10 AND COUNT(*) >= 3'
      : 'HAVING SUM(batting_lines.at_bats) >= 10'
    : ''
  const rows = await database
    .prepare(
      `SELECT
        ${groupByYear ? 'CAST(games.year AS TEXT)' : 'batting_lines.player_name'} AS label,
        MAX(batting_lines.player_name) AS playerName,
        ${groupByYear ? 'MAX(batting_lines.team)' : 'batting_lines.team'} AS team,
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
      GROUP BY ${groupByYear ? 'games.year' : 'batting_lines.player_name, batting_lines.team'}
      ${havingClause}
      ORDER BY ${groupByYear ? 'CAST(label AS INTEGER) ASC' : `${battingSortClause(normalized.sort_by)}, label ASC`}
      LIMIT ?`,
    )
    .all(...values, normalized.limit ?? 50)

  return (rows as Array<Record<string, string | number | null>>).map((row) => {
    const atBats = Number(row.atBats ?? 0)
    const hits = Number(row.hits ?? 0)
    const walks = Number(row.walks ?? 0)
    const battingAverage = atBats > 0 ? hits / atBats : null
    const onBasePercentage = atBats + walks > 0 ? (hits + walks) / (atBats + walks) : null
    const sluggingPercentage = battingAverage
    return {
      kind: 'batting',
      label: String(row.label ?? ''),
      total: Number(row.games ?? 0),
      stats: {
        team: row.team ?? null,
        playerName: row.playerName ?? null,
        games: Number(row.games ?? 0),
        atBats,
        runs: Number(row.runs ?? 0),
        hits,
        homeRuns: Number(row.homeRuns ?? 0),
        runsBattedIn: Number(row.runsBattedIn ?? 0),
        stolenBases: Number(row.stolenBases ?? 0),
        walks,
        strikeouts: Number(row.strikeouts ?? 0),
        battingAverage,
        onBasePercentage,
        sluggingPercentage,
        ops: onBasePercentage !== null && sluggingPercentage !== null ? onBasePercentage + sluggingPercentage : null,
        isoP: 0,
        bbRate: atBats + walks > 0 ? walks / (atBats + walks) : null,
      },
    }
  })
}

export async function aggregatePitchingLines(
  database: QueryDatabase,
  filters: AggregatePitchingFilters = {},
): Promise<AggregateRow[]> {
  const normalized = aggregatePitchingFiltersSchema.parse(filters)
  const clauses: string[] = []
  const values: Array<string | number> = []
  appendGameClauses(clauses, values, normalized)
  if (normalized.pitcher_player_id) {
    addPitchingLinePlayerIdFilter(clauses, values, normalized.pitcher_player_id)
  } else if (normalized.pitcher_name) {
    clauses.push(prefixMatchesCompactNameSql('?', 'pitching_lines.pitcher_name', normalized.team ? 1 : 2))
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
  if (normalized.max_runs_per_start != null) {
    clauses.push(`pitching_lines.runs IS NOT NULL AND pitching_lines.runs <= ?`)
    values.push(normalized.max_runs_per_start)
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
        SUM(CASE WHEN pitching_lines.decision = 'S' OR pitching_lines.win_loss_save_hold = 'S' THEN 1 ELSE 0 END) AS saves,
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
      saves: Number(row.saves ?? 0),
      inningsPitched: Number(row.inningsPitched ?? 0),
    },
  }))
}

async function aggregateNormalizedBattingLines(
  database: QueryDatabase,
  normalized: AggregateBattingFilters,
): Promise<AggregateRow[]> {
  const groupByYear = normalized.group_by === 'year'
  const clauses: string[] = []
  const values: Array<string | number> = []
  appendNormalizedGameClauses(clauses, values, normalized)
  if (normalized.player_id) {
    if (normalized.player_name) {
      clauses.push(
        `(
          batting_line_facts.player_id = ?
          OR (
            batting_line_facts.player_id IS NULL
            AND ${prefixMatchesCompactNameSql('?', 'person_names.name', normalized.team ? 1 : 2)}
          )
        )`,
      )
      values.push(normalized.player_id, normalized.player_name)
    } else {
      clauses.push('batting_line_facts.player_id = ?')
      values.push(normalized.player_id)
    }
  } else if (normalized.player_name) {
    clauses.push(prefixMatchesCompactNameSql('?', 'person_names.name', normalized.team ? 1 : 2))
    values.push(normalized.player_name)
  }
  if (normalized.team) {
    const teams = toJapaneseTeamAliases(normalized.team)
    clauses.push(`teams.team_name IN (${teams.map(() => '?').join(', ')})`)
    values.push(...teams)
  }
  if (normalized.result_text_contains) {
    const resultTextValues = resultTextSearchValues(normalized.result_text_contains)
    clauses.push(
      `EXISTS (
        SELECT 1
        FROM event_facts AS filtered_events
        INNER JOIN result_codes AS filtered_results
          ON filtered_results.result_code_id = filtered_events.result_code_id
        LEFT JOIN person_names AS filtered_batter_name
          ON filtered_batter_name.name_id = filtered_events.batter_name_id
        WHERE filtered_events.game_id = batting_line_facts.game_id
          AND (
            (filtered_events.batter_player_id IS NOT NULL AND filtered_events.batter_player_id = batting_line_facts.player_id)
            OR filtered_batter_name.name = person_names.name
          )
          AND (${resultTextValues.map(() => 'filtered_results.result_text LIKE ?').join(' OR ')})
      )`,
    )
    values.push(...resultTextValues.map((value) => `%${value}%`))
  }
  if (normalized.batting_order !== undefined) {
    clauses.push('batting_line_facts.batting_order = ?')
    values.push(normalized.batting_order)
  }
  if (normalized.position) {
    clauses.push('positions.position LIKE ?')
    values.push(`%${normalized.position}%`)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const isSeasonRanking = !groupByYear && !normalized.player_name && !normalized.game_date &&
    normalized.year && !normalized.year_from && !normalized.year_to
  const havingClause = (normalized.sort_by === 'battingAverage' || normalized.sort_by === 'ops')
    ? isSeasonRanking
      ? 'HAVING SUM(batting_line_facts.at_bats) >= 10 AND COUNT(*) >= 3'
      : 'HAVING SUM(batting_line_facts.at_bats) >= 10'
    : ''
  const rows = await database
    .prepare(
      `SELECT
        ${groupByYear ? 'CAST(game_facts.year AS TEXT)' : 'person_names.name'} AS label,
        MAX(person_names.name) AS playerName,
        ${groupByYear ? 'MAX(teams.team_name)' : 'teams.team_name'} AS team,
        COUNT(*) AS games,
        SUM(batting_line_facts.at_bats) AS atBats,
        SUM(batting_line_facts.runs) AS runs,
        SUM(batting_line_facts.hits) AS hits,
        SUM(batting_line_facts.runs_batted_in) AS runsBattedIn,
        SUM(batting_line_facts.stolen_bases) AS stolenBases,
        SUM(COALESCE(batting_line_facts.walks, 0)) AS walks,
        SUM(COALESCE(batting_line_facts.strikeouts, 0)) AS strikeouts,
        COALESCE(SUM(hr_stats.hr_count), 0) AS homeRuns
      FROM batting_line_facts
      INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id
      INNER JOIN teams ON teams.team_id = batting_line_facts.team_id
      INNER JOIN person_names ON person_names.name_id = batting_line_facts.player_name_id
      LEFT JOIN positions ON positions.position_id = batting_line_facts.position_id
      LEFT JOIN (
        SELECT
          event_facts.game_id,
          event_facts.batter_player_id,
          batter_name.name AS batter_name,
          COUNT(*) AS hr_count
        FROM event_facts
        INNER JOIN result_codes ON result_codes.result_code_id = event_facts.result_code_id
        LEFT JOIN person_names AS batter_name ON batter_name.name_id = event_facts.batter_name_id
        WHERE result_codes.result_text LIKE '%ホームラン%'
        GROUP BY event_facts.game_id, event_facts.batter_player_id, batter_name.name
      ) hr_stats
        ON hr_stats.game_id = batting_line_facts.game_id
       AND (
          (hr_stats.batter_player_id IS NOT NULL AND hr_stats.batter_player_id = batting_line_facts.player_id)
          OR hr_stats.batter_name = person_names.name
       )
      ${whereClause}
      GROUP BY ${groupByYear ? 'game_facts.year' : 'person_names.name, teams.team_name'}
      ${havingClause}
      ORDER BY ${groupByYear ? 'CAST(label AS INTEGER) ASC' : `${normalizedBattingSortClause(normalized.sort_by)}, label ASC`}
      LIMIT ?`,
    )
    .all(...values, normalized.limit ?? 50)

  return (rows as Array<Record<string, string | number | null>>).map((row) => {
    const atBats = Number(row.atBats ?? 0)
    const hits = Number(row.hits ?? 0)
    const walks = Number(row.walks ?? 0)
    const battingAverage = atBats > 0 ? hits / atBats : null
    const onBasePercentage = atBats + walks > 0 ? (hits + walks) / (atBats + walks) : null
    const sluggingPercentage = battingAverage
    return {
      kind: 'batting',
      label: String(row.label ?? ''),
      total: Number(row.games ?? 0),
      stats: {
        team: row.team ?? null,
        playerName: row.playerName ?? null,
        games: Number(row.games ?? 0),
        atBats,
        runs: Number(row.runs ?? 0),
        hits,
        homeRuns: Number(row.homeRuns ?? 0),
        runsBattedIn: Number(row.runsBattedIn ?? 0),
        stolenBases: Number(row.stolenBases ?? 0),
        walks,
        strikeouts: Number(row.strikeouts ?? 0),
        battingAverage,
        onBasePercentage,
        sluggingPercentage,
        ops: onBasePercentage !== null && sluggingPercentage !== null ? onBasePercentage + sluggingPercentage : null,
        isoP: 0,
        bbRate: atBats + walks > 0 ? walks / (atBats + walks) : null,
      },
    }
  })
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
  if (normalized.batter_name && !normalized.batter_player_id) {
    clauses.push('events.batter_name = ?')
    values.push(normalized.batter_name)
  }
  if (normalized.batter_player_id) {
    addEventPlayerIdFilter(clauses, values, 'events.batter_url', normalized.batter_player_id)
  }
  if (normalized.pitcher_name) {
    if (normalized.pitcher_player_id) {
      addEventPlayerIdFilter(clauses, values, 'events.pitcher_url', normalized.pitcher_player_id)
    } else {
      clauses.push('events.pitcher_name = ?')
      values.push(normalized.pitcher_name)
    }
  } else if (normalized.pitcher_player_id) {
    addEventPlayerIdFilter(clauses, values, 'events.pitcher_url', normalized.pitcher_player_id)
  }
  if (normalized.runner_name && !normalized.runner_player_id) {
    clauses.push('events.runner_name = ?')
    values.push(normalized.runner_name)
  }
  if (normalized.runner_player_id) {
    addEventPlayerIdFilter(clauses, values, 'events.runner_url', normalized.runner_player_id)
  }
  if (normalized.player_name && !normalized.player_id) {
    clauses.push('(events.batter_name = ? OR events.pitcher_name = ? OR events.runner_name = ?)')
    values.push(normalized.player_name, normalized.player_name, normalized.player_name)
  }
  if (normalized.player_id) {
    clauses.push(
      `(
        events.batter_url LIKE ?
        OR events.pitcher_url LIKE ?
        OR events.runner_url LIKE ?
        OR events.event_attributes_json LIKE ?
      )`,
    )
    const pattern = playerIdPattern(normalized.player_id)
    values.push(pattern, pattern, pattern, pattern)
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
    case 'isoP':
      return 'COALESCE(SUM(hr_stats.hr_count), 0) DESC, SUM(batting_lines.hits) DESC'
    case 'bbRate':
      return 'CASE WHEN (SUM(batting_lines.at_bats)+SUM(COALESCE(batting_lines.walks, 0))) > 0 THEN CAST(SUM(COALESCE(batting_lines.walks, 0)) AS REAL)/(SUM(batting_lines.at_bats)+SUM(COALESCE(batting_lines.walks, 0))) ELSE 0 END DESC'
    case 'atBats': return 'SUM(batting_lines.at_bats) DESC'
    case 'homeRuns': return 'COALESCE(SUM(hr_stats.hr_count), 0) DESC'
    case 'runsBattedIn': return 'SUM(batting_lines.runs_batted_in) DESC'
    case 'stolenBases': return 'SUM(batting_lines.stolen_bases) DESC'
    case 'walks': return 'SUM(COALESCE(batting_lines.walks, 0)) DESC'
    case 'strikeouts': return 'SUM(COALESCE(batting_lines.strikeouts, 0)) DESC'
    case 'games': return 'COUNT(*) DESC'
    default: return 'SUM(batting_lines.hits) DESC, SUM(batting_lines.at_bats) DESC'
  }
}

function normalizedBattingSortClause(sortBy: string | undefined): string {
  switch (sortBy) {
    case 'battingAverage':
      return 'CASE WHEN SUM(batting_line_facts.at_bats) > 0 THEN CAST(SUM(batting_line_facts.hits) AS REAL)/SUM(batting_line_facts.at_bats) ELSE 0 END DESC'
    case 'ops': {
      const h = 'SUM(batting_line_facts.hits)'
      const ab = 'SUM(batting_line_facts.at_bats)'
      const bb = 'SUM(COALESCE(batting_line_facts.walks, 0))'
      return `CASE WHEN (${ab}+${bb}) > 0 AND ${ab} > 0 THEN (CAST(${h}+${bb} AS REAL)/(${ab}+${bb})) + CAST(${h} AS REAL)/${ab} ELSE 0 END DESC`
    }
    case 'isoP':
      return 'COALESCE(SUM(hr_stats.hr_count), 0) DESC, SUM(batting_line_facts.hits) DESC'
    case 'bbRate':
      return 'CASE WHEN (SUM(batting_line_facts.at_bats)+SUM(COALESCE(batting_line_facts.walks, 0))) > 0 THEN CAST(SUM(COALESCE(batting_line_facts.walks, 0)) AS REAL)/(SUM(batting_line_facts.at_bats)+SUM(COALESCE(batting_line_facts.walks, 0))) ELSE 0 END DESC'
    case 'atBats': return 'SUM(batting_line_facts.at_bats) DESC'
    case 'homeRuns': return 'COALESCE(SUM(hr_stats.hr_count), 0) DESC'
    case 'runsBattedIn': return 'SUM(batting_line_facts.runs_batted_in) DESC'
    case 'stolenBases': return 'SUM(batting_line_facts.stolen_bases) DESC'
    case 'walks': return 'SUM(COALESCE(batting_line_facts.walks, 0)) DESC'
    case 'strikeouts': return 'SUM(COALESCE(batting_line_facts.strikeouts, 0)) DESC'
    case 'games': return 'COUNT(*) DESC'
    default: return 'SUM(batting_line_facts.hits) DESC, SUM(batting_line_facts.at_bats) DESC'
  }
}

function currentBattingSortClause(sortBy: string | undefined): string {
  const ab = "SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER))"
  const h = "SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER))"
  const tb = "SUM(CAST(COALESCE(json_extract(values_json, '$.塁打'), '0') AS INTEGER))"
  const bb = "SUM(CAST(COALESCE(json_extract(values_json, '$.四球'), '0') AS INTEGER))"
  const hbp = "SUM(CAST(COALESCE(json_extract(values_json, '$.死球'), '0') AS INTEGER))"
  const sf = "SUM(CAST(COALESCE(json_extract(values_json, '$.犠飛'), '0') AS INTEGER))"
  const pa = "SUM(CAST(COALESCE(json_extract(values_json, '$.打席'), '0') AS INTEGER))"
  switch (sortBy) {
    case 'battingAverage':
      return `CASE WHEN ${ab} > 0 THEN CAST(${h} AS REAL)/${ab} ELSE 0 END DESC`
    case 'ops':
      return `CASE WHEN ${ab} > 0 AND (${ab}+${bb}+${hbp}+${sf}) > 0 THEN (CAST(${h}+${bb}+${hbp} AS REAL)/(${ab}+${bb}+${hbp}+${sf})) + (CAST(${tb} AS REAL)/${ab}) ELSE 0 END DESC`
    case 'isoP':
      return `CASE WHEN ${ab} > 0 THEN (CAST(${tb} AS REAL)/${ab}) - (CAST(${h} AS REAL)/${ab}) ELSE 0 END DESC`
    case 'bbRate':
      return `CASE WHEN ${pa} > 0 THEN CAST(${bb} AS REAL)/${pa} ELSE 0 END DESC`
    case 'atBats': return `${ab} DESC`
    case 'homeRuns': return "SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) DESC"
    case 'runsBattedIn': return "SUM(CAST(COALESCE(json_extract(values_json, '$.打点'), '0') AS INTEGER)) DESC"
    case 'stolenBases': return "SUM(CAST(COALESCE(json_extract(values_json, '$.盗塁'), '0') AS INTEGER)) DESC"
    case 'walks': return `${bb} DESC`
    case 'strikeouts': return "SUM(CAST(COALESCE(json_extract(values_json, '$.三振'), '0') AS INTEGER)) DESC"
    case 'games': return "SUM(CAST(COALESCE(json_extract(values_json, '$.試合'), '0') AS INTEGER)) DESC"
    default: return `${h} DESC, ${ab} DESC`
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
    case 'saves': return `SUM(CASE WHEN pitching_lines.decision = 'S' OR pitching_lines.win_loss_save_hold = 'S' THEN 1 ELSE 0 END) DESC`
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

function prefixMatchesCompactNameSql(inputColumn: string, storedNameColumn: string, minimumStoredLength = 2): string {
  const input = compactNameSql(inputColumn)
  const storedName = compactNameSql(storedNameColumn)
  return `(SUBSTR(${input}, 1, LENGTH(${storedName})) = ${storedName} AND LENGTH(${storedName}) >= ${minimumStoredLength})`
}

function compactName(value: string): string {
  return value.replace(/[ \u3000*＊]/gu, '')
}

function addBattingLinePlayerIdFilter(
  clauses: string[],
  values: Array<string | number>,
  playerId: string,
): void {
  const pattern = playerIdPattern(playerId)
  clauses.push(
    `(
      batting_lines.player_url LIKE ?
      OR EXISTS (
        SELECT 1
        FROM events player_id_events
        WHERE player_id_events.game_id = batting_lines.game_id
          AND player_id_events.batter_name = batting_lines.player_name
          AND player_id_events.batter_url LIKE ?
      )
    )`,
  )
  values.push(pattern, pattern)
}

function addPitchingLinePlayerIdFilter(
  clauses: string[],
  values: Array<string | number>,
  playerId: string,
): void {
  const pattern = playerIdPattern(playerId)
  clauses.push(
    `(
      pitching_lines.pitcher_url LIKE ?
      OR EXISTS (
        SELECT 1
        FROM events player_id_events
        WHERE player_id_events.game_id = pitching_lines.game_id
          AND player_id_events.pitcher_name = pitching_lines.pitcher_name
          AND player_id_events.pitcher_url LIKE ?
      )
    )`,
  )
  values.push(pattern, pattern)
}

function addEventPlayerIdFilter(
  clauses: string[],
  values: Array<string | number>,
  urlColumn: string,
  playerId: string,
): void {
  const pattern = playerIdPattern(playerId)
  clauses.push(`(${urlColumn} LIKE ? OR events.event_attributes_json LIKE ?)`)
  values.push(pattern, pattern)
}

function playerIdPattern(playerId: string): string {
  return `%${playerId}.html%`
}

function resultTextSearchValues(value: string): string[] {
  return value === '本塁打' ? ['本塁打', 'ホームラン'] : [value]
}

function scoreSql(side: 'home' | 'away'): string {
  return `CAST(COALESCE(json_extract(games.linescore_json, '$.runs.${side}'), json_extract(games.linescore_json, '$.${side}.totals.runs')) AS INTEGER)`
}

function teamSideWinSql(side: 'home' | 'away', teamNames: string[]): string {
  const other = side === 'home' ? 'away' : 'home'
  const teamPredicate = teamNames.length > 0 ? `games.${side}_team_name IN (${sqlStringList(teamNames)})` : '1 = 1'
  return `(${teamPredicate} AND ${scoreSql(side)} > ${scoreSql(other)})`
}

function teamSideLossSql(side: 'home' | 'away', teamNames: string[]): string {
  const other = side === 'home' ? 'away' : 'home'
  const teamPredicate = teamNames.length > 0 ? `games.${side}_team_name IN (${sqlStringList(teamNames)})` : '1 = 1'
  return `(${teamPredicate} AND ${scoreSql(side)} < ${scoreSql(other)})`
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

function appendNormalizedGameClauses(
  clauses: string[],
  values: Array<string | number>,
  filters: { game_date?: string; year?: number; year_from?: number; year_to?: number },
) {
  if (filters.game_date) {
    clauses.push('game_facts.game_date = ?')
    values.push(filters.game_date)
  }
  if (filters.year) {
    clauses.push('game_facts.year = ?')
    values.push(filters.year)
  }
  if (filters.year_from) {
    clauses.push('game_facts.year >= ?')
    values.push(filters.year_from)
  }
  if (filters.year_to) {
    clauses.push('game_facts.year <= ?')
    values.push(filters.year_to)
  }
}

export async function aggregateGameResults(
  database: QueryDatabase,
  filters: AggregateGamesFilters = {},
): Promise<AggregateRow[]> {
  const normalized = aggregateGamesFiltersSchema.parse(filters)
  const leagueTeams = leagueTeamList(normalized.team)
  if (leagueTeams) {
    const rows = (await Promise.all(
      leagueTeams.map(async (team) => {
        const [row] = await aggregateGameResults(database, { ...normalized, team, limit: 1 })
        return row ? { ...row, label: team } : undefined
      }),
    )).flat()
    return rows.filter((row): row is AggregateRow => Boolean(row)).sort((a, b) =>
      Number(b.stats.wins ?? 0) - Number(a.stats.wins ?? 0) ||
      Number(a.stats.losses ?? 0) - Number(b.stats.losses ?? 0) ||
      a.label.localeCompare(b.label, 'ja'),
    ).slice(0, normalized.limit ?? 30)
  }
  const teamNames = normalized.team ? toGameTeamAliases(normalized.team) : []
  const opponentNames = normalized.opponent ? toGameTeamAliases(normalized.opponent) : []
  const clauses: string[] = ["games.game_id NOT LIKE 'f%'"]
  const values: Array<string | number> = []

  if (teamNames.length > 0 && opponentNames.length > 0) {
    const teamList = sqlStringList(teamNames)
    const opponentList = sqlStringList(opponentNames)
    clauses.push(`((games.home_team_name IN (${teamList}) AND games.away_team_name IN (${opponentList})) OR (games.home_team_name IN (${opponentList}) AND games.away_team_name IN (${teamList})))`)
  } else if (teamNames.length > 0) {
    const teamList = sqlStringList(teamNames)
    clauses.push(`(games.home_team_name IN (${teamList}) OR games.away_team_name IN (${teamList}))`)
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
  if (normalized.venue) {
    const venues = venueSearchValues(normalized.venue)
    clauses.push(`games.venue IN (${venues.map(() => '?').join(', ')})`)
    values.push(...venues)
  }
  if (normalized.competition) {
    clauses.push('games.competition LIKE ?')
    values.push(`%${normalized.competition}%`)
  }

  const whereClause = `WHERE ${clauses.join(' AND ')}`
  const teamSelect = teamNames.length > 0 && normalized.team
    ? sqlStringLiteral(canonicalTeamName(normalized.team))
    : `CASE
        WHEN games.home_team_name IS NOT NULL AND games.home_team_name <> '' THEN games.home_team_name
        ELSE games.away_team_name
      END`
  const groupBy = teamNames.length > 0 ? '' : 'GROUP BY label'
  const limit = normalized.limit ?? 30

  const rows = await database
    .prepare(
      `SELECT
        ${teamSelect} AS label,
        COUNT(*) AS total_games,
        SUM(CASE
          WHEN (${teamSideWinSql('home', teamNames)} OR ${teamSideWinSql('away', teamNames)})
          THEN 1 ELSE 0 END) AS wins,
        SUM(CASE
          WHEN (${teamSideLossSql('home', teamNames)} OR ${teamSideLossSql('away', teamNames)})
          THEN 1 ELSE 0 END) AS losses,
        SUM(CASE
          WHEN ${scoreSql('home')} IS NOT NULL
            AND ${scoreSql('home')} = ${scoreSql('away')}
          THEN 1 ELSE 0 END) AS draws
      FROM games
      ${whereClause}
      ${groupBy}
      ORDER BY wins DESC, losses ASC, label ASC
      LIMIT ?`,
    )
    .all(
      ...values,
      limit,
    )

  return (rows as Array<Record<string, string | number | null>>).filter((row) => Number(row.total_games ?? 0) > 0).map((row) => ({
    kind: 'games',
    label: String(row.label ?? normalized.team ?? ''),
    total: Number(row.total_games ?? 0),
    stats: {
      wins: Number(row.wins ?? 0),
      losses: Number(row.losses ?? 0),
      draws: Number(row.draws ?? 0),
      total_games: Number(row.total_games ?? 0),
    },
  }))
}

function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function sqlStringList(values: string[]): string {
  return values.map(sqlStringLiteral).join(', ')
}

function leagueTeamList(team: string | undefined): string[] | null {
  if (team === 'パ・リーグ' || team === 'パリーグ') {
    return ['日本ハム', '楽天', '西武', 'ロッテ', 'オリックス', 'ソフトバンク']
  }
  if (team === 'セ・リーグ' || team === 'セリーグ') {
    return ['巨人', 'ヤクルト', 'DeNA', '中日', '阪神', '広島']
  }
  return null
}

async function aggregateCurrentBattingStats(
  database: QueryDatabase,
  filters: AggregateBattingFilters,
): Promise<AggregateRow[]> {
  const clauses: string[] = []
  const values: Array<string | number> = []
  if (filters.year) {
    clauses.push('player_batting_stats.year = ?')
    values.push(filters.year)
  }
  if (filters.year_from) {
    clauses.push('player_batting_stats.year >= ?')
    values.push(filters.year_from)
  }
  if (filters.year_to) {
    clauses.push('player_batting_stats.year <= ?')
    values.push(filters.year_to)
  }
  if (filters.team) {
    const teams = toJapaneseTeamAliases(filters.team)
    clauses.push(`player_batting_stats.team_name IN (${teams.map(() => '?').join(', ')})`)
    values.push(...teams)
  }
  if (filters.player_id) {
    clauses.push('player_batting_stats.player_id = ?')
    values.push(filters.player_id)
  } else if (filters.player_name) {
    clauses.push(`${compactNameSql('player_batting_stats.player_name')} LIKE ?`)
    values.push(`%${compactName(filters.player_name)}%`)
  }
  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = await database.prepare(
    `SELECT
      player_batting_stats.player_name AS label,
      MAX(player_batting_stats.team_name) AS team,
      COUNT(*) AS rows,
      SUM(CAST(COALESCE(json_extract(values_json, '$.試合'), '0') AS INTEGER)) AS games,
      SUM(CAST(COALESCE(json_extract(values_json, '$.打席'), '0') AS INTEGER)) AS plateAppearances,
      SUM(CAST(COALESCE(json_extract(values_json, '$.打数'), '0') AS INTEGER)) AS atBats,
      SUM(CAST(COALESCE(json_extract(values_json, '$.得点'), '0') AS INTEGER)) AS runs,
      SUM(CAST(COALESCE(json_extract(values_json, '$.安打'), '0') AS INTEGER)) AS hits,
      SUM(CAST(COALESCE(json_extract(values_json, '$.本塁打'), '0') AS INTEGER)) AS homeRuns,
      SUM(CAST(COALESCE(json_extract(values_json, '$.塁打'), '0') AS INTEGER)) AS totalBases,
      SUM(CAST(COALESCE(json_extract(values_json, '$.打点'), '0') AS INTEGER)) AS runsBattedIn,
      SUM(CAST(COALESCE(json_extract(values_json, '$.盗塁'), '0') AS INTEGER)) AS stolenBases,
      SUM(CAST(COALESCE(json_extract(values_json, '$.四球'), '0') AS INTEGER)) AS walks,
      SUM(CAST(COALESCE(json_extract(values_json, '$.死球'), '0') AS INTEGER)) AS hitByPitch,
      SUM(CAST(COALESCE(json_extract(values_json, '$.犠飛'), '0') AS INTEGER)) AS sacrificeFlies,
      SUM(CAST(COALESCE(json_extract(values_json, '$.三振'), '0') AS INTEGER)) AS strikeouts
    FROM player_batting_stats
    ${whereClause}
    GROUP BY player_batting_stats.player_name
    ORDER BY ${currentBattingSortClause(filters.sort_by)}, label ASC
    LIMIT ?`,
  ).all(...values, filters.limit ?? 50)
  return (rows as Array<Record<string, string | number | null>>).map((row) => {
    const atBats = Number(row.atBats ?? 0)
    const hits = Number(row.hits ?? 0)
    const totalBases = Number(row.totalBases ?? 0)
    const walks = Number(row.walks ?? 0)
    const hitByPitch = Number(row.hitByPitch ?? 0)
    const sacrificeFlies = Number(row.sacrificeFlies ?? 0)
    const plateAppearances = Number(row.plateAppearances ?? 0)
    const battingAverage = atBats > 0 ? hits / atBats : null
    const onBaseDenominator = atBats + walks + hitByPitch + sacrificeFlies
    const onBasePercentage = onBaseDenominator > 0 ? (hits + walks + hitByPitch) / onBaseDenominator : null
    const sluggingPercentage = atBats > 0 ? totalBases / atBats : null
    return {
      kind: 'batting',
      label: String(row.label ?? ''),
      total: Number(row.games ?? row.rows ?? 0),
      stats: {
        team: row.team ?? null,
        games: Number(row.games ?? 0),
        plateAppearances,
        atBats,
        runs: Number(row.runs ?? 0),
        hits,
        homeRuns: Number(row.homeRuns ?? 0),
        totalBases,
        runsBattedIn: Number(row.runsBattedIn ?? 0),
        stolenBases: Number(row.stolenBases ?? 0),
        walks,
        strikeouts: Number(row.strikeouts ?? 0),
        battingAverage,
        onBasePercentage,
        sluggingPercentage,
        ops: onBasePercentage !== null && sluggingPercentage !== null ? onBasePercentage + sluggingPercentage : null,
        isoP: battingAverage !== null && sluggingPercentage !== null ? sluggingPercentage - battingAverage : null,
        bbRate: plateAppearances > 0 ? walks / plateAppearances : null,
      },
    }
  })
}
