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

async function fetchProfileNamesForIds(
  database: QueryDatabase,
  playerIds: string[],
): Promise<Map<string, string>> {
  if (playerIds.length === 0) return new Map()
  const placeholders = playerIds.map(() => '?').join(', ')
  try {
    const rows = await database
      .prepare(`SELECT player_id, full_name FROM player_profiles WHERE player_id IN (${placeholders})`)
      .all(...playerIds) as Array<{ player_id: string; full_name: string }>
    return new Map(rows.map((r) => [r.player_id, r.full_name]))
  } catch {
    return new Map()
  }
}

async function resolvePlayerIdsFromProfiles(
  database: QueryDatabase,
  aliases: string[],
): Promise<string[]> {
  if (aliases.length === 0) return []
  const values: string[] = []
  const clauses: string[] = []
  for (const alias of aliases) {
    const compact = alias.replace(/[ 　]/gu, '')
    const normalized = alias.replace(/[　]/gu, ' ').trim()
    values.push(compact, `${normalized} %`)
    clauses.push(
      `(REPLACE(REPLACE(player_profiles.full_name,' ',''),char(12288),'') = ? OR player_profiles.full_name LIKE ?)`,
    )
  }
  try {
    const rows = await database
      .prepare(`SELECT player_id FROM player_profiles WHERE ${clauses.join(' OR ')} LIMIT 30`)
      .all(...values) as Array<{ player_id: string }>
    const ids = [...new Set(rows.map((r) => r.player_id))]
    // Only filter when the profile lookup yields a unique player — multiple matches mean the input
    // is an ambiguous surname and filtering would incorrectly narrow to the first hit.
    return ids.length === 1 ? ids : []
  } catch {
    return []
  }
}

