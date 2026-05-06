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
  const values: Array<string | number> = []
  const sourceWhere = (gameIdColumn: string, nameColumn: string, playerIdExpression: string, teamColumn: string): string => {
    const clauses = [`${gameIdColumn} NOT LIKE 'f%'`]
    if (normalized.player_id) {
      clauses.push(`${playerIdExpression} = ?`)
      values.push(normalized.player_id)
    } else {
      clauses.push(`${nameColumn} = ?`)
      values.push(normalized.player_name)
    }
    if (normalized.team) {
      clauses.push(`${teamColumn} = ?`)
      values.push(normalized.team)
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
    return clauses.join(' AND ')
  }
  const currentRosterWhere = (): string => {
    const clauses = ['current_team_roster.player_key NOT LIKE \'f%\'']
    if (normalized.player_id) {
      clauses.push('current_team_roster.player_id = ?')
      values.push(normalized.player_id)
    } else {
      clauses.push('current_team_roster.player_name = ?')
      values.push(normalized.player_name)
    }
    if (normalized.team) {
      clauses.push('current_team_roster.team_name = ?')
      values.push(normalized.team)
    }
    if (normalized.year) {
      clauses.push('current_team_roster.year = ?')
      values.push(normalized.year)
    }
    if (normalized.year_from) {
      clauses.push('current_team_roster.year >= ?')
      values.push(normalized.year_from)
    }
    if (normalized.year_to) {
      clauses.push('current_team_roster.year <= ?')
      values.push(normalized.year_to)
    }
    return clauses.join(' AND ')
  }

  const rows = await database
    .prepare(
      `WITH affiliation_mentions AS (
        SELECT
          current_team_roster.year AS year,
          'bis:' || current_team_roster.year || ':' || current_team_roster.team_id || ':rst' AS game_id,
          printf('%04d-01-01', current_team_roster.year) AS game_date,
          current_team_roster.team_name AS team,
          current_team_roster.player_name AS player_name,
          current_team_roster.player_id AS player_id,
          'bis_roster' AS source_kind,
          current_team_roster.source_url AS source_url,
          0 AS source_rank
        FROM current_team_roster
        WHERE ${currentRosterWhere()}

        UNION ALL

        SELECT
          games.year AS year,
          roster_entries.game_id AS game_id,
          games.date AS game_date,
          roster_entries.team AS team,
          roster_entries.player_name AS player_name,
          ${playerIdSql('roster_entries.player_url')} AS player_id,
          'roster' AS source_kind,
          COALESCE(roster_entries.source_url, roster_source.source_url) AS source_url,
          1 AS source_rank
        FROM roster_entries
        INNER JOIN games ON games.game_id = roster_entries.game_id
        LEFT JOIN source_snapshots AS roster_source
          ON roster_source.game_id = roster_entries.game_id
          AND roster_source.source_key = 'roster'
        WHERE ${sourceWhere('roster_entries.game_id', 'roster_entries.player_name', playerIdSql('roster_entries.player_url'), 'roster_entries.team')}

        UNION ALL

        SELECT
          games.year AS year,
          batting_lines.game_id AS game_id,
          games.date AS game_date,
          batting_lines.team AS team,
          batting_lines.player_name AS player_name,
          ${playerIdSql('batting_lines.player_url')} AS player_id,
          'batting' AS source_kind,
          COALESCE(batting_lines.source_url, box_source.source_url) AS source_url,
          2 AS source_rank
        FROM batting_lines
        INNER JOIN games ON games.game_id = batting_lines.game_id
        LEFT JOIN source_snapshots AS box_source
          ON box_source.game_id = batting_lines.game_id
          AND box_source.source_key = 'box'
        WHERE ${sourceWhere('batting_lines.game_id', 'batting_lines.player_name', playerIdSql('batting_lines.player_url'), 'batting_lines.team')}

        UNION ALL

        SELECT
          games.year AS year,
          pitching_lines.game_id AS game_id,
          games.date AS game_date,
          pitching_lines.team AS team,
          pitching_lines.pitcher_name AS player_name,
          ${playerIdSql('pitching_lines.pitcher_url')} AS player_id,
          'pitching' AS source_kind,
          COALESCE(pitching_lines.source_url, box_source.source_url) AS source_url,
          3 AS source_rank
        FROM pitching_lines
        INNER JOIN games ON games.game_id = pitching_lines.game_id
        LEFT JOIN source_snapshots AS box_source
          ON box_source.game_id = pitching_lines.game_id
          AND box_source.source_key = 'box'
        WHERE ${sourceWhere('pitching_lines.game_id', 'pitching_lines.pitcher_name', playerIdSql('pitching_lines.pitcher_url'), 'pitching_lines.team')}

        UNION ALL

        SELECT
          games.year AS year,
          events.game_id AS game_id,
          games.date AS game_date,
          events.offense_team AS team,
          events.batter_name AS player_name,
          ${playerIdSql('events.batter_url')} AS player_id,
          'event' AS source_kind,
          COALESCE(events.source_url, play_source.source_url) AS source_url,
          4 AS source_rank
        FROM events
        INNER JOIN games ON games.game_id = events.game_id
        LEFT JOIN source_snapshots AS play_source
          ON play_source.game_id = events.game_id
          AND play_source.source_key = 'playbyplay'
        WHERE events.batter_name IS NOT NULL
          AND ${sourceWhere('events.game_id', 'events.batter_name', playerIdSql('events.batter_url'), 'events.offense_team')}

        UNION ALL

        SELECT
          games.year AS year,
          events.game_id AS game_id,
          games.date AS game_date,
          events.offense_team AS team,
          events.runner_name AS player_name,
          ${playerIdSql('events.runner_url')} AS player_id,
          'event' AS source_kind,
          COALESCE(events.source_url, play_source.source_url) AS source_url,
          5 AS source_rank
        FROM events
        INNER JOIN games ON games.game_id = events.game_id
        LEFT JOIN source_snapshots AS play_source
          ON play_source.game_id = events.game_id
          AND play_source.source_key = 'playbyplay'
        WHERE events.runner_name IS NOT NULL
          AND ${sourceWhere('events.game_id', 'events.runner_name', playerIdSql('events.runner_url'), 'events.offense_team')}
      )
      SELECT
        year,
        game_id AS gameId,
        game_date AS gameDate,
        team,
        player_name AS playerName,
        player_id AS playerId,
        source_kind AS sourceKind,
        source_url AS sourceUrl
      FROM affiliation_mentions
      GROUP BY year, game_id, team, player_name, COALESCE(player_id, ''), source_kind, COALESCE(source_url, '')
      ORDER BY year DESC, source_rank ASC, game_date DESC, game_id DESC
      LIMIT ?`,
    )
    .all(...values, normalized.limit ?? 200)

  return rows as PlayerAffiliationRow[]
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
