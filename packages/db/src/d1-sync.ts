import { spawnSync } from 'node:child_process'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { findWorkspaceRoot } from '../../crawler/src/index'
import { migrateDatabase } from './migrations'
import { openDatabase, type SqliteDatabase } from './sqlite'

const DEFAULT_SQLITE_DIR = 'data'
const DEFAULT_D1_DATABASE = 'npb-archive-chat-import'
const DEFAULT_SQLITE_FILE_RE = /^npb-(\d{4})\.sqlite$/u
const D1_OMIT_COLUMNS = new Set(['id'])
const LATEST_SNAPSHOT_TABLES = new Set<ImportTable>([
  'bis_source_snapshots',
  'current_team_roster',
  'team_index',
  'team_yearly_stats',
  'player_batting_stats',
  'player_pitching_stats',
  'player_fielding_stats',
  'team_monthly_results',
])
const IMPORT_TABLES = [
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
] as const

type ImportTable = (typeof IMPORT_TABLES)[number]

export type SyncD1Args = {
  sqliteDir?: string
  d1Database?: string
  workspaceRoot?: string
  dryRun?: boolean
  keepFiles?: boolean
  verify?: boolean
}

export type SyncD1YearResult = {
  year: number
  sqlitePath: string
  sqlPath: string
  rowCounts: Record<ImportTable, number>
  totalRows: number
  executed: boolean
}

export type SyncD1Result = {
  sqliteDir: string
  d1Database: string
  dryRun: boolean
  verified: boolean
  totalRows: number
  years: SyncD1YearResult[]
  summaryPath: string
  verification?: SyncD1VerificationResult
}

export type SyncD1VerificationResult = {
  expectedTableCounts: Record<ImportTable, number>
  actualTableCounts: Record<ImportTable, number>
  mismatches: Array<{
    table: ImportTable
    expected: number
    actual: number
  }>
}

export function parseSyncD1Args(argv: string[]): SyncD1Args {
  const args = [...argv]
  while (args[0] === '--') {
    args.shift()
  }

  let sqliteDir: string | undefined
  let d1Database: string | undefined
  let workspaceRoot: string | undefined
  let dryRun = false
  let keepFiles = false
  let verify: boolean | undefined

  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--sqlite-dir') {
      sqliteDir = args.shift()
      continue
    }
    if (arg?.startsWith('--sqlite-dir=')) {
      sqliteDir = arg.slice('--sqlite-dir='.length)
      continue
    }
    if (arg === '--d1-database') {
      d1Database = args.shift()
      continue
    }
    if (arg?.startsWith('--d1-database=')) {
      d1Database = arg.slice('--d1-database='.length)
      continue
    }
    if (arg === '--workspace-root') {
      workspaceRoot = args.shift()
      continue
    }
    if (arg?.startsWith('--workspace-root=')) {
      workspaceRoot = arg.slice('--workspace-root='.length)
      continue
    }
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }
    if (arg === '--keep-files') {
      keepFiles = true
      continue
    }
    if (arg === '--verify') {
      verify = true
      continue
    }
    if (arg === '--no-verify') {
      verify = false
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return { sqliteDir, d1Database, workspaceRoot, dryRun, keepFiles, verify }
}

