import {
  searchBattingLinesFiltersSchema,
  type SearchBattingLinesFilters,
} from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import { toJapaneseTeamAliases } from './team-name-utils'

export type BattingLineRow = {
  gameId: string
  gameDate: string
  team: string
  playerName: string
  battingOrder: number | null
  position: string | null
  atBats: number
  runs: number
  hits: number
  runsBattedIn: number
  stolenBases: number
  strikeouts: number | null
  walks: number | null
  rawText: string | null
  sourceKind?: 'box' | 'bis_batting'
  sourceUrl?: string | null
  statsJson?: string | null
}

export async function searchBattingLines(
  database: QueryDatabase,
  filters: SearchBattingLinesFilters = {},
): Promise<BattingLineRow[]> {
  const normalized = searchBattingLinesFiltersSchema.parse(filters)
  const limit = normalized.limit ?? 50
  // batting_order / position are box-score-only fields; BIS stats don't have them.
  // Skip BIS entirely when either is specified to avoid returning unfiltered season stats.
  const skipBis = normalized.game_date || normalized.game_id || normalized.recent
    || normalized.batting_order !== undefined || normalized.position !== undefined
  const currentRows = skipBis
    ? []
    : await searchCurrentBattingStats(database, normalized, limit)
  if (currentRows.length > 0) {
    return currentRows
  }

  const clauses: string[] = []
  const values: Array<string | number> = []

  if (normalized.game_date) {
    clauses.push('games.date = ?')
    values.push(normalized.game_date)
  }
  if (normalized.game_id) {
    clauses.push('batting_lines.game_id = ?')
    values.push(normalized.game_id)
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
  if (normalized.player_id) {
    addBattingLinePlayerIdFilter(clauses, values, normalized.player_id, normalized.player_name)
  } else if (normalized.player_name) {
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
  if (normalized.batting_order !== undefined) {
    clauses.push('batting_lines.batting_order = ?')
    values.push(normalized.batting_order)
  }
  if (normalized.position) {
    // Match "(遊)" (starter), "遊" (bare), and composite forms like "打遊" (sub→SS).
    clauses.push("batting_lines.position LIKE ?")
    values.push(`%${normalized.position}%`)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

  const rows = await database
    .prepare(
      `SELECT
        batting_lines.game_id AS gameId,
        games.date AS gameDate,
        batting_lines.team AS team,
        batting_lines.player_name AS playerName,
        batting_lines.batting_order AS battingOrder,
        batting_lines.position AS position,
        batting_lines.at_bats AS atBats,
        batting_lines.runs AS runs,
        batting_lines.hits AS hits,
        batting_lines.runs_batted_in AS runsBattedIn,
        batting_lines.stolen_bases AS stolenBases,
        batting_lines.strikeouts AS strikeouts,
        batting_lines.walks AS walks,
        batting_lines.raw_text AS rawText,
        'box' AS sourceKind,
        COALESCE(batting_lines.source_url, box_source.source_url) AS sourceUrl,
        NULL AS statsJson
      FROM batting_lines
      INNER JOIN games ON games.game_id = batting_lines.game_id
      LEFT JOIN source_snapshots AS box_source
        ON box_source.game_id = batting_lines.game_id
       AND box_source.source_key = 'box'
      ${whereClause}
      ORDER BY games.date ${normalized.recent ? 'DESC' : 'ASC'}, batting_lines.game_id ASC, batting_lines.row_index ASC
      LIMIT ?`,
    )
    .all(...values, limit)
  return rows as BattingLineRow[]
}

async function searchCurrentBattingStats(
  database: QueryDatabase,
  filters: SearchBattingLinesFilters,
  limit: number,
): Promise<BattingLineRow[]> {
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
    const teams = teamAliases(filters.team)
    clauses.push(`player_batting_stats.team_name IN (${teams.map(() => '?').join(', ')})`)
    values.push(...teams)
  }
  if (filters.player_id) {
    clauses.push(`(
      player_batting_stats.player_id = ?
      OR EXISTS (
        SELECT 1
        FROM current_team_roster
        WHERE current_team_roster.year = player_batting_stats.year
          AND current_team_roster.team_id = player_batting_stats.team_id
          AND current_team_roster.player_id = ?
          AND ${compactNameSql('current_team_roster.player_name')} = ${compactNameSql('player_batting_stats.player_name')}
      )
    )`)
    values.push(filters.player_id, filters.player_id)
  } else if (filters.player_name) {
    clauses.push(`${compactNameSql('player_batting_stats.player_name')} LIKE ?`)
    values.push(`%${compactName(filters.player_name)}%`)
  }
  if (filters.result_text_contains) {
    clauses.push('player_batting_stats.values_json LIKE ?')
    values.push(`%${filters.result_text_contains}%`)
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = await database
    .prepare(
      `SELECT
        'bis:' || player_batting_stats.year || ':' || player_batting_stats.team_id || ':idb1' AS gameId,
        printf('%04d-01-01', player_batting_stats.year) AS gameDate,
        player_batting_stats.team_name AS team,
        player_batting_stats.player_name AS playerName,
        NULL AS battingOrder,
        NULL AS position,
        CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.打数'), '0') AS INTEGER) AS atBats,
        CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.得点'), '0') AS INTEGER) AS runs,
        CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.安打'), '0') AS INTEGER) AS hits,
        CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.打点'), '0') AS INTEGER) AS runsBattedIn,
        CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.盗塁'), '0') AS INTEGER) AS stolenBases,
        CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.三振'), '0') AS INTEGER) AS strikeouts,
        CAST(COALESCE(json_extract(player_batting_stats.values_json, '$.四球'), '0') AS INTEGER) AS walks,
        player_batting_stats.values_json AS rawText,
        'bis_batting' AS sourceKind,
        player_batting_stats.source_url AS sourceUrl,
        player_batting_stats.values_json AS statsJson
      FROM player_batting_stats
      ${whereClause}
      ORDER BY player_batting_stats.year DESC, player_batting_stats.team_id ASC, player_batting_stats.row_index ASC
      LIMIT ?`,
    )
    .all(...values, limit)
  return rows as BattingLineRow[]
}

function compactNameSql(column: string): string {
  return `REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), char(12288), ''), '*', ''), '＊', '')`
}

function compactName(value: string): string {
  return value.replace(/[ \u3000*＊]/gu, '')
}

function playerIdPattern(playerId: string): string {
  return `%${playerId}.html%`
}

function addBattingLinePlayerIdFilter(
  clauses: string[],
  values: Array<string | number>,
  playerId: string,
  playerName?: string,
): void {
  const pattern = playerIdPattern(playerId)
  const nameFallback = playerName
    ? `OR ${compactNameSql('?')} LIKE ${compactNameSql('batting_lines.player_name')} || '%'`
    : ''
  clauses.push(
    `(
      batting_lines.player_url LIKE ?
      ${nameFallback}
    )`,
  )
  values.push(pattern)
  if (playerName) {
    values.push(playerName)
  }
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
