import path from 'node:path'
import { findWorkspaceRoot } from '@npb/crawler'
import {
  emptyBisCurrentDataset,
  parseBisGenericTeamTableHtml,
  parseBisPlayerProfileHtml,
  parseBisPlayerStatsHtml,
  parseBisTeamMonthlyResultsHtml,
  parseBisTeamRosterHtml,
  type BisCurrentDataset,
  type BisSourceType,
  type BisTeamInfo,
} from '@npb/parser'
import { migrateDatabase } from './migrations'
import { createObjectStorage, defaultR2Bucket, parseStorageArg, type ObjectStorage, type StorageArgs } from './object-storage'
import { openDatabase, type SqliteDatabase } from './sqlite'
import { withTransaction } from './sqlite'
import { materializePlayerIdentityArtifacts } from './player-identity-maintenance'

const DEFAULT_SQLITE_DIR = 'data'
const DEFAULT_USER_AGENT = 'npb-archive-chat/0.1 (+https://npb.jp/)'
const BIS_FETCH_ATTEMPTS = 3
const BIS_FETCH_RETRY_DELAY_MS = 750

export class BisFetchHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`BIS fetch failed: ${url} (HTTP ${status})`)
    this.name = 'BisFetchHttpError'
  }
}

export const BIS_TEAMS: BisTeamInfo[] = [
  { teamId: 'g', teamName: '読売ジャイアンツ' },
  { teamId: 's', teamName: '東京ヤクルトスワローズ' },
  { teamId: 'db', teamName: '横浜DeNAベイスターズ' },
  { teamId: 'd', teamName: '中日ドラゴンズ' },
  { teamId: 't', teamName: '阪神タイガース' },
  { teamId: 'c', teamName: '広島東洋カープ' },
  { teamId: 'f', teamName: '北海道日本ハムファイターズ' },
  { teamId: 'e', teamName: '東北楽天ゴールデンイーグルス' },
  { teamId: 'l', teamName: '埼玉西武ライオンズ' },
  { teamId: 'm', teamName: '千葉ロッテマリーンズ' },
  { teamId: 'b', teamName: 'オリックス・バファローズ' },
  { teamId: 'h', teamName: '福岡ソフトバンクホークス' },
]

export type UpdateBisCurrentArgs = StorageArgs & {
  year?: number
  team?: string
  sqlitePath?: string
  sqliteDir?: string
  workspaceRoot?: string
  delayMs?: number
  userAgent?: string
  dryRun?: boolean
}

export type UpdateBisCurrentResult = {
  year: number
  teams: number
  sourceSnapshots: number
  currentTeamRoster: number
  teamIndex: number
  teamYearlyStats: number
  playerBattingStats: number
  playerPitchingStats: number
  playerFieldingStats: number
  teamMonthlyResults: number
  sqlitePath: string
  rawDir: string
  structuredPath: string
  dryRun: boolean
}