export async function runD1Sync(options: SyncD1Args): Promise<SyncD1Result> {
  const workspaceRoot = path.resolve(
    options.workspaceRoot ?? (await findWorkspaceRoot(process.cwd())),
  )
  const sqliteDir = path.resolve(workspaceRoot, options.sqliteDir ?? DEFAULT_SQLITE_DIR)
  const d1Database = options.d1Database ?? DEFAULT_D1_DATABASE
  const importDir = path.join(workspaceRoot, 'data', 'logs', 'd1-sync')
  await mkdir(importDir, { recursive: true })

  const yearFiles = await listYearSqliteFiles(sqliteDir)
  if (yearFiles.length === 0) {
    throw new Error(`No year SQLite files found in ${sqliteDir}`)
  }

  const years: SyncD1YearResult[] = []
  let totalRows = 0

  for (const { year, sqlitePath } of yearFiles) {
    const database = openDatabase(sqlitePath)
    try {
      const sqlPath = path.join(importDir, `${year}.sql`)
      migrateDatabase(database)
      const yearResult = await buildD1ImportFile(database, year, sqlPath)
      years.push({
        year,
        sqlitePath,
        sqlPath,
        rowCounts: yearResult.rowCounts,
        totalRows: yearResult.totalRows,
        executed: false,
      })
      totalRows += yearResult.totalRows
    } finally {
      database.close()
    }
  }

  if (!options.dryRun) {
    for (const yearResult of years) {
      const executed = executeD1Import(d1Database, yearResult.sqlPath, workspaceRoot)
      if (!executed) {
        throw new Error(`D1 import failed for year ${yearResult.year}`)
      }
      yearResult.executed = true
    }
    if (!options.keepFiles) {
      await Promise.all(years.map((yearResult) => rm(yearResult.sqlPath, { force: true })))
    }
  }

  const verify = options.verify ?? true
  const verification =
    !options.dryRun && verify
      ? await verifyD1Import(d1Database, aggregateExpectedTableCounts(years), workspaceRoot)
      : undefined

  const summaryPath = path.join(importDir, 'summary.json')
  const summary: SyncD1Result = {
    sqliteDir,
    d1Database,
    dryRun: options.dryRun === true,
    verified: Boolean(verification && verification.mismatches.length === 0),
    totalRows,
    years,
    summaryPath,
    verification,
  }
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  if (verification && verification.mismatches.length > 0) {
    throw new Error(formatVerificationFailure(verification.mismatches))
  }
  return summary
}

async function buildD1ImportFile(database: SqliteDatabase, year: number, sqlPath: string): Promise<{
  rowCounts: Record<ImportTable, number>
  totalRows: number
}> {
  const rowCounts = Object.fromEntries(
    IMPORT_TABLES.map((table) => [table, 0]),
  ) as Record<ImportTable, number>
  const statements: string[] = []

  for (const table of IMPORT_TABLES) {
    const exists = tableExists(database, table)
    if (!exists) {
      continue
    }

    statements.push(...buildYearScopedDeleteStatements(table, year))
    const { columns, rows } = readTableRows(database, table)
    if (rows.length === 0) {
      continue
    }
    rowCounts[table] = rows.length
    statements.push(...buildInsertStatements(table, columns, rows))
  }

  const totalRows = Object.values(rowCounts).reduce((sum, count) => sum + count, 0)
  await writeFile(sqlPath, `${statements.join('\n')}\n`, 'utf8')
  return { rowCounts, totalRows }
}

function tableExists(database: SqliteDatabase, table: string): boolean {
  const row = database
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    )
    .get(table) as { name?: string } | undefined
  return Boolean(row?.name)
}

function readTableRows(
  database: SqliteDatabase,
  table: string,
): { columns: string[]; rows: Record<string, unknown>[] } {
  const rawColumns = database
    .prepare(`PRAGMA table_info("${escapeIdentifier(table)}")`)
    .all()
    .map((row) => String((row as { name: string }).name))

  const columns = rawColumns.filter((column) => !D1_OMIT_COLUMNS.has(column))

  if (columns.length === 0) {
    return { columns, rows: [] }
  }

  const rows = database
    .prepare(`SELECT ${columns.map((column) => `"${escapeIdentifier(column)}"`).join(', ')} FROM "${escapeIdentifier(table)}" ORDER BY rowid ASC`)
    .all() as Record<string, unknown>[]

  return { columns, rows }
}

function buildYearScopedDeleteStatements(table: ImportTable, year: number): string[] {
  const yearText = String(year)
  const quotedTable = `"${escapeIdentifier(table)}"`

  if (table === 'games') {
    return [`DELETE FROM ${quotedTable} WHERE year = ${year};`]
  }

  if (table === 'bis_source_snapshots' || table === 'current_team_roster' || table === 'team_index' || table === 'team_yearly_stats' || table === 'player_batting_stats' || table === 'player_pitching_stats' || table === 'player_fielding_stats' || table === 'team_monthly_results') {
    return [`DELETE FROM ${quotedTable} WHERE year = ${year};`]
  }

  if (table === 'source_snapshots' || table === 'events' || table === 'batting_lines' || table === 'pitching_lines' || table === 'roster_entries') {
    return [`DELETE FROM ${quotedTable} WHERE game_id LIKE 'r${yearText}%';`]
  }

  return []
}

