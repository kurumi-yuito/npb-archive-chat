import {
  playerAffiliationFiltersSchema,
  type PlayerAffiliationFilters,
} from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'

export type PlayerAffiliationRow = {
  year: number
  gameId: string
  gameDate: string
  team: string
  playerName: string
  playerId: string | null
  sourceKind: 'bis_roster' | 'roster' | 'batting' | 'pitching' | 'event'
  sourceUrl: string | null
}

export async function searchPlayerAffiliations(
  database: QueryDatabase,
  filters: PlayerAffiliationFilters,
): Promise<PlayerAffiliationRow[]> {
  const normalized = playerAffiliationFiltersSchema.parse(filters)
  const rows: RankedPlayerAffiliationRow[] = []
  rows.push(...await queryAffiliationRows(database, normalized, {
    sql: `SELECT current_team_roster.year AS year, 'bis:' || current_team_roster.year || ':' || current_team_roster.team_id || ':rst' AS gameId, printf('%04d-01-01', current_team_roster.year) AS gameDate, current_team_roster.team_name AS team, current_team_roster.player_name AS playerName, current_team_roster.player_id AS playerId, 'bis_roster' AS sourceKind, current_team_roster.source_url AS sourceUrl, 0 AS sourceRank FROM current_team_roster`,
    sourceKind: 'bis_roster',
    nameColumn: 'current_team_roster.player_name',
    playerIdExpression: 'current_team_roster.player_id',
    teamColumn: 'current_team_roster.team_name',
    yearColumn: 'current_team_roster.year',
    gameIdColumn: 'current_team_roster.player_key',
  }))
  rows.push(...await queryAffiliationRows(database, normalized, {
    sql: `SELECT games.year AS year, roster_entries.game_id AS gameId, games.date AS gameDate, roster_entries.team AS team, roster_entries.player_name AS playerName, ${playerIdSql('roster_entries.player_url')} AS playerId, 'roster' AS sourceKind, COALESCE(roster_entries.source_url, roster_source.source_url) AS sourceUrl, 1 AS sourceRank FROM roster_entries INNER JOIN games ON games.game_id = roster_entries.game_id LEFT JOIN source_snapshots AS roster_source ON roster_source.game_id = roster_entries.game_id AND roster_source.source_key = 'roster'`,
    sourceKind: 'roster',
    nameColumn: 'roster_entries.player_name',
    playerIdExpression: playerIdSql('roster_entries.player_url'),
    teamColumn: 'roster_entries.team',
    yearColumn: 'games.year',
    gameIdColumn: 'roster_entries.game_id',
  }))
  rows.push(...await queryAffiliationRows(database, normalized, {
    sql: `SELECT games.year AS year, batting_lines.game_id AS gameId, games.date AS gameDate, batting_lines.team AS team, batting_lines.player_name AS playerName, ${playerIdSql('batting_lines.player_url')} AS playerId, 'batting' AS sourceKind, COALESCE(batting_lines.source_url, box_source.source_url) AS sourceUrl, 2 AS sourceRank FROM batting_lines INNER JOIN games ON games.game_id = batting_lines.game_id LEFT JOIN source_snapshots AS box_source ON box_source.game_id = batting_lines.game_id AND box_source.source_key = 'box'`,
    sourceKind: 'batting',
    nameColumn: 'batting_lines.player_name',
    playerIdExpression: playerIdSql('batting_lines.player_url'),
    teamColumn: 'batting_lines.team',
    yearColumn: 'games.year',
    gameIdColumn: 'batting_lines.game_id',
  }))
  rows.push(...await queryAffiliationRows(database, normalized, {
    sql: `SELECT games.year AS year, pitching_lines.game_id AS gameId, games.date AS gameDate, pitching_lines.team AS team, pitching_lines.pitcher_name AS playerName, ${playerIdSql('pitching_lines.pitcher_url')} AS playerId, 'pitching' AS sourceKind, COALESCE(pitching_lines.source_url, box_source.source_url) AS sourceUrl, 3 AS sourceRank FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id LEFT JOIN source_snapshots AS box_source ON box_source.game_id = pitching_lines.game_id AND box_source.source_key = 'box'`,
    sourceKind: 'pitching',
    nameColumn: 'pitching_lines.pitcher_name',
    playerIdExpression: playerIdSql('pitching_lines.pitcher_url'),
    teamColumn: 'pitching_lines.team',
    yearColumn: 'games.year',
    gameIdColumn: 'pitching_lines.game_id',
  }))
  rows.push(...await queryAffiliationRows(database, normalized, {
    sql: `SELECT games.year AS year, events.game_id AS gameId, games.date AS gameDate, events.offense_team AS team, events.batter_name AS playerName, ${playerIdSql('events.batter_url')} AS playerId, 'event' AS sourceKind, COALESCE(events.source_url, play_source.source_url) AS sourceUrl, 4 AS sourceRank FROM events INNER JOIN games ON games.game_id = events.game_id LEFT JOIN source_snapshots AS play_source ON play_source.game_id = events.game_id AND play_source.source_key = 'playbyplay'`,
    sourceKind: 'event',
    nameColumn: 'events.batter_name',
    playerIdExpression: playerIdSql('events.batter_url'),
    teamColumn: 'events.offense_team',
    yearColumn: 'games.year',
    gameIdColumn: 'events.game_id',
  }))
  rows.push(...await queryAffiliationRows(database, normalized, {
    sql: `SELECT games.year AS year, events.game_id AS gameId, games.date AS gameDate, events.offense_team AS team, events.runner_name AS playerName, ${playerIdSql('events.runner_url')} AS playerId, 'event' AS sourceKind, COALESCE(events.source_url, play_source.source_url) AS sourceUrl, 5 AS sourceRank FROM events INNER JOIN games ON games.game_id = events.game_id LEFT JOIN source_snapshots AS play_source ON play_source.game_id = events.game_id AND play_source.source_key = 'playbyplay'`,
    sourceKind: 'event',
    nameColumn: 'events.runner_name',
    playerIdExpression: playerIdSql('events.runner_url'),
    teamColumn: 'events.offense_team',
    yearColumn: 'games.year',
    gameIdColumn: 'events.game_id',
  }))

  const deduped = new Map<string, RankedPlayerAffiliationRow>()
  for (const row of rows) {
    deduped.set(`${row.year}:${row.gameId}:${row.team}:${row.playerName}:${row.playerId ?? ''}:${row.sourceKind}:${row.sourceUrl ?? ''}`, row)
  }
  return [...deduped.values()]
    .sort((left, right) =>
      right.year - left.year ||
      left.sourceRank - right.sourceRank ||
      right.gameDate.localeCompare(left.gameDate) ||
      right.gameId.localeCompare(left.gameId),
    )
    .slice(0, normalized.limit ?? 200)
    .map(({ sourceRank: _sourceRank, ...row }) => row)
}

