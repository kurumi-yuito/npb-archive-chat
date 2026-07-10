import { readdirSync } from 'node:fs'
import path from 'node:path'
import type { SqliteDatabase } from './sqlite'
import { openDatabase, withTransaction } from './sqlite'
import { migrateDatabase } from './migrations'

export type PlayerIdentityMaintenanceResult = {
  playerProfilesUpdated: number
  playerAliasesUpserted: number
  playerSourcesUpserted: number
  rosterPlayerIdsBackfilled: number
  playerStatIdsBackfilled: number
  eventSourceUrlsBackfilled: number
}

export type PlayerIdentityBackfillArgs = {
  sqliteDir?: string
  sqlitePath?: string
  year?: number
  dryRun?: boolean
}

export type PlayerIdentityBackfillYearResult = {
  year: number
  sqlitePath: string
  result: PlayerIdentityMaintenanceResult | null
}

export type PlayerIdentityBackfillResult = {
  sqliteDir: string | null
  sqlitePath: string | null
  years: PlayerIdentityBackfillYearResult[]
  totals: PlayerIdentityMaintenanceResult
  dryRun: boolean
}

export function parsePlayerIdentityBackfillArgs(argv: string[]): PlayerIdentityBackfillArgs {
  const args = [...argv]
  while (args[0] === '--') {
    args.shift()
  }
  const result: PlayerIdentityBackfillArgs = {}
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--sqlite-dir') {
      result.sqliteDir = args.shift()
      continue
    }
    if (arg?.startsWith('--sqlite-dir=')) {
      result.sqliteDir = arg.slice('--sqlite-dir='.length)
      continue
    }
    if (arg === '--sqlite-path') {
      result.sqlitePath = args.shift()
      continue
    }
    if (arg?.startsWith('--sqlite-path=')) {
      result.sqlitePath = arg.slice('--sqlite-path='.length)
      continue
    }
    if (arg === '--year') {
      const value = args.shift()
      result.year = value ? Number(value) : undefined
      continue
    }
    if (arg?.startsWith('--year=')) {
      result.year = Number(arg.slice('--year='.length))
      continue
    }
    if (arg === '--dry-run') {
      result.dryRun = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return result
}

function parseYearFromSqlitePath(sqlitePath: string): number | null {
  const match = path.basename(sqlitePath).match(/^npb-(\d{4})\.sqlite$/u)
  if (!match) {
    return null
  }
  return Number(match[1])
}

type ProfileRow = {
  player_id: string
  full_name: string
  canonical_name: string | null
  current_team: string | null
  team_name: string | null
  year_teams_json: string | null
  source_url: string
  fetched_at: string
}

type RosterRow = {
  year: number
  team_id: string
  team_name: string
  player_id: string | null
  player_name: string
  source_url: string
}

type PlayerStatRow = {
  year: number
  team_id: string
  team_name: string
  player_id: string | null
  player_name: string
  source_url: string
}

const CURRENT_YEAR = new Date().getFullYear()