function buildInsertStatements(
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
): string[] {
  const quotedColumns = columns.map((column) => `"${escapeIdentifier(column)}"`).join(', ')
  const batchSize = 1
  const statements: string[] = []

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize)
    const values = batch
      .map((row) => `(${columns.map((column) => sqlLiteral(row[column])).join(', ')})`)
      .join(',\n')
    statements.push(
      `INSERT OR REPLACE INTO "${escapeIdentifier(table)}" (${quotedColumns}) VALUES\n${values};`,
    )
  }

  return statements
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

function executeD1Import(databaseName: string, sqlPath: string, workspaceRoot: string): boolean {
  const result = spawnSync(
    'wrangler',
    ['d1', 'execute', databaseName, '--remote', '--yes', '--file', sqlPath],
    {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: process.env,
    },
  )
  return (result.status ?? 1) === 0
}

async function verifyD1Import(
  databaseName: string,
  expectedTableCounts: Record<ImportTable, number>,
  workspaceRoot: string,
): Promise<SyncD1VerificationResult> {
  const actualTableCounts = Object.fromEntries(
    IMPORT_TABLES.map((table) => [table, 0]),
  ) as Record<ImportTable, number>

  for (const table of IMPORT_TABLES) {
    const actual = executeD1CountQuery(databaseName, table, workspaceRoot)
    actualTableCounts[table] = actual
  }

  const mismatches = IMPORT_TABLES
    .filter((table) => actualTableCounts[table] !== expectedTableCounts[table])
    .map((table) => ({
      table,
      expected: expectedTableCounts[table],
      actual: actualTableCounts[table],
    }))

  return {
    expectedTableCounts,
    actualTableCounts,
    mismatches,
  }
}

function executeD1CountQuery(
  databaseName: string,
  table: ImportTable,
  workspaceRoot: string,
): number {
  const query = `SELECT COUNT(*) AS count FROM "${escapeIdentifier(table)}";`
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
    throw new Error(`D1 verification query failed for table ${table}`)
  }

  const parsed = parseJsonResult(result.stdout)
  const count = extractCountFromJson(parsed)
  if (count === null) {
    throw new Error(`Unable to parse D1 verification count for table ${table}`)
  }

  return count
}

function parseJsonResult(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }
  return JSON.parse(trimmed) as unknown
}

function extractCountFromJson(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractCountFromJson(item)
      if (extracted !== null) {
        return extracted
      }
    }
    return null
  }
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  if (typeof record.count === 'number' && Number.isFinite(record.count)) {
    return record.count
  }
  for (const key of ['results', 'result', 'rows', 'data']) {
    const extracted = extractCountFromJson(record[key])
    if (extracted !== null) {
      return extracted
    }
  }
  for (const nested of Object.values(record)) {
    const extracted = extractCountFromJson(nested)
    if (extracted !== null) {
      return extracted
    }
  }
  return null
}

function aggregateExpectedTableCounts(
  years: SyncD1YearResult[],
): Record<ImportTable, number> {
  const counts = Object.fromEntries(
    IMPORT_TABLES.map((table) => [table, 0]),
  ) as Record<ImportTable, number>
  for (const year of years) {
    for (const table of IMPORT_TABLES) {
      if (LATEST_SNAPSHOT_TABLES.has(table)) {
        counts[table] = year.rowCounts[table]
        continue
      }
      counts[table] += year.rowCounts[table]
    }
  }
  return counts
}

function formatVerificationFailure(
  mismatches: SyncD1VerificationResult['mismatches'],
): string {
  return `D1 verification failed: ${mismatches
    .map((mismatch) => `${mismatch.table} expected ${mismatch.expected} but got ${mismatch.actual}`)
    .join(', ')}`
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
