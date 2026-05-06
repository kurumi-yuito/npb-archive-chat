import type { PlayerCandidate } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'

export type { PlayerCandidate }

export type SearchPlayerCandidatesFilters = {
  name: string
  aliases?: string[]
  year?: number
  year_from?: number
  year_to?: number
  latestOnly?: boolean
  limit?: number
}

export async function searchPlayerCandidates(
  database: QueryDatabase,
  filters: SearchPlayerCandidatesFilters,
): Promise<PlayerCandidate[]> {
  const aliases = uniqueStrings([filters.name, ...(filters.aliases ?? [])])
  if (aliases.length === 0) {
    return []
  }

  const values: Array<string | number> = []
  const sourceWhere = (nameColumn: string): string => {
    const clauses = [`${nameColumn} IS NOT NULL`, `${nameColumn} <> ''`]
    clauses.push(`(${
      aliases.map((alias) => {
        values.push(alias, `%${alias}%`)
        return `(${nameColumn} = ? OR ${nameColumn} LIKE ?)`
      }).join(' OR ')
    })`)
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
    return clauses.join(' AND ')
  }
  const currentRosterWhere = (): string => {
    const clauses = ['current_team_roster.player_name IS NOT NULL', 'current_team_roster.player_name <> \'\'']
    clauses.push(`(${
      aliases.map((alias) => {
        values.push(alias, `%${alias}%`)
        return '(current_team_roster.player_name = ? OR current_team_roster.player_name LIKE ?)'
      }).join(' OR ')
    })`)
    if (filters.year) {
      clauses.push('current_team_roster.year = ?')
      values.push(filters.year)
    }
    if (filters.year_from) {
      clauses.push('current_team_roster.year >= ?')
      values.push(filters.year_from)
    }
    if (filters.year_to) {
      clauses.push('current_team_roster.year <= ?')
      values.push(filters.year_to)
    }
    return clauses.join(' AND ')
  }
  const currentStatsWhere = (table: string): string => {
    const clauses = [`${table}.player_name IS NOT NULL`, `${table}.player_name <> ''`]
    clauses.push(`(${
      aliases.map((alias) => {
        values.push(alias, `%${alias}%`)
        return `(${table}.player_name = ? OR ${table}.player_name LIKE ?)`
      }).join(' OR ')
    })`)
    if (filters.year) {
      clauses.push(`${table}.year = ?`)
      values.push(filters.year)
    }
    if (filters.year_from) {
      clauses.push(`${table}.year >= ?`)
      values.push(filters.year_from)
    }
    if (filters.year_to) {
      clauses.push(`${table}.year <= ?`)
      values.push(filters.year_to)
    }
    return clauses.join(' AND ')
  }

  const rows = await database
    .prepare(
      `WITH raw_player_mentions AS (
        SELECT
          current_team_roster.player_name AS name,
          current_team_roster.player_id AS player_url,
          'bis_roster' AS role,
          current_team_roster.team_name AS team,
          current_team_roster.year AS year
        FROM current_team_roster
        WHERE ${currentRosterWhere()}
        UNION ALL
        SELECT
          player_batting_stats.player_name AS name,
          player_batting_stats.player_id AS player_url,
          'bis_batting' AS role,
          player_batting_stats.team_name AS team,
          player_batting_stats.year AS year
        FROM player_batting_stats
        WHERE ${currentStatsWhere('player_batting_stats')}
        UNION ALL
        SELECT
          player_pitching_stats.player_name AS name,
          player_pitching_stats.player_id AS player_url,
          'bis_pitching' AS role,
          player_pitching_stats.team_name AS team,
          player_pitching_stats.year AS year
        FROM player_pitching_stats
        WHERE ${currentStatsWhere('player_pitching_stats')}
        UNION ALL
        SELECT
          events.batter_name AS name,
          COALESCE(
            NULLIF(events.batter_url, ''),
            CASE
              WHEN json_valid(events.event_attributes_json)
              THEN json_extract(events.event_attributes_json, '$.batter_links[0].url')
              ELSE NULL
            END
          ) AS player_url,
          'batter' AS role,
          events.offense_team AS team,
          games.year AS year
        FROM events
        INNER JOIN games ON games.game_id = events.game_id
        WHERE ${sourceWhere('events.batter_name')}
        UNION ALL
        SELECT events.pitcher_name AS name, NULLIF(events.pitcher_url, '') AS player_url, 'pitcher' AS role, NULL AS team, games.year AS year
        FROM events
        INNER JOIN games ON games.game_id = events.game_id
        WHERE ${sourceWhere('events.pitcher_name')}
        UNION ALL
        SELECT events.runner_name AS name, NULLIF(events.runner_url, '') AS player_url, 'runner' AS role, events.offense_team AS team, games.year AS year
        FROM events
        INNER JOIN games ON games.game_id = events.game_id
        WHERE ${sourceWhere('events.runner_name')}
        UNION ALL
        SELECT batting_lines.player_name AS name, NULLIF(batting_lines.player_url, '') AS player_url, 'batter' AS role, batting_lines.team AS team, games.year AS year
        FROM batting_lines
        INNER JOIN games ON games.game_id = batting_lines.game_id
        WHERE ${sourceWhere('batting_lines.player_name')}
        UNION ALL
        SELECT pitching_lines.pitcher_name AS name, NULLIF(pitching_lines.pitcher_url, '') AS player_url, 'pitcher' AS role, pitching_lines.team AS team, games.year AS year
        FROM pitching_lines
        INNER JOIN games ON games.game_id = pitching_lines.game_id
        WHERE ${sourceWhere('pitching_lines.pitcher_name')}
        UNION ALL
        SELECT roster_entries.player_name AS name, NULLIF(roster_entries.player_url, '') AS player_url, 'roster' AS role, roster_entries.team AS team, games.year AS year
        FROM roster_entries
        INNER JOIN games ON games.game_id = roster_entries.game_id
        WHERE ${sourceWhere('roster_entries.player_name')}
      ),
      player_mentions AS (
        SELECT
          name,
          CASE
            WHEN player_url LIKE '%/players/%.html'
            THEN REPLACE(SUBSTR(player_url, INSTR(player_url, '/players/') + 9), '.html', '')
            WHEN player_url IS NOT NULL AND player_url <> ''
            THEN player_url
            ELSE NULL
          END AS player_id,
          role,
          team,
          year
        FROM raw_player_mentions
        WHERE name IS NOT NULL AND name <> ''
      )
      SELECT
        player_id,
        name,
        GROUP_CONCAT(DISTINCT role) AS roles,
        GROUP_CONCAT(DISTINCT team) AS teams,
        GROUP_CONCAT(team) AS teamMentions,
        GROUP_CONCAT(DISTINCT year) AS years
      FROM player_mentions
      GROUP BY COALESCE(player_id, name || '|' || COALESCE(team, '')), name
      ORDER BY
        CASE WHEN name IN (${aliases.map(() => '?').join(', ')}) THEN 0 ELSE 1 END,
        CASE WHEN player_id IS NULL THEN 1 ELSE 0 END,
        name ASC
      LIMIT ?`,
    )
    .all(...values, ...aliases, filters.limit ?? 10)

  return mergeFallbackCandidates(rows.map((row) => {
    const record = row as {
      player_id: string | null
      name: string
      roles: string | null
      teams: string | null
      teamMentions: string | null
      years: string | null
    }
    return {
      player_id: record.player_id,
      name: record.name,
      primary_team: mode(splitCsv(record.teamMentions)),
      roles: splitCsv(record.roles),
      teams: splitCsv(record.teams),
      years: splitCsv(record.years).map((year) => Number(year)).filter(Number.isFinite),
    }
  })).slice(0, filters.limit ?? 10)
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])]
}

