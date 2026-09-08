import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findWorkspaceRoot } from '../../crawler/src/index'
import { migrateDatabase } from './migrations'
import { runNormalizeDatabase, validateNormalizedCandidate } from './normalized-conversion'
import { openDatabase, type SqliteDatabase } from './sqlite'
import { buildNormalizedDelta, readSyncGeneration } from './normalized-d1-delta'

const DEFAULT_SQLITE_DIR = 'data'
const DEFAULT_D1_DATABASE = 'npb-archive-chat-normalized'
const DEFAULT_SQLITE_FILE_RE = /^npb-(\d{4})\.sqlite$/u
const D1_OMIT_COLUMNS = new Set(['id'])
const DEFAULT_NORMALIZED_MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations-normalized',
)

const LEGACY_MERGE_TABLES = [
  'games',
  'source_snapshots',
  'events',
  'batting_lines',
  'pitching_lines',
  'roster_entries',
  'bis_source_snapshots',
  'current_team_roster',
  'team_index',
  'team_yearly_stats',
  'player_batting_stats',
  'player_pitching_stats',
  'player_fielding_stats',
  'team_monthly_results',
  'player_profiles',
  'player_aliases',
  'player_sources',
] as const

const NORMALIZED_IMPORT_TABLES = [
  'teams',
  'venues',
  'event_types',
  'event_subtypes',
  'result_codes',
  'person_names',
  'positions',
  'roster_groups',
  'source_snapshot_facts',
  'game_facts',
  'event_facts',
  'batting_line_facts',
  'pitching_line_facts',
  'roster_entry_facts',
  'player_profiles',
  'player_aliases',
  'player_sources',
  'bis_source_snapshots',
  'current_team_roster',
  'player_batting_stats',
  'player_pitching_stats',
  'player_fielding_stats',
  'team_index',
  'team_yearly_stats',
  'team_monthly_results',
  'normalized_migration_checkpoints',
] as const

export type NormalizedImportTable = (typeof NORMALIZED_IMPORT_TABLES)[number]

export type SyncNormalizedD1Args = {
  sqliteDir?: string
  d1Database?: string
  workspaceRoot?: string
  migrationsDir?: string
  dryRun?: boolean
  keepFiles?: boolean
  verify?: boolean
  verifyDates?: string[]
  baseline?: string
  normalizedCandidate?: string
}

export type DateDomainCounts = {
  games: number
  events: number
  batting: number
  pitching: number
  roster: number
}

export type DateIntegritySnapshot = {
  stage: 'year_sqlite' | 'legacy' | 'normalized' | 'd1_pre_import' | 'd1_post_import'
  date: string
  counts: DateDomainCounts
}

export type SyncNormalizedD1Result = {
  sqliteDir: string
  d1Database: string
  dryRun: boolean
  verified: boolean
  legacyPath: string
  normalizedPath: string
  sqlPaths: string[]
  rowCounts: Record<NormalizedImportTable, number>
  totalRows: number
  summaryPath: string
  verification?: SyncNormalizedD1VerificationResult
  dateIntegrity: {
    snapshots: DateIntegritySnapshot[]
    mismatches: Array<{
      date: string
      stage: DateIntegritySnapshot['stage']
      expected: DateDomainCounts
      actual: DateDomainCounts
    }>
  }
}

export type SyncNormalizedD1VerificationResult = {
  expectedTableCounts: Record<NormalizedImportTable, number>
  actualTableCounts: Record<NormalizedImportTable, number>
  mismatches: Array<{
    table: NormalizedImportTable
    expected: number
    actual: number
  }>
}

