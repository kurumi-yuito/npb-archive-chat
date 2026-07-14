import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findWorkspaceRoot } from '../../crawler/src/index'
import { migrateDatabase } from './migrations'
import { runNormalizeDatabase } from './normalized-conversion'
import { openDatabase, type SqliteDatabase } from './sqlite'

const DEFAULT_SQLITE_DIR = 'data'
const DEFAULT_D1_DATABASE = 'npb-archive-chat-normalized'
const DEFAULT_SQLITE_FILE_RE = /^npb-(\d{4})\.sqlite$/u
const D1_OMIT_COLUMNS = new Set(['id'])
const IMPORT_CHUNK_ROWS = 5000
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
  const importDir = path.join(workspaceRoot, 'data', 'logs', 'd1-sync-normalized')
  await mkdir(importDir, { recursive: true })

  const yearFiles = await listYearSqliteFiles(sqliteDir)
  if (yearFiles.length === 0) {
    throw new Error(`No year SQLite files found in ${sqliteDir}`)
  }

  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'npb-normalized-sync-'))
  const legacyPath = path.join(tempDir, 'legacy.sqlite')
  const normalizedPath = path.join(tempDir, 'normalized.sqlite')
  try {
    buildMergedLegacyDatabase(legacyPath, yearFiles.map((file) => file.sqlitePath))
    const conversion = runNormalizeDatabase({
      source: legacyPath,
      target: normalizedPath,
      migrationsDir: options.migrationsDir ?? DEFAULT_NORMALIZED_MIGRATIONS_DIR,
    })
    if (!conversion.parity.ok) {
      throw new Error(`Normalized conversion parity failed: ${JSON.stringify(conversion.parity.checks.filter((check) => !check.ok))}`)
    }

    const normalized = openDatabase(normalizedPath)
    let rowCounts: Record<NormalizedImportTable, number>
    let sqlPaths: string[]
    try {
      rowCounts = readNormalizedRowCounts(normalized)
      sqlPaths = await buildNormalizedD1ImportFiles(normalized, importDir)
    } finally {
      normalized.close()
    }

    if (!options.dryRun) {
      for (const sqlPath of sqlPaths) {
        const executed = await executeD1Import(d1Database, sqlPath, workspaceRoot)
        if (!executed) {
          throw new Error(`D1 import failed for ${path.basename(sqlPath)}`)
        }
      }
      if (!options.keepFiles) {
        await Promise.all(sqlPaths.map((sqlPath) => rm(sqlPath, { force: true })))
      }
    }

    const verify = options.verify ?? true
    const verification =
      !options.dryRun && verify
        ? await verifyNormalizedD1Import(d1Database, rowCounts, workspaceRoot)
        : undefined

    const totalRows = Object.values(rowCounts).reduce((sum, count) => sum + count, 0)
    const summaryPath = path.join(importDir, 'summary.json')
    const summary: SyncNormalizedD1Result = {
      sqliteDir,
      d1Database,
      dryRun: options.dryRun === true,
      verified: Boolean(verification && verification.mismatches.length === 0),
      legacyPath,
      normalizedPath,
      sqlPaths,
      rowCounts,
      totalRows,
      summaryPath,
      verification,
    }
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    if (verification && verification.mismatches.length > 0) {
      throw new Error(formatVerificationFailure(verification.mismatches))
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

async function buildNormalizedD1ImportFiles(
  database: SqliteDatabase,
  importDir: string,
): Promise<string[]> {
  const sqlPaths: string[] = []
  const cleanupPath = path.join(importDir, 'normalized_000_cleanup.sql')
  await writeFile(
    cleanupPath,
    `${[...NORMALIZED_IMPORT_TABLES]
      .reverse()
      .map((table) => `DELETE FROM "${escapeIdentifier(table)}";`)
      .join('\n')}\n`,
    'utf8',
  )
  sqlPaths.push(cleanupPath)

  for (const table of NORMALIZED_IMPORT_TABLES) {
    const { columns, rows } = readTableRows(database, table)
    for (let index = 0; index < rows.length || (index === 0 && rows.length === 0); index += IMPORT_CHUNK_ROWS) {
      const chunk = rows.slice(index, index + IMPORT_CHUNK_ROWS)
      const statements = buildInsertStatements(table, columns, chunk)
      const chunkNumber = String(Math.floor(index / IMPORT_CHUNK_ROWS) + 1).padStart(4, '0')
      const sqlPath = path.join(importDir, `normalized_${table}_${chunkNumber}.sql`)
      await writeFile(sqlPath, `${statements.join('\n')}\n`, 'utf8')
      sqlPaths.push(sqlPath)
      if (rows.length === 0) {
        break
      }
    }
  }
  return sqlPaths
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

function readTableRows(
  database: SqliteDatabase,
  table: string,
): { columns: string[]; rows: Record<string, unknown>[] } {
  const columns = readTableColumns(database, table).filter((column) => !D1_OMIT_COLUMNS.has(column))
  if (columns.length === 0) {
    return { columns, rows: [] }
  }
  const rows = database
    .prepare(`SELECT ${columns.map((column) => `"${escapeIdentifier(column)}"`).join(', ')} FROM "${escapeIdentifier(table)}" ORDER BY rowid ASC`)
    .all() as Record<string, unknown>[]
  return { columns, rows }
}

function buildInsertStatements(
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
): string[] {
  if (columns.length === 0 || rows.length === 0) {
    return []
  }
  const quotedColumns = columns.map((column) => `"${escapeIdentifier(column)}"`).join(', ')
  return rows.map((row) => {
    const values = columns.map((column) => sqlLiteral(row[column])).join(', ')
    return `INSERT OR REPLACE INTO "${escapeIdentifier(table)}" (${quotedColumns}) VALUES (${values});`
  })
}

function countRows(database: SqliteDatabase, table: string): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS count FROM "${escapeIdentifier(table)}"`)
    .get() as { count: number }
  return row.count
}

async function verifyNormalizedD1Import(
  databaseName: string,
  expectedTableCounts: Record<NormalizedImportTable, number>,
  workspaceRoot: string,
): Promise<SyncNormalizedD1VerificationResult> {
  const actualTableCounts = Object.fromEntries(
    NORMALIZED_IMPORT_TABLES.map((table) => [
      table,
      executeD1CountQuery(databaseName, table, workspaceRoot),
    ]),
  ) as Record<NormalizedImportTable, number>
  const mismatches = NORMALIZED_IMPORT_TABLES
    .filter((table) => actualTableCounts[table] !== expectedTableCounts[table])
    .map((table) => ({
      table,
      expected: expectedTableCounts[table],
      actual: actualTableCounts[table],
    }))
  return { expectedTableCounts, actualTableCounts, mismatches }
}

async function executeD1Import(
  databaseName: string,
  sqlPath: string,
  workspaceRoot: string,
): Promise<boolean> {
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync(
      'wrangler',
      ['d1', 'execute', databaseName, '--remote', '--yes', '--file', sqlPath],
      {
        cwd: workspaceRoot,
        stdio: 'inherit',
        env: process.env,
      },
    )
    if ((result.status ?? 1) === 0) {
      return true
    }
    if (attempt < maxAttempts) {
      console.warn(
        `[sync:normalized-d1] wrangler import failed for ${path.basename(sqlPath)}; retrying (${attempt + 1}/${maxAttempts})`,
      )
      await sleep(5000 * attempt)
    }
  }
  return false
}

function executeD1CountQuery(
  databaseName: string,
  table: NormalizedImportTable,
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
  const count = extractCountFromJson(JSON.parse(result.stdout.trim()) as unknown)
  if (count === null) {
    throw new Error(`Unable to parse D1 verification count for table ${table}`)
  }
  return count
}

function extractCountFromJson(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractCountFromJson(item)
      if (extracted !== null) return extracted
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
  for (const nested of Object.values(record)) {
    const extracted = extractCountFromJson(nested)
    if (extracted !== null) return extracted
  }
  return null
}

function formatVerificationFailure(
  mismatches: SyncNormalizedD1VerificationResult['mismatches'],
): string {
  return `Normalized D1 verification failed: ${mismatches
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