export function parseUpdateBisCurrentArgs(argv: string[]): UpdateBisCurrentArgs {
  const args = [...argv]
  while (args[0] === '--') {
    args.shift()
  }
  const result: UpdateBisCurrentArgs = {}
  while (args.length > 0) {
    const arg = args.shift()
    if (parseStorageArg(arg, () => args.shift(), result)) {
      continue
    }
    if (arg === '--year') {
      result.year = parsePositiveInteger(args.shift(), 'year')
      continue
    }
    if (arg?.startsWith('--year=')) {
      result.year = parsePositiveInteger(arg.slice('--year='.length), 'year')
      continue
    }
    if (arg === '--team') {
      result.team = args.shift()
      continue
    }
    if (arg?.startsWith('--team=')) {
      result.team = arg.slice('--team='.length)
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
    if (arg === '--sqlite-dir') {
      result.sqliteDir = args.shift()
      continue
    }
    if (arg?.startsWith('--sqlite-dir=')) {
      result.sqliteDir = arg.slice('--sqlite-dir='.length)
      continue
    }
    if (arg === '--workspace-root') {
      result.workspaceRoot = args.shift()
      continue
    }
    if (arg?.startsWith('--workspace-root=')) {
      result.workspaceRoot = arg.slice('--workspace-root='.length)
      continue
    }
    if (arg === '--delay-ms') {
      result.delayMs = parseNonNegativeInteger(args.shift(), 'delay-ms')
      continue
    }
    if (arg?.startsWith('--delay-ms=')) {
      result.delayMs = parseNonNegativeInteger(arg.slice('--delay-ms='.length), 'delay-ms')
      continue
    }
    if (arg === '--user-agent') {
      result.userAgent = args.shift()
      continue
    }
    if (arg?.startsWith('--user-agent=')) {
      result.userAgent = arg.slice('--user-agent='.length)
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

export async function runBisCurrentUpdate(options: UpdateBisCurrentArgs): Promise<UpdateBisCurrentResult> {
  const year = options.year ?? new Date().getFullYear()
  const workspaceRoot = path.resolve(options.workspaceRoot ?? (await findWorkspaceRoot(process.cwd())))
  const sqlitePath = resolveBisCurrentSqlitePath(workspaceRoot, year, options)
  const storage = createObjectStorage({
    mode: options.storage,
    workspaceRoot,
    bucket: options.r2Bucket ?? defaultR2Bucket(),
    prefix: options.r2Prefix,
    endpoint: options.r2Endpoint,
  })
  const rawDir = path.join(workspaceRoot, 'data', 'raw', 'bis', String(year))
  const structuredKey = `structured/bis/${year}/bis-current.json`
  const structuredPath = storage.localPath(structuredKey)
  const teams = selectTeams(options.team)

  if (options.dryRun) {
    return emptyResult(year, teams.length, sqlitePath, rawDir, structuredPath, true)
  }

  const dataset = emptyBisCurrentDataset(year)
  dataset.teams.push(...teams)
  for (const team of teams) {
    await loadTeamBisPages(dataset, { year, team, storage, delayMs: options.delayMs, userAgent: options.userAgent })
  }

  for (const snapshot of dataset.sourceSnapshots) {
    snapshot.structuredPath = path.relative(workspaceRoot, structuredPath)
  }
  await storage.putText(structuredKey, `${JSON.stringify(dataset, null, 2)}\n`, 'application/json; charset=utf-8')

  const db = openDatabase(sqlitePath)
  try {
    migrateDatabase(db)
    loadBisCurrentDataset(db, dataset)
  } finally {
    db.close()
  }

  await runPlayerProfilesUpdate({
    sqlitePath,
    year,
    delayMs: options.delayMs,
    userAgent: options.userAgent,
  })

  return {
    year,
    teams: teams.length,
    sourceSnapshots: dataset.sourceSnapshots.length,
    currentTeamRoster: dataset.currentTeamRoster.length,
    teamIndex: dataset.teamIndex.length,
    teamYearlyStats: dataset.teamYearlyStats.length,
    playerBattingStats: dataset.playerBattingStats.length,
    playerPitchingStats: dataset.playerPitchingStats.length,
    playerFieldingStats: dataset.playerFieldingStats.length,
    teamMonthlyResults: dataset.teamMonthlyResults.length,
    sqlitePath,
    rawDir,
    structuredPath,
    dryRun: false,
  }
}

export function resolveBisCurrentSqlitePath(
  workspaceRoot: string,
  year: number,
  options: Pick<UpdateBisCurrentArgs, 'sqlitePath' | 'sqliteDir'>,
): string {
  return path.resolve(
    workspaceRoot,
    options.sqlitePath ?? path.join(options.sqliteDir ?? DEFAULT_SQLITE_DIR, `npb-${year}.sqlite`),
  )
}

export function loadBisCurrentDataset(database: SqliteDatabase, dataset: BisCurrentDataset): void {
  withTransaction(database, () => {
    for (const source of dataset.sourceSnapshots) {
      database.prepare(
        `INSERT OR REPLACE INTO bis_source_snapshots (
          source_key, year, team_id, source_type, source_url, raw_path, structured_path, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(source.sourceKey, dataset.year, source.sourceKey.split(':')[2] ?? null, source.sourceType, source.sourceUrl, source.rawPath ?? null, source.structuredPath ?? null, source.fetchedAt)
    }
    for (const row of dataset.currentTeamRoster) {
      database.prepare(
        `INSERT OR REPLACE INTO current_team_roster (
          year, team_id, team_name, player_key, player_id, player_name, position,
          uniform_number, bats, throws, source_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(row.year, row.teamId, row.teamName, playerKey(row.playerId, row.playerName), row.playerId, row.playerName, row.position, row.uniformNumber, row.bats, row.throws, row.sourceUrl)
    }
    insertGenericRows(database, 'team_index', dataset.teamIndex)
    insertGenericRows(database, 'team_yearly_stats', dataset.teamYearlyStats)
    insertPlayerStatsRows(database, 'player_batting_stats', dataset.playerBattingStats)
    insertPlayerStatsRows(database, 'player_pitching_stats', dataset.playerPitchingStats)
    insertPlayerStatsRows(database, 'player_fielding_stats', dataset.playerFieldingStats)
    for (const row of dataset.teamMonthlyResults) {
      database.prepare(
        `INSERT OR REPLACE INTO team_monthly_results (
          year, team_id, team_name, month, row_index, game_date, values_json, source_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(row.year, row.teamId, row.teamName, row.month, row.rowIndex, row.gameDate, JSON.stringify(row.values), row.sourceUrl)
    }
  })
}

async function loadTeamBisPages(
  dataset: BisCurrentDataset,
  input: { year: number; team: BisTeamInfo; storage: ObjectStorage; delayMs?: number; userAgent?: string },
) {
  const pages = buildTeamPages(input.year, input.team.teamId)
  for (const page of pages) {
    let html: string
    try {
      html = await fetchOrReadRaw(page.url, `raw/bis/${input.year}/${page.key}.html`, input.storage, input.userAgent)
    } catch (error) {
      if (page.sourceType === 'team_monthly_results' && error instanceof BisFetchHttpError && error.status === 404) {
        continue
      }
      throw error
    }
    const rawPath = path.join('data', 'raw', 'bis', String(input.year), `${page.key}.html`)
    dataset.sourceSnapshots.push({
      sourceKey: `bis:${input.year}:${input.team.teamId}:${page.key}`,
      sourceType: page.sourceType,
      sourceUrl: page.url,
      rawPath,
      fetchedAt: new Date().toISOString(),
    })
    const common = { year: input.year, teamId: input.team.teamId, teamName: input.team.teamName, sourceUrl: page.url }
    if (page.sourceType === 'team_roster') {
      dataset.currentTeamRoster.push(...parseBisTeamRosterHtml(html, common))
    } else if (page.sourceType === 'team_index') {
      dataset.teamIndex.push(...parseBisGenericTeamTableHtml(html, common))
    } else if (page.sourceType === 'team_yearly_stats') {
      dataset.teamYearlyStats.push(...parseBisGenericTeamTableHtml(html, common))
    } else if (page.sourceType === 'player_batting_stats') {
      dataset.playerBattingStats.push(...parseBisPlayerStatsHtml(html, common))
    } else if (page.sourceType === 'player_pitching_stats') {
      dataset.playerPitchingStats.push(...parseBisPlayerStatsHtml(html, common))
    } else if (page.sourceType === 'player_fielding_stats') {
      dataset.playerFieldingStats.push(...parseBisPlayerStatsHtml(html, common))
    } else {
      dataset.teamMonthlyResults.push(...parseBisTeamMonthlyResultsHtml(html, { ...common, month: page.month ?? 0 }))
    }
    if (input.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
    }
  }
}

function buildTeamPages(year: number, teamId: string): Array<{ key: string; url: string; sourceType: BisSourceType; month?: number }> {
  return [
    { key: `rst_${teamId}`, url: `https://npb.jp/bis/teams/rst_${teamId}.html`, sourceType: 'team_roster' },
    { key: `index_${teamId}`, url: `https://npb.jp/bis/teams/index_${teamId}.html`, sourceType: 'team_index' },
    { key: `yearly_${teamId}`, url: `https://npb.jp/bis/teams/yearly_${teamId}.html`, sourceType: 'team_yearly_stats' },
    { key: `idb1_${teamId}`, url: `https://npb.jp/bis/${year}/stats/idb1_${teamId}.html`, sourceType: 'player_batting_stats' },
    { key: `idp1_${teamId}`, url: `https://npb.jp/bis/${year}/stats/idp1_${teamId}.html`, sourceType: 'player_pitching_stats' },
    { key: `idf1_${teamId}`, url: `https://npb.jp/bis/${year}/stats/idf1_${teamId}.html`, sourceType: 'player_fielding_stats' },
    { key: `idb2_${teamId}`, url: `https://npb.jp/bis/${year}/stats/idb2_${teamId}.html`, sourceType: 'player_batting_stats' },
    { key: `idp2_${teamId}`, url: `https://npb.jp/bis/${year}/stats/idp2_${teamId}.html`, sourceType: 'player_pitching_stats' },
    ...[3, 4, 5, 6, 7, 8, 9, 10].map((month) => ({
      key: `results_${teamId}_${String(month).padStart(2, '0')}`,
      url: `https://npb.jp/bis/teams/results_${teamId}_${String(month).padStart(2, '0')}.html`,
      sourceType: 'team_monthly_results' as const,
      month,
    })),
  ]
}

async function fetchOrReadRaw(url: string, key: string, storage: ObjectStorage, userAgent?: string): Promise<string> {
  const existing = await storage.getText(key)
  if (existing?.trim()) {
    return existing
  }

  let lastError: unknown
  for (let attempt = 1; attempt <= BIS_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': userAgent ?? DEFAULT_USER_AGENT } })
      if (response.ok) {
        const html = await response.text()
        await storage.putText(key, html, 'text/html; charset=utf-8')
        return html
      }
      lastError = new BisFetchHttpError(response.status, url)
      if (!isRetryableBisFetchStatus(response.status) || attempt === BIS_FETCH_ATTEMPTS) {
        break
      }
    } catch (error) {
      lastError = error
      if (attempt === BIS_FETCH_ATTEMPTS) {
        break
      }
    }
    await sleep(BIS_FETCH_RETRY_DELAY_MS * attempt)
  }

  if (lastError instanceof BisFetchHttpError) {
    throw lastError
  }
  throw new Error(`BIS fetch failed after ${BIS_FETCH_ATTEMPTS} attempts: ${url} (${formatBisFetchError(lastError)})`)
}

function isRetryableBisFetchStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function formatBisFetchError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function selectTeams(team: string | undefined): BisTeamInfo[] {
  if (!team) {
    return BIS_TEAMS
  }
  const normalized = team.toLowerCase()
  const found = BIS_TEAMS.find((item) =>
    item.teamId.toLowerCase() === normalized ||
    item.teamName.toLowerCase().includes(normalized) ||
    teamAliases(item.teamId).includes(team),
  )
  if (!found) {
    throw new Error(`Unknown BIS team: ${team}`)
  }
  return [found]
}

function teamAliases(teamId: string): string[] {
  const aliases: Record<string, string[]> = {
    db: ['DeNA', '横浜DeNA', '横浜'],
    s: ['ヤクルト', '東京ヤクルト'],
    g: ['巨人', '読売'],
    t: ['阪神'],
    d: ['中日'],
    c: ['広島'],
    b: ['オリックス'],
    h: ['ソフトバンク'],
    l: ['西武'],
    m: ['ロッテ'],
    f: ['日本ハム'],
    e: ['楽天'],
  }
  return aliases[teamId] ?? []
}

function insertGenericRows(database: SqliteDatabase, table: 'team_index' | 'team_yearly_stats', rows: BisCurrentDataset['teamIndex']): void {
  for (const row of rows) {
    const statYear = table === 'team_yearly_stats' ? Number(row.values.年度 ?? row.values.年) || null : null
    database.prepare(
      `INSERT OR REPLACE INTO ${table} (
        year, team_id, team_name, ${table === 'team_yearly_stats' ? 'stat_year, ' : ''}row_index,
        ${table === 'team_index' ? 'label, ' : ''}values_json, source_url
      ) VALUES (${table === 'team_yearly_stats' ? '?, ?, ?, ?, ?, ?, ?' : '?, ?, ?, ?, ?, ?, ?'})`,
    ).run(
      ...(table === 'team_yearly_stats'
        ? [row.year, row.teamId, row.teamName, statYear, row.rowIndex, JSON.stringify(row.values), row.sourceUrl]
        : [row.year, row.teamId, row.teamName, row.rowIndex, row.label, JSON.stringify(row.values), row.sourceUrl]),
    )
  }
}

function insertPlayerStatsRows(database: SqliteDatabase, table: 'player_batting_stats' | 'player_pitching_stats' | 'player_fielding_stats', rows: BisCurrentDataset['playerBattingStats']): void {
  for (const row of rows) {
    database.prepare(
      `INSERT OR REPLACE INTO ${table} (
        year, team_id, team_name, player_key, player_id, player_name, row_index, values_json, source_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(row.year, row.teamId, row.teamName, playerKey(row.playerId, row.playerName), row.playerId, row.playerName, row.rowIndex, JSON.stringify(row.values), row.sourceUrl)
  }
}

function playerKey(playerId: string | null, playerName: string): string {
  return playerId || `name:${playerName}`
}

function emptyResult(year: number, teams: number, sqlitePath: string, rawDir: string, structuredPath: string, dryRun: boolean): UpdateBisCurrentResult {
  return {
    year,
    teams,
    sourceSnapshots: 0,
    currentTeamRoster: 0,
    teamIndex: 0,
    teamYearlyStats: 0,
    playerBattingStats: 0,
    playerPitchingStats: 0,
    playerFieldingStats: 0,
    teamMonthlyResults: 0,
    sqlitePath,
    rawDir,
    structuredPath,
    dryRun,
  }
}

function parsePositiveInteger(value: string | undefined, label: string): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value ?? '(missing)'}`)
  }
  return Number.parseInt(value, 10)
}

function parseNonNegativeInteger(value: string | undefined, label: string): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value ?? '(missing)'}`)
  }
  return Number.parseInt(value, 10)
}

export type PlayerProfilesUpdateArgs = {
  sqlitePath?: string
  sqliteDir?: string
  year?: number
  delayMs?: number
  userAgent?: string
  dryRun?: boolean
  limit?: number
}

export type PlayerProfilesUpdateResult = {
  total: number
  fetched: number
  skipped: number
  failed: number
  sqlitePath: string
}

export function parsePlayerProfilesUpdateArgs(argv: string[]): PlayerProfilesUpdateArgs {
  const args = [...argv]
  while (args[0] === '--') args.shift()
  const result: PlayerProfilesUpdateArgs = {}
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--year') { result.year = parsePositiveInteger(args.shift(), 'year'); continue }
    if (arg?.startsWith('--year=')) { result.year = parsePositiveInteger(arg.slice('--year='.length), 'year'); continue }
    if (arg === '--sqlite-path') { result.sqlitePath = args.shift(); continue }
    if (arg?.startsWith('--sqlite-path=')) { result.sqlitePath = arg.slice('--sqlite-path='.length); continue }
    if (arg === '--sqlite-dir') { result.sqliteDir = args.shift(); continue }
    if (arg?.startsWith('--sqlite-dir=')) { result.sqliteDir = arg.slice('--sqlite-dir='.length); continue }
    if (arg === '--delay-ms') { result.delayMs = parseNonNegativeInteger(args.shift(), 'delay-ms'); continue }
    if (arg?.startsWith('--delay-ms=')) { result.delayMs = parseNonNegativeInteger(arg.slice('--delay-ms='.length), 'delay-ms'); continue }
    if (arg === '--user-agent') { result.userAgent = args.shift(); continue }
    if (arg?.startsWith('--user-agent=')) { result.userAgent = arg.slice('--user-agent='.length); continue }
    if (arg === '--limit') { result.limit = parsePositiveInteger(args.shift(), 'limit'); continue }
    if (arg?.startsWith('--limit=')) { result.limit = parsePositiveInteger(arg.slice('--limit='.length), 'limit'); continue }
    if (arg === '--dry-run') { result.dryRun = true; continue }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return result
}

export async function runPlayerProfilesUpdate(options: PlayerProfilesUpdateArgs): Promise<PlayerProfilesUpdateResult> {
  const year = options.year ?? new Date().getFullYear()
  const sqlitePath = options.sqlitePath ?? path.join(options.sqliteDir ?? DEFAULT_SQLITE_DIR, `npb-${year}.sqlite`)
  const db = openDatabase(sqlitePath)
  try {
    migrateDatabase(db)

    const playerIds = db
      .prepare('SELECT DISTINCT player_id FROM current_team_roster WHERE player_id IS NOT NULL ORDER BY player_id')
      .all()
      .map((row) => String((row as { player_id: string }).player_id))

    const existingIds = new Set(
      db
        .prepare('SELECT player_id FROM player_profiles')
        .all()
        .map((row) => String((row as { player_id: string }).player_id)),
    )

    const toFetch = playerIds.filter((id) => !existingIds.has(id))
    const limit = options.limit ?? toFetch.length
    let fetched = 0
    let failed = 0

    for (const playerId of toFetch.slice(0, limit)) {
      if (options.dryRun) {
        continue
      }
      const url = `https://npb.jp/bis/players/${playerId}.html`
      try {
        const response = await fetch(url, {
          headers: { 'user-agent': options.userAgent ?? DEFAULT_USER_AGENT },
        })
        if (!response.ok) {
          process.stderr.write(`Profile fetch ${response.status}: ${url}\n`)
          failed += 1
          continue
        }
        const html = await response.text()
        const profile = parseBisPlayerProfileHtml(html, playerId, url)
        if (profile?.fullName) {
          db.prepare(
            `INSERT OR REPLACE INTO player_profiles (
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            profile.playerId,
            profile.fullName,
            profile.teamName,
            profile.yearTeamsJson,
            profile.sourceUrl,
            new Date().toISOString(),
            profile.fullName,
            profile.teamName,
            1,
            JSON.stringify({
              year_teams_json: profile.yearTeamsJson,
              source_url: profile.sourceUrl,
            }),
            new Date().toISOString(),
            new Date().toISOString(),
          )
          fetched += 1
        } else {
          failed += 1
        }
        if (options.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.delayMs))
        }
      } catch (error) {
        process.stderr.write(`Profile fetch error for ${playerId}: ${String(error)}\n`)
        failed += 1
      }
    }

    materializePlayerIdentityArtifacts(db, year)

    return {
      total: playerIds.length,
      fetched,
      skipped: existingIds.size + (options.dryRun ? toFetch.slice(0, limit).length : 0),
      failed,
      sqlitePath,
    }
  } finally {
    db.close()
  }
}