export function parseSyncNormalizedD1Args(argv: string[]): SyncNormalizedD1Args {
  const args = [...argv]
  while (args[0] === '--') {
    args.shift()
  }

  const result: SyncNormalizedD1Args = {}
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--sqlite-dir') {
      result.sqliteDir = args.shift()
      continue
    }
    if (arg === '--baseline') {
      result.baseline = args.shift()
      if (!result.baseline) throw new Error('--baseline requires a verified SQLite snapshot')
      continue
    }
    if (arg === '--normalized-candidate') {
      result.normalizedCandidate = args.shift()
      if (!result.normalizedCandidate) throw new Error('--normalized-candidate requires a SQLite file')
      continue
    }
    if (arg?.startsWith('--sqlite-dir=')) {
      result.sqliteDir = arg.slice('--sqlite-dir='.length)
      continue
    }
    if (arg === '--d1-database') {
      result.d1Database = args.shift()
      continue
    }
    if (arg?.startsWith('--d1-database=')) {
      result.d1Database = arg.slice('--d1-database='.length)
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
    if (arg === '--migrations-dir') {
      result.migrationsDir = args.shift()
      continue
    }
    if (arg?.startsWith('--migrations-dir=')) {
      result.migrationsDir = arg.slice('--migrations-dir='.length)
      continue
    }
    if (arg === '--dry-run') {
      result.dryRun = true
      continue
    }
    if (arg === '--keep-files') {
      result.keepFiles = true
      continue
    }
    if (arg === '--verify') {
      result.verify = true
      continue
    }
    if (arg === '--no-verify') {
      result.verify = false
      continue
    }
    if (arg === '--verify-date') {
      const date = args.shift()
      if (!date) throw new Error('--verify-date requires YYYY-MM-DD')
      result.verifyDates = [...(result.verifyDates ?? []), date]
      continue
    }
    if (arg?.startsWith('--verify-date=')) {
      result.verifyDates = [...(result.verifyDates ?? []), arg.slice('--verify-date='.length)]
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return result
}

export async function runNormalizedD1Sync(
  options: SyncNormalizedD1Args,
): Promise<SyncNormalizedD1Result> {
  const workspaceRoot = path.resolve(
    options.workspaceRoot ?? (await findWorkspaceRoot(process.cwd())),
  )
  const sqliteDir = path.resolve(workspaceRoot, options.sqliteDir ?? DEFAULT_SQLITE_DIR)
  const d1Database = options.d1Database ?? DEFAULT_D1_DATABASE
  if (d1Database !== DEFAULT_D1_DATABASE) {
    throw new Error(`Normalized D1 sync must target ${DEFAULT_D1_DATABASE}; got ${d1Database}`)
  }
  const importDir = path.join(workspaceRoot, 'data', 'logs', 'd1-sync-normalized')
  await mkdir(importDir, { recursive: true })

  const yearFiles = await listYearSqliteFiles(sqliteDir)
  if (yearFiles.length === 0) {
    throw new Error(`No year SQLite files found in ${sqliteDir}`)
  }

  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'npb-normalized-sync-'))
  const legacyPath = path.join(tempDir, 'legacy.sqlite')
  const normalizedPath = path.join(tempDir, 'normalized.sqlite')
  const baselinePath = path.join(tempDir, 'baseline.sqlite')
  try {
    console.info('[sync:normalized-d1] Preparing published baseline')
    if (options.baseline) {
      await copyFile(path.resolve(workspaceRoot, options.baseline), baselinePath)
    }
    let needsExport = !options.baseline
    if (options.baseline && !options.dryRun) {
      const baseline = openDatabase(baselinePath)
      try { needsExport = readSyncGeneration(baseline) !== remoteSyncGeneration(d1Database, workspaceRoot) }
      finally { baseline.close() }
    }
    if (needsExport && !options.dryRun) {
      // Bootstrap only. Recurring jobs restore the last published snapshot from R2.
      // Also reconcile a commit followed by a failed R2 snapshot upload.
      const dumpPath = path.join(tempDir, 'baseline.sql')
      const refreshedPath = path.join(tempDir, 'refreshed.sqlite')
      const exported = spawnSync('wrangler', ['d1', 'export', d1Database, '--remote', '--output', dumpPath], { cwd: workspaceRoot, stdio: 'inherit' })
      if (exported.status !== 0) throw new Error('Cannot export the published baseline; refusing to sync')
      const loaded = spawnSync('sqlite3', [refreshedPath, '.bail on', 'PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; BEGIN;', `.read ${dumpPath}`, 'COMMIT;'], { stdio: 'inherit' })
      if (loaded.status !== 0) throw new Error('Cannot load the published baseline')
      await copyFile(refreshedPath, baselinePath)
    }
    const verifyDates = [...new Set(options.verifyDates ?? [])]
    const dateSnapshots: DateIntegritySnapshot[] = verifyDates.map((date) => ({
      stage: 'year_sqlite',
      date,
      counts: readYearSqliteDateCounts(yearFiles.map((file) => file.sqlitePath), date),
    }))
    for (const snapshot of dateSnapshots) {
      if (snapshot.counts.games === 0) {
        throw new Error(`Date integrity source is missing games for ${snapshot.date}: ${JSON.stringify(snapshot.counts)}`)
      }
    }
    console.info('[sync:normalized-d1] Building local candidate from year snapshots')
    buildMergedLegacyDatabase(legacyPath, yearFiles.map((file) => file.sqlitePath))
    const legacy = openDatabase(legacyPath)
    try {
      dateSnapshots.push(...verifyDates.map((date) => ({
        stage: 'legacy' as const,
        date,
        counts: readLegacyDateCounts(legacy, date),
      })))
    } finally {
      legacy.close()
    }
    console.info('[sync:normalized-d1] Normalizing local candidate')
    if (options.normalizedCandidate) await copyFile(path.resolve(workspaceRoot, options.normalizedCandidate), normalizedPath)
    const conversion = options.normalizedCandidate
      ? { parity: validateNormalizedCandidate(legacyPath, normalizedPath) }
      : runNormalizeDatabase({
          source: legacyPath,
          target: normalizedPath,
          migrationsDir: options.migrationsDir ?? DEFAULT_NORMALIZED_MIGRATIONS_DIR,
        })
    if (!conversion.parity.ok) {
      throw new Error(`Normalized conversion parity failed: ${JSON.stringify(conversion.parity.checks.filter((check) => !check.ok))}`)
    }
    if (!options.dryRun) {
      const backfill = spawnSync('node', ['scripts/phase4-backfill-official-pitching-evidence.mjs', '--local-target', normalizedPath, '--output', path.join(importDir, 'backfill.json')], { cwd: workspaceRoot, stdio: 'inherit' })
      if (backfill.status !== 0) throw new Error('Candidate backfill failed; published database unchanged')
    }

    const normalized = openDatabase(normalizedPath)
    let rowCounts: Record<NormalizedImportTable, number>
    let sqlPaths: string[]
    try {
      rowCounts = readNormalizedRowCounts(normalized)
      dateSnapshots.push(...verifyDates.flatMap((date) => {
        const counts = readNormalizedDateCounts(normalized, date)
        return [
          { stage: 'normalized' as const, date, counts },
          { stage: 'd1_pre_import' as const, date, counts },
        ]
      }))
      const previous = openDatabase(baselinePath)
      try {
        if (options.dryRun && !options.baseline) {
          // Dry-run bootstrap compares with an empty migrated database only.
          migrateDatabase(previous, options.migrationsDir ?? DEFAULT_NORMALIZED_MIGRATIONS_DIR)
        }
        const oldLatest = previous.prepare('SELECT MAX(game_date) AS date FROM game_facts').get() as { date: string | null }
        const newLatest = normalized.prepare('SELECT MAX(game_date) AS date FROM game_facts').get() as { date: string | null }
        if (oldLatest.date && (!newLatest.date || newLatest.date < oldLatest.date)) throw new Error('Candidate is older than the published snapshot; refusing to remove newer games')
        for (const row of previous.prepare('SELECT DISTINCT year FROM game_facts').all() as Array<{ year: number }>) {
          if (!normalized.prepare('SELECT 1 FROM game_facts WHERE year=? LIMIT 1').get(row.year)) throw new Error(`Candidate is missing published season ${row.year}`)
        }
        console.info('[sync:normalized-d1] Generating atomic delta')
        const delta = buildNormalizedDelta(previous, normalized, NORMALIZED_IMPORT_TABLES)
        const dateMismatches = compareDateIntegritySnapshots(dateSnapshots)
        if (dateMismatches.length) throw new Error(`Candidate date integrity failed: ${JSON.stringify(dateMismatches)}`)
        const sqlPath = path.join(importDir, 'normalized_atomic_delta.sql')
        await writeFile(sqlPath, delta.sql, 'utf8')
        await writeFile(path.join(importDir, 'delta.json'), JSON.stringify(delta.changes, null, 2) + '\n', 'utf8')
        // Rehearse the exact publication file, including optimistic guards, on
        // an isolated copy. A failure here cannot change the serving database.
        previous.exec('BEGIN')
        try {
          previous.exec(delta.sql)
          if (previous.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Candidate has invalid foreign keys')
          previous.exec('COMMIT')
        } catch (error) {
          previous.exec('ROLLBACK')
          throw error
        }
        previous.exec('PRAGMA wal_checkpoint(TRUNCATE)')
        rowCounts = readNormalizedRowCounts(previous)
        if (!options.dryRun) {
          const integrity = spawnSync('node', ['scripts/phase5-normalized-ops-check.mjs', '--sqlite', baselinePath, '--output', path.join(importDir, 'candidate-integrity.json')], { cwd: workspaceRoot, stdio: 'inherit' })
          if (integrity.status !== 0) throw new Error('Candidate operational integrity failed; published database unchanged')
        }
        sqlPaths = [sqlPath]
      } finally { previous.close() }
    } finally {
      normalized.close()
    }

    if (!options.dryRun) {
      console.info('[sync:normalized-d1] Publishing validated delta in one import')
      for (const sqlPath of sqlPaths) {
        const executed = await executeD1Import(d1Database, sqlPath, workspaceRoot)
        if (!executed) {
          // A lost acknowledgement is not an import failure. Reconcile the
          // commit marker before deciding; never replay a partially known job.
          const candidate = openDatabase(baselinePath)
          try {
            if (!isPublishedGeneration(d1Database, readSyncGeneration(candidate), workspaceRoot)) throw new Error(`D1 import failed or acknowledgement unavailable for ${path.basename(sqlPath)}; preserve candidate for reconciliation`)
          } finally { candidate.close() }
        }
      }
      if (!options.keepFiles) {
        await Promise.all(sqlPaths.map((sqlPath) => rm(sqlPath, { force: true })))
      }
    }

    const verification = undefined
    // Date-scoped verification is cheap and must run after every import. The
    // full-table row-count verification can be limited by the caller because
    // repeating it for every daily sync exhausts D1 Free Tier row reads.
    if (!options.dryRun) {
      const candidate = openDatabase(baselinePath)
      try {
        const generation = readSyncGeneration(candidate)
        if (!isPublishedGeneration(d1Database, generation, workspaceRoot)) throw new Error('Published generation could not be confirmed')
      } finally { candidate.close() }
      await copyFile(baselinePath, path.join(importDir, 'published.sqlite'))
      dateSnapshots.push(...verifyDates.map((date) => ({
        stage: 'd1_post_import' as const,
        date,
        counts: executeD1DateCounts(d1Database, date, workspaceRoot),
      })))
    }
    const dateMismatches = compareDateIntegritySnapshots(dateSnapshots)

    const totalRows = Object.values(rowCounts).reduce((sum, count) => sum + count, 0)
    const summaryPath = path.join(importDir, 'summary.json')
    const summary: SyncNormalizedD1Result = {
      sqliteDir,
      d1Database,
      dryRun: options.dryRun === true,
      verified: !options.dryRun,
      legacyPath,
      normalizedPath,
      sqlPaths,
      rowCounts,
      totalRows,
      summaryPath,
      verification,
      dateIntegrity: {
        snapshots: dateSnapshots,
        mismatches: dateMismatches,
      },
    }
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    if (dateMismatches.length > 0) {
      throw new Error(`Date integrity verification failed: ${JSON.stringify(dateMismatches)}`)
    }
    return summary
  } finally {
    if (options.keepFiles !== true) {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

function buildMergedLegacyDatabase(legacyPath: string, sqlitePaths: string[]): void {
  const database = openDatabase(legacyPath)
  try {
    migrateDatabase(database)
    for (const sqlitePath of sqlitePaths) {
      database.exec(`ATTACH DATABASE '${sqlitePath.replaceAll("'", "''")}' AS source_year`)
      try {
        for (const table of LEGACY_MERGE_TABLES) {
          if (!tableExists(database, table, 'source_year')) {
            continue
          }
          const columns = readTableColumns(database, table, 'source_year')
            .filter((column) => !D1_OMIT_COLUMNS.has(column))
          if (columns.length === 0) {
            continue
          }
          const columnList = columns.map((column) => `"${escapeIdentifier(column)}"`).join(', ')
          database.exec(
            `INSERT OR REPLACE INTO main."${escapeIdentifier(table)}" (${columnList})
             SELECT ${columnList} FROM source_year."${escapeIdentifier(table)}"`,
          )
        }
      } finally {
        database.exec('DETACH DATABASE source_year')
      }
    }
  } finally {
    database.close()
  }
}

function readNormalizedRowCounts(
  database: SqliteDatabase,
): Record<NormalizedImportTable, number> {
  return Object.fromEntries(
    NORMALIZED_IMPORT_TABLES.map((table) => [table, countRows(database, table)]),
  ) as Record<NormalizedImportTable, number>
}

function tableExists(database: SqliteDatabase, table: string, schema = 'main'): boolean {
  const row = database
    .prepare(
      `SELECT name FROM ${schema}.sqlite_master WHERE type = 'table' AND name = ?`,
    )
    .get(table) as { name?: string } | undefined
  return Boolean(row?.name)
}

function readTableColumns(database: SqliteDatabase, table: string, schema = 'main'): string[] {
  return database
    .prepare(`PRAGMA ${schema}.table_info("${escapeIdentifier(table)}")`)
    .all()
    .map((row) => String((row as { name: string }).name))
}

function countRows(database: SqliteDatabase, table: string): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS count FROM "${escapeIdentifier(table)}"`)
    .get() as { count: number }
  return row.count
}

function readYearSqliteDateCounts(sqlitePaths: string[], date: string): DateDomainCounts {
  return sqlitePaths.reduce<DateDomainCounts>((total, sqlitePath) => {
    const database = openDatabase(sqlitePath)
    try {
      const counts = readLegacyDateCounts(database, date)
      return addDateCounts(total, counts)
    } finally {
      database.close()
    }
  }, emptyDateCounts())
}

function readLegacyDateCounts(database: SqliteDatabase, date: string): DateDomainCounts {
  return {
    games: countByDate(database, 'SELECT COUNT(*) AS count FROM games WHERE date = ?', date),
    events: countByDate(database, 'SELECT COUNT(*) AS count FROM events INNER JOIN games ON games.game_id = events.game_id WHERE games.date = ?', date),
    batting: countByDate(database, 'SELECT COUNT(*) AS count FROM batting_lines INNER JOIN games ON games.game_id = batting_lines.game_id WHERE games.date = ?', date),
    pitching: countByDate(database, 'SELECT COUNT(*) AS count FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id WHERE games.date = ?', date),
    roster: countByDate(database, 'SELECT COUNT(*) AS count FROM roster_entries INNER JOIN games ON games.game_id = roster_entries.game_id WHERE games.date = ?', date),
  }
}

function readNormalizedDateCounts(database: SqliteDatabase, date: string): DateDomainCounts {
  return {
    games: countByDate(database, 'SELECT COUNT(*) AS count FROM game_facts WHERE game_date = ?', date),
    events: countByDate(database, 'SELECT COUNT(*) AS count FROM event_facts INNER JOIN game_facts ON game_facts.game_id = event_facts.game_id WHERE game_facts.game_date = ?', date),
    batting: countByDate(database, 'SELECT COUNT(*) AS count FROM batting_line_facts INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id WHERE game_facts.game_date = ?', date),
    pitching: countByDate(database, 'SELECT COUNT(*) AS count FROM pitching_line_facts INNER JOIN game_facts ON game_facts.game_id = pitching_line_facts.game_id WHERE game_facts.game_date = ?', date),
    roster: countByDate(database, 'SELECT COUNT(*) AS count FROM roster_entry_facts INNER JOIN game_facts ON game_facts.game_id = roster_entry_facts.game_id WHERE game_facts.game_date = ?', date),
  }
}

function countByDate(database: SqliteDatabase, sql: string, date: string): number {
  return Number((database.prepare(sql).get(date) as { count: number }).count)
}

function emptyDateCounts(): DateDomainCounts {
  return { games: 0, events: 0, batting: 0, pitching: 0, roster: 0 }
}

function addDateCounts(left: DateDomainCounts, right: DateDomainCounts): DateDomainCounts {
  return {
    games: left.games + right.games,
    events: left.events + right.events,
    batting: left.batting + right.batting,
    pitching: left.pitching + right.pitching,
    roster: left.roster + right.roster,
  }
}

function compareDateIntegritySnapshots(snapshots: DateIntegritySnapshot[]) {
  const mismatches: Array<{
    date: string
    stage: DateIntegritySnapshot['stage']
    expected: DateDomainCounts
    actual: DateDomainCounts
  }> = []
  for (const date of [...new Set(snapshots.map((snapshot) => snapshot.date))]) {
    const stages = snapshots.filter((snapshot) => snapshot.date === date)
    const expected = stages.find((snapshot) => snapshot.stage === 'year_sqlite')?.counts
    if (!expected) continue
    for (const snapshot of stages) {
      if (!sameDateCounts(expected, snapshot.counts)) {
        mismatches.push({ date, stage: snapshot.stage, expected, actual: snapshot.counts })
      }
    }
  }
  return mismatches
}

function sameDateCounts(left: DateDomainCounts, right: DateDomainCounts): boolean {
  return (Object.keys(left) as Array<keyof DateDomainCounts>)
    .every((key) => left[key] === right[key])
}

async function executeD1Import(
  databaseName: string,
  sqlPath: string,
  workspaceRoot: string,
): Promise<boolean> {
  const result = spawnSync('wrangler', ['d1', 'execute', databaseName, '--remote', '--yes', '--file', sqlPath], {
    cwd: workspaceRoot, stdio: 'inherit', env: process.env,
  })
  return result.status === 0
}

function isPublishedGeneration(database: string, generation: string, workspaceRoot: string): boolean {
  const check = spawnSync('wrangler', ['d1', 'execute', database, '--remote', '--command', 'SELECT generation FROM normalized_sync_publication WHERE singleton=1', '--json'], { cwd: workspaceRoot, encoding: 'utf8' })
  if (check.status !== 0) return false
  try {
    return Boolean(JSON.parse(check.stdout)?.[0]?.results?.some((row: { generation?: string }) => row.generation === generation))
  } catch { return false }
}

function remoteSyncGeneration(database: string, workspaceRoot: string): string {
  const query = (sql: string) => {
    const result = spawnSync('wrangler', ['d1', 'execute', database, '--remote', '--command', sql, '--json'], { cwd: workspaceRoot, encoding: 'utf8' })
    if (result.status !== 0) throw new Error('Cannot read publication state; refusing to sync')
    const parsed = JSON.parse(result.stdout)
    if (!parsed[0]?.success) throw new Error('Invalid publication state response')
    return parsed[0].results
  }
  if (!query("SELECT name FROM sqlite_master WHERE type='table' AND name='normalized_sync_publication'").length) return 'legacy'
  return query('SELECT generation FROM normalized_sync_publication WHERE singleton=1')[0]?.generation ?? 'legacy'
}

function executeD1DateCounts(
  databaseName: string,
  date: string,
  workspaceRoot: string,
): DateDomainCounts {
  const quotedDate = sqlLiteral(date)
  const query = `SELECT
    (SELECT COUNT(*) FROM game_facts WHERE game_date = ${quotedDate}) AS games,
    (SELECT COUNT(*) FROM event_facts INNER JOIN game_facts ON game_facts.game_id = event_facts.game_id WHERE game_facts.game_date = ${quotedDate}) AS events,
    (SELECT COUNT(*) FROM batting_line_facts INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id WHERE game_facts.game_date = ${quotedDate}) AS batting,
    (SELECT COUNT(*) FROM pitching_line_facts INNER JOIN game_facts ON game_facts.game_id = pitching_line_facts.game_id WHERE game_facts.game_date = ${quotedDate}) AS pitching,
    (SELECT COUNT(*) FROM roster_entry_facts INNER JOIN game_facts ON game_facts.game_id = roster_entry_facts.game_id WHERE game_facts.game_date = ${quotedDate}) AS roster;`
  const result = spawnSync(
    'wrangler',
    ['d1', 'execute', databaseName, '--remote', '--yes', '--json', '--command', query],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    },
  )
  if ((result.status ?? 1) !== 0) {
    throw new Error(`D1 date verification query failed for ${date}`)
  }
  const counts = extractDateCountsFromJson(JSON.parse(result.stdout.trim()) as unknown)
  if (!counts) throw new Error(`Unable to parse D1 date verification counts for ${date}`)
  return counts
}

function extractDateCountsFromJson(value: unknown): DateDomainCounts | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractDateCountsFromJson(item)
      if (extracted) return extracted
    }
    return null
  }
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const keys: Array<keyof DateDomainCounts> = ['games', 'events', 'batting', 'pitching', 'roster']
  if (keys.every((key) => typeof record[key] === 'number')) {
    return Object.fromEntries(keys.map((key) => [key, Number(record[key])])) as DateDomainCounts
  }
  for (const nested of Object.values(record)) {
    const extracted = extractDateCountsFromJson(nested)
    if (extracted) return extracted
  }
  return null
}

async function listYearSqliteFiles(sqliteDir: string): Promise<Array<{ year: number; sqlitePath: string }>> {
  const entries = await readdir(sqliteDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = entry.name.match(DEFAULT_SQLITE_FILE_RE)
      if (!match) return null
      return {
        year: Number(match[1]),
        sqlitePath: path.join(sqliteDir, entry.name),
      }
    })
    .filter((value): value is { year: number; sqlitePath: string } => Boolean(value))
    .sort((left, right) => left.year - right.year)
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL'
  }
  if (typeof value === 'bigint') {
    return String(value)
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }
  return `'${String(value).replaceAll("'", "''")}'`
}

function escapeIdentifier(identifier: string): string {
  return identifier.replaceAll('"', '""')
}
