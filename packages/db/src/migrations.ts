import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SqliteDatabase } from './sqlite'
import { withTransaction } from './sqlite'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const explicitMigrationsDir = process.env.NPB_DB_MIGRATIONS_DIR

export type AppliedMigration = {
  version: string
  appliedAt: string
}

export function resolveMigrationsDir(migrationsDir?: string): string {
  const candidates = migrationsDir
    ? [path.resolve(migrationsDir)]
    : buildMigrationDirCandidates()
  for (const candidate of candidates) {
    if (isMigrationDir(candidate)) {
      return candidate
    }
  }

  throw new Error(
    [
      'Could not resolve @npb/db migrations directory.',
      'Tried:',
      ...candidates.map((candidate) => `- ${candidate}`),
      'Set NPB_DB_MIGRATIONS_DIR to the repo packages/db/migrations directory if running from a bundled runtime.',
    ].join('\n'),
  )
}

export function listMigrationFiles(migrationsDir?: string): string[] {
  const resolvedMigrationsDir = resolveMigrationsDir(migrationsDir)
  return readdirSync(resolvedMigrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => path.join(resolvedMigrationsDir, entry))
}

export function migrateDatabase(
  database: SqliteDatabase,
  migrationsDir?: string,
): AppliedMigration[] {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const appliedVersions = new Set(
    database
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => String((row as { version: string }).version)),
  )

  const applied: AppliedMigration[] = []
  for (const migrationPath of listMigrationFiles(migrationsDir)) {
    const version = path.basename(migrationPath)
    if (appliedVersions.has(version)) {
      continue
    }

    const sql = readFileSync(migrationPath, 'utf8')
    withTransaction(database, () => {
      database.exec(sql)
      database
        .prepare('INSERT INTO schema_migrations (version) VALUES (?)')
        .run(version)
    })

    const appliedAt = String(
      (
        database
          .prepare('SELECT applied_at FROM schema_migrations WHERE version = ?')
          .get(version) as { applied_at: string }
      ).applied_at,
    )

    applied.push({ version, appliedAt })
  }

  return applied
}

function buildMigrationDirCandidates(): string[] {
  const candidates: string[] = []
  if (explicitMigrationsDir) {
    candidates.push(path.resolve(explicitMigrationsDir))
  }

  candidates.push(path.resolve(moduleDir, '..', 'migrations'))
  candidates.push(path.resolve(moduleDir, '..', '..', 'migrations'))

  for (const start of [moduleDir, process.cwd()]) {
    for (const ancestor of ancestors(start)) {
      candidates.push(path.join(ancestor, 'packages', 'db', 'migrations'))
      candidates.push(path.join(ancestor, 'migrations'))
    }
  }

  return [...new Set(candidates)]
}

function ancestors(start: string): string[] {
  const results: string[] = []
  let current = path.resolve(start)
  while (true) {
    results.push(current)
    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return results
}

function isMigrationDir(candidate: string): boolean {
  try {
    return (
      existsSync(candidate) &&
      statSync(candidate).isDirectory() &&
      readdirSync(candidate).some((entry) => /^\d+_.+\.sql$/u.test(entry))
    )
  } catch {
    return false
  }
}