type RankedPlayerAffiliationRow = PlayerAffiliationRow & {
  sourceRank: number
}

async function queryAffiliationRows(
  database: QueryDatabase,
  filters: PlayerAffiliationFilters,
  source: {
    sql: string
    sourceKind: PlayerAffiliationRow['sourceKind']
    nameColumn: string
    playerIdExpression: string
    teamColumn: string
    yearColumn: string
    gameIdColumn: string
  },
): Promise<RankedPlayerAffiliationRow[]> {
  const values: Array<string | number> = []
  const clauses = [`${source.gameIdColumn} NOT LIKE 'f%'`, `${source.nameColumn} IS NOT NULL`, `${source.nameColumn} <> ''`]
  if (filters.player_id) {
    clauses.push(`${source.playerIdExpression} = ?`)
    values.push(filters.player_id)
  } else {
    clauses.push(`${source.nameColumn} = ?`)
    values.push(filters.player_name)
  }
  if (filters.team) {
    clauses.push(`${source.teamColumn} = ?`)
    values.push(filters.team)
  }
  if (filters.year) {
    clauses.push(`${source.yearColumn} = ?`)
    values.push(filters.year)
  }
  if (filters.year_from) {
    clauses.push(`${source.yearColumn} >= ?`)
    values.push(filters.year_from)
  }
  if (filters.year_to) {
    clauses.push(`${source.yearColumn} <= ?`)
    values.push(filters.year_to)
  }

  return await database
    .prepare(`${source.sql} WHERE ${clauses.join(' AND ')} LIMIT ?`)
    .all(...values, filters.limit ?? 200) as RankedPlayerAffiliationRow[]
}

function playerIdSql(column: string): string {
  return `CASE
    WHEN ${column} LIKE '%/players/%.html'
    THEN REPLACE(SUBSTR(${column}, INSTR(${column}, '/players/') + 9), '.html', '')
    WHEN ${column} IS NOT NULL AND ${column} <> ''
    THEN ${column}
    ELSE NULL
  END`
}