export async function searchPlayerCandidates(
  database: QueryDatabase,
  filters: SearchPlayerCandidatesFilters,
): Promise<PlayerCandidate[]> {
  const aliases = uniqueStrings([filters.name, ...(filters.aliases ?? [])])
  if (aliases.length === 0) {
    return []
  }

  const profilePlayerIds = await resolvePlayerIdsFromProfiles(database, [filters.name])

  const rows: RawPlayerMention[] = []
  rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
    sql: 'SELECT current_team_roster.player_name AS name, current_team_roster.player_id AS player_url, ? AS role, current_team_roster.team_name AS team, current_team_roster.year AS year FROM current_team_roster',
    role: 'bis_roster',
    nameColumn: 'current_team_roster.player_name',
    yearColumn: 'current_team_roster.year',
  }))
  rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
    sql: 'SELECT player_batting_stats.player_name AS name, player_batting_stats.player_id AS player_url, ? AS role, player_batting_stats.team_name AS team, player_batting_stats.year AS year FROM player_batting_stats',
    role: 'bis_batting',
    nameColumn: 'player_batting_stats.player_name',
    yearColumn: 'player_batting_stats.year',
  }))
  rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
    sql: 'SELECT player_pitching_stats.player_name AS name, player_pitching_stats.player_id AS player_url, ? AS role, player_pitching_stats.team_name AS team, player_pitching_stats.year AS year FROM player_pitching_stats',
    role: 'bis_pitching',
    nameColumn: 'player_pitching_stats.player_name',
    yearColumn: 'player_pitching_stats.year',
  }))
  rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
    sql: `SELECT events.batter_name AS name, COALESCE(NULLIF(events.batter_url, ''), CASE WHEN json_valid(events.event_attributes_json) THEN json_extract(events.event_attributes_json, '$.batter_links[0].url') ELSE NULL END) AS player_url, ? AS role, events.offense_team AS team, games.year AS year FROM events INNER JOIN games ON games.game_id = events.game_id`,
    role: 'batter',
    nameColumn: 'events.batter_name',
    yearColumn: 'games.year',
  }))
  rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
    sql: 'SELECT events.pitcher_name AS name, NULLIF(events.pitcher_url, \'\') AS player_url, ? AS role, NULL AS team, games.year AS year FROM events INNER JOIN games ON games.game_id = events.game_id',
    role: 'pitcher',
    nameColumn: 'events.pitcher_name',
    yearColumn: 'games.year',
  }))
  rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
    sql: 'SELECT events.runner_name AS name, NULLIF(events.runner_url, \'\') AS player_url, ? AS role, events.offense_team AS team, games.year AS year FROM events INNER JOIN games ON games.game_id = events.game_id',
    role: 'runner',
    nameColumn: 'events.runner_name',
    yearColumn: 'games.year',
  }))
  rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
    sql: 'SELECT batting_lines.player_name AS name, NULLIF(batting_lines.player_url, \'\') AS player_url, ? AS role, batting_lines.team AS team, games.year AS year FROM batting_lines INNER JOIN games ON games.game_id = batting_lines.game_id',
    role: 'batter',
    nameColumn: 'batting_lines.player_name',
    yearColumn: 'games.year',
  }))
  rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
    sql: 'SELECT pitching_lines.pitcher_name AS name, NULLIF(pitching_lines.pitcher_url, \'\') AS player_url, ? AS role, pitching_lines.team AS team, games.year AS year FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id',
    role: 'pitcher',
    nameColumn: 'pitching_lines.pitcher_name',
    yearColumn: 'games.year',
  }))
  rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
    sql: 'SELECT roster_entries.player_name AS name, NULLIF(roster_entries.player_url, \'\') AS player_url, ? AS role, roster_entries.team AS team, games.year AS year FROM roster_entries INNER JOIN games ON games.game_id = roster_entries.game_id',
    role: 'roster',
    nameColumn: 'roster_entries.player_name',
    yearColumn: 'games.year',
  }))

  const candidateRows = filters.latestOnly ? latestMentionRows(rows) : rows
  let candidates = mergeFallbackCandidates(groupPlayerMentions(candidateRows, aliases))

  if (profilePlayerIds.length > 0) {
    // When we know exactly which player the input refers to (unique profile match),
    // only keep candidates that are that player. If none exist in this year range,
    // return empty so the caller can handle not_found / year-shift fallback.
    candidates = candidates.filter((c) => c.player_id && profilePlayerIds.includes(c.player_id))
  } else if (filters.name.replace(/[ 　]/gu, '').length > 2) {
    // No profile found for the input (player not in current NPB registry).
    // For full-name inputs (>2 compact chars), filter out all player_id candidates whose
    // profile name is incompatible with the input. This prevents "村上宗隆" from resolving
    // to "村上 頌樹" (13315153, 阪神) — a different player who happens to share the surname.
    const playerIdsToCheck = [...new Set(
      candidates.filter((c) => c.player_id).map((c) => c.player_id as string),
    )]
    if (playerIdsToCheck.length > 0) {
      const inputCompact = filters.name.replace(/[ 　]/gu, '')
      const profileNames = await fetchProfileNamesForIds(database, playerIdsToCheck)
      candidates = candidates.filter((c) => {
        if (!c.player_id) return true
        const profileFullName = profileNames.get(c.player_id)
        if (!profileFullName) return true
        const profileCompact = profileFullName.replace(/[ 　]/gu, '')
        return inputCompact.startsWith(profileCompact) || profileCompact.startsWith(inputCompact)
      })
    }
  }

  return candidates.slice(0, filters.limit ?? 10)
}

type RawPlayerMention = {
  name: string | null
  player_url: string | null
  role: string
  team: string | null
  year: number
}

async function queryRawPlayerMentions(
  database: QueryDatabase,
  aliases: string[],
  filters: SearchPlayerCandidatesFilters,
  source: {
    sql: string
    role: string
    nameColumn: string
    yearColumn: string
  },
): Promise<RawPlayerMention[]> {
  const values: Array<string | number> = [source.role]
  const clauses = [`${source.nameColumn} IS NOT NULL`, `${source.nameColumn} <> ''`]
  clauses.push(`(${
    aliases.map((alias) => {
      const compact = alias.replace(/[ 　]/gu, '')
      values.push(compact, `%${compact}%`)
      return `(${compactNameCol(source.nameColumn)} = ? OR ${compactNameCol(source.nameColumn)} LIKE ?)`
    }).join(' OR ')
  })`)
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
    .all(...values, Math.max((filters.limit ?? 10) * 50, 200)) as RawPlayerMention[]
}