export function materializePlayerIdentityArtifacts(
  database: SqliteDatabase,
  year: number,
): PlayerIdentityMaintenanceResult {
  return withTransaction(database, () => {
    const profiles = database.prepare(
      `SELECT
        player_id,
        full_name,
        canonical_name,
        current_team,
        team_name,
        year_teams_json,
        source_url,
        fetched_at
      FROM player_profiles
      WHERE player_id IS NOT NULL AND player_id <> ''`,
    ).all() as ProfileRow[]

    let playerProfilesUpdated = 0
    let playerAliasesUpserted = 0
    let playerSourcesUpserted = 0
    let rosterPlayerIdsBackfilled = 0
    let playerStatIdsBackfilled = 0
    let eventSourceUrlsBackfilled = 0

    const upsertProfile = database.prepare(
      `INSERT INTO player_profiles (
        player_id,
        full_name,
        team_name,
        year_teams_json,
        source_url,
        fetched_at,
        canonical_name,
        current_team,
        active,
        metadata,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET
        full_name = excluded.full_name,
        team_name = excluded.team_name,
        year_teams_json = excluded.year_teams_json,
        source_url = excluded.source_url,
        fetched_at = excluded.fetched_at,
        canonical_name = excluded.canonical_name,
        current_team = excluded.current_team,
        active = excluded.active,
        metadata = excluded.metadata,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at`,
    )
    const upsertAlias = database.prepare(
      `INSERT INTO player_aliases (
        player_id,
        alias,
        normalized_alias,
        alias_type,
        source_type,
        source_key,
        season_from,
        season_to,
        confidence,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id, normalized_alias, source_type, source_key, season_from, season_to) DO UPDATE SET
        alias = excluded.alias,
        alias_type = excluded.alias_type,
        confidence = excluded.confidence,
        updated_at = excluded.updated_at`,
    )
    const upsertSource = database.prepare(
      `INSERT INTO player_sources (
        player_id,
        source_type,
        source_url,
        normalized_source_url,
        source_key,
        season,
        team,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id, source_type, source_key, normalized_source_url) DO UPDATE SET
        source_url = excluded.source_url,
        season = excluded.season,
        team = excluded.team,
        updated_at = excluded.updated_at`,
    )
    const updateCurrentTeamRoster = database.prepare(
      `UPDATE current_team_roster
       SET player_id = ?
       WHERE year = ? AND team_id = ? AND player_name = ? AND (player_id IS NULL OR player_id = '')`,
    )
    const updateEventsSourceUrl = database.prepare(
      `UPDATE events
       SET source_url = (
         SELECT source_snapshots.source_url
         FROM source_snapshots
         WHERE source_snapshots.game_id = events.game_id
           AND source_snapshots.source_key = 'playbyplay'
         LIMIT 1
       )
       WHERE (events.source_url IS NULL OR events.source_url = '')
         AND EXISTS (
           SELECT 1
           FROM source_snapshots
           WHERE source_snapshots.game_id = events.game_id
             AND source_snapshots.source_key = 'playbyplay'
       )`,
    )

    const currentYear = year
    for (const profile of profiles) {
      const canonicalName = profile.canonical_name?.trim() || profile.full_name.trim()
      const currentTeam = profile.current_team?.trim() || profile.team_name?.trim() || null
      const active = year === CURRENT_YEAR ? 1 : 0
      const metadata = JSON.stringify({
        year_teams_json: profile.year_teams_json,
        source_url: profile.source_url,
      })
      upsertProfile.run(
        profile.player_id,
        profile.full_name,
        profile.team_name,
        profile.year_teams_json,
        profile.source_url,
        profile.fetched_at,
        canonicalName,
        currentTeam,
        active,
        metadata,
        profile.fetched_at,
        profile.fetched_at,
      )
      playerProfilesUpdated += 1

      const { seasonFrom, seasonTo } = parseYearRange(profile.year_teams_json)
      upsertAlias.run(
        profile.player_id,
        canonicalName,
        normalizeIdentityKey(canonicalName),
        'canonical_name',
        'player_profile',
        'profile',
        seasonFrom,
        seasonTo,
        1,
        profile.fetched_at,
        profile.fetched_at,
      )
      playerAliasesUpserted += 1
      upsertSource.run(
        profile.player_id,
        'player_profile',
        profile.source_url,
        normalizeSourceUrl(profile.source_url),
        'profile',
        seasonTo || currentYear,
        currentTeam,
        profile.fetched_at,
        profile.fetched_at,
      )
      playerSourcesUpserted += 1
    }

    const rosterRows = database.prepare(
      `SELECT year, team_id, team_name, player_id, player_name, source_url
       FROM current_team_roster`,
    ).all() as RosterRow[]
    for (const row of rosterRows) {
      const resolvedId = row.player_id || resolveProfileId(database, row.player_name, row.team_name) || null
      if (!resolvedId) continue
      if (!row.player_id) {
        updateCurrentTeamRoster.run(resolvedId, row.year, row.team_id, row.player_name)
        rosterPlayerIdsBackfilled += 1
      }
      upsertAlias.run(
        resolvedId,
        row.player_name,
        normalizeIdentityKey(row.player_name),
        'roster_name',
        'current_team_roster',
        `${row.year}:${row.team_id}`,
        row.year,
        row.year,
        0.95,
        row.source_url,
        row.source_url,
      )
      playerAliasesUpserted += 1
      upsertSource.run(
        resolvedId,
        'current_team_roster',
        row.source_url,
        normalizeSourceUrl(row.source_url),
        `${row.year}:${row.team_id}`,
        row.year,
        row.team_name,
        row.source_url,
        row.source_url,
      )
      playerSourcesUpserted += 1
    }

    for (const table of ['player_batting_stats', 'player_pitching_stats', 'player_fielding_stats'] as const) {
      const rows = database.prepare(
        `SELECT year, team_id, team_name, player_id, player_name, source_url FROM ${table}`,
      ).all() as PlayerStatRow[]
      for (const row of rows) {
        const resolvedId = row.player_id || resolveProfileId(database, row.player_name, row.team_name) || null
        if (!resolvedId) continue
        if (!row.player_id) {
          database.prepare(
            `UPDATE ${table}
             SET player_id = ?
             WHERE year = ? AND team_id = ? AND player_name = ? AND (player_id IS NULL OR player_id = '')`,
          ).run(resolvedId, row.year, row.team_id, row.player_name)
          playerStatIdsBackfilled += 1
        }
        upsertAlias.run(
          resolvedId,
          row.player_name,
          normalizeIdentityKey(row.player_name),
          table === 'player_batting_stats' ? 'batting_stat_name' : table === 'player_pitching_stats' ? 'pitching_stat_name' : 'fielding_stat_name',
          table,
          `${row.year}:${row.team_id}`,
          row.year,
          row.year,
          0.9,
          row.source_url,
          row.source_url,
        )
        playerAliasesUpserted += 1
        upsertSource.run(
          resolvedId,
          table,
          row.source_url,
          normalizeSourceUrl(row.source_url),
          `${row.year}:${row.team_id}`,
          row.year,
          row.team_name,
          row.source_url,
          row.source_url,
        )
        playerSourcesUpserted += 1
      }
    }

    updateEventsSourceUrl.run()
    eventSourceUrlsBackfilled = Number((database.prepare(
      `SELECT COUNT(*) AS count
       FROM events
       WHERE source_url IS NOT NULL AND source_url <> ''`,
    ).get() as { count: number }).count ?? 0)

    return {
      playerProfilesUpdated,
      playerAliasesUpserted,
      playerSourcesUpserted,
      rosterPlayerIdsBackfilled,
      playerStatIdsBackfilled,
      eventSourceUrlsBackfilled,
    }
  })
}

