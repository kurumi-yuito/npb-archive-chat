import { searchPitchingLinesFiltersSchema } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import type { SearchPitchingLinesFilters } from '@npb/schemas'
import { toJapaneseTeamAliases } from './team-name-utils'

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
  sourceKind?: 'box' | 'bis_pitching' | 'bis_pitching_farm'
  sourceUrl?: string | null
  statsJson?: string | null
}

export async function searchPitchingLines(
  database: QueryDatabase,
  filters: SearchPitchingLinesFilters = {},
): Promise<PitchingLineRow[]> {
  const normalized = searchPitchingLinesFiltersSchema.parse(filters)
  const limit = normalized.limit ?? 50

  const currentRows = normalized.game_date || normalized.recent
    ? []
    : await searchCurrentPitchingStats(database, normalized, limit)
  if (currentRows.length > 0) {
    return currentRows
  }

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
    clauses.push(`${compactNameSql('?')} LIKE ${compactNameSql('pitching_lines.pitcher_name')} || '%'`)
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
        pitching_lines.game_id AS gameId,
        games.date AS gameDate,
        pitching_lines.team AS team,
        pitching_lines.pitcher_name AS pitcherName,
        pitching_lines.innings_pitched AS inningsPitched,
        pitching_lines.pitch_count AS pitchCount,
        pitching_lines.strikeouts AS strikeouts,
        pitching_lines.runs AS runs,
        pitching_lines.earned_runs AS earnedRuns,
        'box' AS sourceKind,
        COALESCE(pitching_lines.source_url, box_source.source_url) AS sourceUrl,
        NULL AS statsJson
      FROM pitching_lines
      INNER JOIN games ON games.game_id = pitching_lines.game_id
      LEFT JOIN source_snapshots AS box_source
        ON box_source.game_id = pitching_lines.game_id
       AND box_source.source_key = 'box'
      ${whereClause}
      ORDER BY games.date ${normalized.recent ? 'DESC' : 'ASC'}, pitching_lines.game_id ASC, pitching_lines.row_index ASC
      LIMIT ?`,
    )
    .all(...values, limit)
  const gameRows = rows as PitchingLineRow[]
  return gameRows
}

export async function searchCurrentPitchingStats(
  database: QueryDatabase,
  filters: SearchPitchingLinesFilters,
  limit: number,
): Promise<PitchingLineRow[]> {
  const clauses: string[] = []
  const values: Array<string | number> = []

  if (filters.year) {
    clauses.push('player_pitching_stats.year = ?')
    values.push(filters.year)
  }
  if (filters.year_from) {
    clauses.push('player_pitching_stats.year >= ?')
    values.push(filters.year_from)
  }
  if (filters.year_to) {
    clauses.push('player_pitching_stats.year <= ?')
    values.push(filters.year_to)
  }
  if (filters.team) {
    const teams = teamAliases(filters.team)
    clauses.push(`player_pitching_stats.team_name IN (${teams.map(() => '?').join(', ')})`)
    values.push(...teams)
  }
  if (filters.pitcher_name) {
    clauses.push(`${compactNameSql('player_pitching_stats.player_name')} LIKE ?`)
    values.push(`%${compactName(filters.pitcher_name)}%`)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = await database
    .prepare(
      `SELECT
        'bis:' || player_pitching_stats.year || ':' || player_pitching_stats.team_id || ':' ||
          CASE WHEN player_pitching_stats.source_url LIKE '%idp2%' THEN 'idp2' ELSE 'idp1' END AS gameId,
        printf('%04d-01-01', player_pitching_stats.year) AS gameDate,
        player_pitching_stats.team_name AS team,
        player_pitching_stats.player_name AS pitcherName,
        COALESCE(json_extract(player_pitching_stats.values_json, '$.投球回'), '0') AS inningsPitched,
        CAST(COALESCE(json_extract(player_pitching_stats.values_json, '$.投球数'), '0') AS INTEGER) AS pitchCount,
        CAST(COALESCE(json_extract(player_pitching_stats.values_json, '$.三振'), json_extract(player_pitching_stats.values_json, '$.奪三振'), '0') AS INTEGER) AS strikeouts,
        CAST(COALESCE(json_extract(player_pitching_stats.values_json, '$.失点'), '0') AS INTEGER) AS runs,
        CAST(COALESCE(json_extract(player_pitching_stats.values_json, '$.自責点'), '0') AS INTEGER) AS earnedRuns,
        CASE WHEN player_pitching_stats.source_url LIKE '%idp2%' THEN 'bis_pitching_farm' ELSE 'bis_pitching' END AS sourceKind,
        player_pitching_stats.source_url AS sourceUrl,
        player_pitching_stats.values_json AS statsJson
      FROM player_pitching_stats
      ${whereClause}
      ORDER BY player_pitching_stats.year DESC, player_pitching_stats.team_id ASC, player_pitching_stats.row_index ASC
      LIMIT ?`,
    )
    .all(...values, limit)
  return rows as PitchingLineRow[]
}

function compactNameSql(column: string): string {
  return `REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), char(12288), ''), '*', ''), '＊', '')`
}

function compactName(value: string): string {
  return value.replace(/[ \u3000*＊]/gu, '')
}

function teamAliases(team: string): string[] {
  const normalized = team.replace(/[・･.\-_\s\u3000]/gu, '').toLowerCase()
  const aliases: Record<string, string[]> = {
    ヤクルト: ['ヤクルト', '東京ヤクルトスワローズ'],
    東京ヤクルトスワローズ: ['ヤクルト', '東京ヤクルトスワローズ'],
    dena: ['DeNA', '横浜DeNAベイスターズ'],
    横浜denaベイスターズ: ['DeNA', '横浜DeNAベイスターズ'],
    横浜: ['DeNA', '横浜DeNAベイスターズ'],
    巨人: ['巨人', '読売ジャイアンツ'],
    読売ジャイアンツ: ['巨人', '読売ジャイアンツ'],
    中日: ['中日', '中日ドラゴンズ'],
    阪神: ['阪神', '阪神タイガース'],
    広島: ['広島', '広島東洋カープ'],
    オリックス: ['オリックス', 'オリックス・バファローズ'],
    ロッテ: ['ロッテ', '千葉ロッテマリーンズ'],
    西武: ['西武', '埼玉西武ライオンズ'],
    ソフトバンク: ['ソフトバンク', '福岡ソフトバンクホークス'],
    日本ハム: ['日本ハム', '北海道日本ハムファイターズ'],
    楽天: ['楽天', '東北楽天ゴールデンイーグルス'],
    セリーグ: ['巨人', '読売ジャイアンツ', 'ヤクルト', '東京ヤクルトスワローズ', 'DeNA', '横浜DeNAベイスターズ', '中日', '中日ドラゴンズ', '阪神', '阪神タイガース', '広島', '広島東洋カープ'],
    パリーグ: ['日本ハム', '北海道日本ハムファイターズ', '楽天', '東北楽天ゴールデンイーグルス', '西武', '埼玉西武ライオンズ', 'ロッテ', '千葉ロッテマリーンズ', 'オリックス', 'オリックス・バファローズ', 'ソフトバンク', '福岡ソフトバンクホークス'],
  }
  return [...new Set(aliases[normalized] ?? [team])]
}