function splitCsv(value: string | null): string[] {
  return value?.split(',').filter(Boolean) ?? []
}

function mode(values: string[]): string | null {
  let best: string | null = null
  let bestCount = 0
  const counts = new Map<string, number>()
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1
    counts.set(value, count)
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

function mergeFallbackCandidates(candidates: PlayerCandidate[]): PlayerCandidate[] {
  const merged: PlayerCandidate[] = []
  for (const candidate of candidates) {
    const target = candidate.player_id
      ? undefined
      : merged.find((current) =>
          current.player_id &&
          current.name === candidate.name &&
          candidate.teams.length > 0 &&
          candidate.teams.every((team) => current.teams.some((currentTeam) => sameTeamAlias(currentTeam, team))),
        )

    if (!target) {
      merged.push(candidate)
      continue
    }

    target.roles = unique([...target.roles, ...candidate.roles])
    target.teams = unique([...target.teams, ...candidate.teams])
    target.years = unique([...target.years, ...candidate.years]).sort((a, b) => a - b)
    target.primary_team ??= candidate.primary_team
  }
  return merged
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function sameTeamAlias(left: string, right: string): boolean {
  return teamAliasKey(left) === teamAliasKey(right)
}

function teamAliasKey(team: string): string {
  const normalized = team.replace(/[・･.\-_\s　]/gu, '')
  const aliases: Record<string, string> = {
    東京ヤクルトスワローズ: 'ヤクルト',
    ヤクルト: 'ヤクルト',
    オリックスバファローズ: 'オリックス',
    オリックス: 'オリックス',
    埼玉西武ライオンズ: '西武',
    西武: '西武',
    読売ジャイアンツ: '巨人',
    巨人: '巨人',
    千葉ロッテマリーンズ: 'ロッテ',
    ロッテ: 'ロッテ',
    福岡ソフトバンクホークス: 'ソフトバンク',
    ソフトバンク: 'ソフトバンク',
    北海道日本ハムファイターズ: '日本ハム',
    日本ハム: '日本ハム',
    東北楽天ゴールデンイーグルス: '楽天',
    楽天: '楽天',
    阪神タイガース: '阪神',
    阪神: '阪神',
    広島東洋カープ: '広島',
    広島: '広島',
    横浜DeNAベイスターズ: 'DeNA',
    DeNA: 'DeNA',
    中日ドラゴンズ: '中日',
    中日: '中日',
  }
  return aliases[normalized] ?? normalized
}