function groupPlayerMentions(rows: RawPlayerMention[], aliases: string[]): PlayerCandidate[] {
  const groups = new Map<string, {
    player_id: string | null
    name: string
    roles: string[]
    teams: string[]
    teamMentions: string[]
    years: number[]
  }>()

  for (const row of rows) {
    const name = row.name?.trim()
    if (!name) {
      continue
    }
    const playerId = normalizePlayerId(row.player_url)
    const key = playerId ?? `${name}|${row.team ?? ''}`
    const group = groups.get(key) ?? {
      player_id: playerId,
      name,
      roles: [],
      teams: [],
      teamMentions: [],
      years: [],
    }
    group.roles.push(row.role)
    if (row.team) {
      group.teams.push(row.team)
      group.teamMentions.push(row.team)
    }
    if (Number.isFinite(row.year)) {
      group.years.push(Number(row.year))
    }
    groups.set(key, group)
  }

  return [...groups.values()]
    .map((group) => ({
      player_id: group.player_id,
      name: group.name,
      primary_team: mode(group.teamMentions),
      roles: unique(group.roles),
      teams: unique(group.teams),
      years: unique(group.years).sort((a, b) => a - b),
    }))
    .sort((left, right) => {
      const leftExact = aliases.includes(left.name) ? 0 : 1
      const rightExact = aliases.includes(right.name) ? 0 : 1
      if (leftExact !== rightExact) return leftExact - rightExact
      const leftId = left.player_id ? 0 : 1
      const rightId = right.player_id ? 0 : 1
      if (leftId !== rightId) return leftId - rightId
      return left.name.localeCompare(right.name, 'ja')
    })
}

function latestMentionRows(rows: RawPlayerMention[]): RawPlayerMention[] {
  const latestYear = Math.max(...rows.map((row) => Number(row.year)).filter(Number.isFinite))
  if (!Number.isFinite(latestYear)) {
    return rows
  }
  return rows.filter((row) => Number(row.year) === latestYear)
}

function normalizePlayerId(playerUrl: string | null): string | null {
  if (!playerUrl) {
    return null
  }
  const match = playerUrl.match(/\/players\/([^/]+)\.html/u)
  if (match?.[1]) {
    return match[1]
  }
  return playerUrl
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])]
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

  // First pass: populate merged with all player_id candidates so they can act as merge targets
  for (const candidate of candidates) {
    if (candidate.player_id) {
      merged.push(candidate)
    }
  }

  // Second pass: try to fold no-player_id candidates into an existing player_id candidate
  for (const candidate of candidates) {
    if (candidate.player_id) {
      continue
    }

    const target = merged.find((current) =>
      current.player_id &&
      samePlayerName(current.name, candidate.name) &&
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

function compactNameCol(col: string): string {
  return `REPLACE(REPLACE(${col}, ' ', ''), char(12288), '')`
}

function samePlayerName(a: string, b: string): boolean {
  if (a === b) return true
  // Strip BIS annotation prefixes (*, ＊, +, ＋) and whitespace before comparing
  const normalize = (s: string) => s.replace(/^[*＊+＋\s　]+/u, '').replace(/[\s　]/gu, '')
  const na = normalize(a)
  const nb = normalize(b)
  return na === nb || na.startsWith(nb) || nb.startsWith(na)
}

function sameTeamAlias(left: string, right: string): boolean {
  return teamAliasKey(left) === teamAliasKey(right)
}

function teamAliasKey(team: string): string {
  const normalized = team.replace(/[・･.\-_\s\u3000]/gu, '')
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