export function runPlayerIdentityBackfill(options: PlayerIdentityBackfillArgs): PlayerIdentityBackfillResult {
  const sqliteFiles = listYearSqliteFiles(options.sqliteDir, options.sqlitePath, options.year)
  const totals: PlayerIdentityMaintenanceResult = {
    playerProfilesUpdated: 0,
    playerAliasesUpserted: 0,
    playerSourcesUpserted: 0,
    rosterPlayerIdsBackfilled: 0,
    playerStatIdsBackfilled: 0,
    eventSourceUrlsBackfilled: 0,
  }
  const years: PlayerIdentityBackfillYearResult[] = []
  for (const { year, sqlitePath } of sqliteFiles) {
    if (options.dryRun) {
      years.push({ year, sqlitePath, result: null })
      continue
    }
    const database = openDatabase(sqlitePath)
    try {
      migrateDatabase(database)
      const result = materializePlayerIdentityArtifacts(database, year)
      accumulateMaintenanceTotals(totals, result)
      years.push({ year, sqlitePath, result })
    } finally {
      database.close()
    }
  }

  return {
    sqliteDir: options.sqliteDir ?? null,
    sqlitePath: options.sqlitePath ?? null,
    years,
    totals,
    dryRun: options.dryRun === true,
  }
}

function resolveProfileId(database: SqliteDatabase, name: string, team: string | null): string | null {
  const normalized = normalizeIdentityKey(name)
  const rows = database.prepare(
    `SELECT player_id, COALESCE(canonical_name, full_name) AS canonical_name, current_team, team_name
     FROM player_profiles
     WHERE REPLACE(REPLACE(COALESCE(canonical_name, full_name), ' ', ''), char(12288), '') = ?
     UNION ALL
     SELECT player_profiles.player_id, COALESCE(player_profiles.canonical_name, player_profiles.full_name) AS canonical_name, player_profiles.current_team, player_profiles.team_name
     FROM player_aliases
     INNER JOIN player_profiles ON player_profiles.player_id = player_aliases.player_id
     WHERE player_aliases.normalized_alias = ?`,
  ).all(normalized, normalized) as Array<{ player_id: string; canonical_name: string | null; current_team: string | null; team_name: string | null }>
  const deduped = [...new Map(rows.map((row) => [row.player_id, row])).values()]
  if (deduped.length === 0) {
    return null
  }
  if (deduped.length === 1) {
    return deduped[0]?.player_id ?? null
  }
  if (team) {
    const exactTeam = deduped.find((row) => sameTeam(row.current_team ?? row.team_name, team))
    if (exactTeam) {
      return exactTeam.player_id
    }
  }
  return null
}

function normalizeIdentityKey(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[・･.\-_\s\u3000]/gu, '')
    .toLowerCase()
}

function normalizeSourceUrl(value: string): string {
  return value.trim().replace(/#.*$/u, '')
}

function parseYearRange(yearTeamsJson: string | null): { seasonFrom: number; seasonTo: number } {
  if (!yearTeamsJson) {
    return { seasonFrom: 0, seasonTo: 0 }
  }
  try {
    const data = JSON.parse(yearTeamsJson) as Record<string, string>
    const years = Object.keys(data).map((value) => Number(value)).filter((value) => Number.isFinite(value))
    if (years.length === 0) {
      return { seasonFrom: 0, seasonTo: 0 }
    }
    return { seasonFrom: Math.min(...years), seasonTo: Math.max(...years) }
  } catch {
    return { seasonFrom: 0, seasonTo: 0 }
  }
}

function sameTeam(left: string | null | undefined, right: string): boolean {
  if (!left) return false
  const normalizedLeft = left.replace(/[・･.\-_\s\u3000]/gu, '').toLowerCase()
  const normalizedRight = right.replace(/[・･.\-_\s\u3000]/gu, '').toLowerCase()
  return normalizedLeft === normalizedRight
}

function listYearSqliteFiles(
  sqliteDir: string | undefined,
  sqlitePath: string | undefined,
  year: number | undefined,
): Array<{ year: number; sqlitePath: string }> {
  if (sqlitePath) {
    return [{ year: year ?? parseYearFromSqlitePath(sqlitePath) ?? CURRENT_YEAR, sqlitePath: path.resolve(sqlitePath) }]
  }
  const dir = path.resolve(sqliteDir ?? 'data')
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = entry.name.match(/^npb-(\d{4})\.sqlite$/u)
      if (!match) {
        return null
      }
      return {
        year: Number(match[1]),
        sqlitePath: path.join(dir, entry.name),
      }
    })
    .filter((value): value is { year: number; sqlitePath: string } => Boolean(value))
    .sort((left, right) => left.year - right.year)
}

function accumulateMaintenanceTotals(
  totals: PlayerIdentityMaintenanceResult,
  result: PlayerIdentityMaintenanceResult,
): void {
  totals.playerProfilesUpdated += result.playerProfilesUpdated
  totals.playerAliasesUpserted += result.playerAliasesUpserted
  totals.playerSourcesUpserted += result.playerSourcesUpserted
  totals.rosterPlayerIdsBackfilled += result.rosterPlayerIdsBackfilled
  totals.playerStatIdsBackfilled += result.playerStatIdsBackfilled
  totals.eventSourceUrlsBackfilled += result.eventSourceUrlsBackfilled
}
