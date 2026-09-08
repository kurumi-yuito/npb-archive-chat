import { randomUUID } from 'node:crypto'
import type { SqliteDatabase } from './sqlite'

type Value = string | number | null
type Row = Record<string, Value>
type Column = { name: string; pk: number }
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`
const literal = (value: Value) => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`
const columns = (db: SqliteDatabase, table: string) => db.prepare(`PRAGMA table_info(${quote(table)})`).all() as Column[]
const rows = (db: SqliteDatabase, table: string) => db.prepare(`SELECT * FROM ${quote(table)}`).all() as Row[]
const where = (row: Row, names: string[]) => names.map(name => `${quote(name)} IS ${literal(row[name] ?? null)}`).join(' AND ')

export const PUBLICATION_SCHEMA = `CREATE TABLE IF NOT EXISTS normalized_sync_publication (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  generation TEXT NOT NULL
);`

export function readSyncGeneration(db: SqliteDatabase): string {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='normalized_sync_publication'").get()) return 'legacy'
  return String((db.prepare('SELECT generation FROM normalized_sync_publication WHERE singleton=1').get() as Row | undefined)?.generation ?? 'legacy')
}

function businessKey(db: SqliteDatabase, table: string): string[] {
  const primary = columns(db, table).filter(column => column.pk).sort((a, b) => a.pk - b.pk)
  if (primary.length) return primary.map(column => column.name)
  const index = (db.prepare(`PRAGMA index_list(${quote(table)})`).all() as Array<{ name: string; unique: number }>).find(index => index.unique)
  if (!index) throw new Error(`No stable unique key for ${table}`)
  return (db.prepare(`PRAGMA index_info(${quote(index.name)})`).all() as Array<{ name: string }>).map(column => column.name)
}

// Conversion numbers dictionaries afresh. Translate those IDs back to the
// published IDs so adding a name cannot rewrite every historical fact.
const dictionaries: Record<string, string[]> = {
  teams: ['team_name'], venues: ['venue_name'], event_types: ['event_type'],
  event_subtypes: ['event_subtype'], result_codes: ['result_text'],
  person_names: ['name'], positions: ['position'], roster_groups: ['group_label'],
  source_snapshot_facts: ['game_id', 'source_key'],
}

export type NormalizedDelta = {
  sql: string
  generation: string
  previousGeneration: string
  changes: Record<string, { inserted: number; updated: number; deleted: number }>
}

/** One file, one D1 bulk import. Never split or execute its statements separately. */
export function buildNormalizedDelta(previous: SqliteDatabase, next: SqliteDatabase, tables: readonly string[]): NormalizedDelta {
  const idMaps = new Map<string, Map<Value, Value>>()
  for (const [table, naturalKey] of Object.entries(dictionaries)) {
    if (!tables.includes(table)) continue
    const id = businessKey(next, table)[0]
    const oldRows = rows(previous, table)
    const natural = (row: Row) => JSON.stringify(naturalKey.map(key => row[key]))
    const published = new Map(oldRows.map(row => [natural(row), row[id]]))
    let maximum = oldRows.reduce((maximum, row) => Math.max(maximum, Number(row[id])), 0)
    const mapping = new Map<Value, Value>()
    for (const row of rows(next, table)) mapping.set(row[id], published.get(natural(row)) ?? ++maximum)
    idMaps.set(table, mapping)
  }

  const generation = randomUUID()
  const previousGeneration = readSyncGeneration(previous)
  const guard = 'normalized_sync_assertion'
  const assert = (expression: string) => `INSERT INTO ${guard}(ok) VALUES (CASE WHEN (${expression}) THEN 1 ELSE 0 END);`
  const statements = [
    'PRAGMA defer_foreign_keys = ON;', PUBLICATION_SCHEMA,
    `CREATE TABLE ${guard}(ok INTEGER NOT NULL CHECK(ok=1));`,
    assert(`COALESCE((SELECT generation FROM normalized_sync_publication WHERE singleton=1), 'legacy') = ${literal(previousGeneration)}`),
  ]
  const writes: string[] = []
  const removals: string[][] = []
  const changes: NormalizedDelta['changes'] = {}
  for (const table of tables) {
    const names = columns(next, table).map(column => column.name)
    if (JSON.stringify(names) !== JSON.stringify(columns(previous, table).map(column => column.name))) throw new Error(`Schema mismatch: ${table}`)
    const keys = businessKey(next, table)
    const key = (row: Row) => JSON.stringify(keys.map(name => row[name]))
    const seen = new Set<string>()
    const findOld = previous.prepare(`SELECT * FROM ${quote(table)} WHERE ${keys.map(name => `${quote(name)} IS ?`).join(' AND ')}`)
    const foreignKeys = next.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all() as Array<{ table: string; from: string }>
    const stats = { inserted: 0, updated: 0, deleted: 0 }
    const deletes: string[] = []
    for (const original of next.prepare(`SELECT * FROM ${quote(table)}`).iterate() as Iterable<Row>) {
      const row = { ...original }
      const ownMap = idMaps.get(table)
      if (ownMap) row[keys[0]] = ownMap.get(row[keys[0]])!
      for (const foreign of foreignKeys) {
        const mapping = idMaps.get(foreign.table)
        if (mapping && row[foreign.from] !== null) {
          const mapped = mapping.get(row[foreign.from])
          if (mapped === undefined) throw new Error(`Missing dictionary reference: ${table}.${foreign.from}`)
          row[foreign.from] = mapped
        }
      }
      const old = findOld.get(...keys.map(name => row[name])) as Row | undefined
      seen.add(key(row))
      if (!old) {
        writes.push(`INSERT INTO ${quote(table)} (${names.map(quote).join(',')}) VALUES (${names.map(name => literal(row[name] ?? null)).join(',')});`)
        stats.inserted++
      } else if (names.some(name => old[name] !== row[name])) {
        const changed = names.filter(name => old[name] !== row[name])
        writes.push(`UPDATE ${quote(table)} SET ${changed.map(name => `${quote(name)}=${literal(row[name] ?? null)}`).join(',')} WHERE ${where(old, names)};`)
        writes.push(assert('changes() = 1'))
        stats.updated++
      }
    }
    // Unused dictionaries remain valid and keep stable IDs, including references
    // from supplemental facts. They are tiny compared with historical facts.
    if (!idMaps.has(table)) {
      for (const old of previous.prepare(`SELECT * FROM ${quote(table)}`).iterate() as Iterable<Row>) {
        if (seen.has(key(old))) continue
        deletes.push(`DELETE FROM ${quote(table)} WHERE ${where(old, names)};`, assert('changes() = 1'))
        stats.deleted++
      }
    }
    removals.push(deletes)
    changes[table] = stats
  }
  for (const group of removals.reverse()) for (const statement of group) statements.push(statement)
  for (const statement of writes) statements.push(statement)
  if (previous.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='normalized_runtime_metadata'").get()) {
    statements.push(`INSERT INTO normalized_runtime_metadata(metadata_key,metadata_value) VALUES ('sync_generation',${literal(generation)}) ON CONFLICT(metadata_key) DO UPDATE SET metadata_value=excluded.metadata_value;`)
  }
  statements.push(
    // Deferred FK constraints are checked by SQLite at commit. Do not scan all
    // historical facts remotely; the full FK audit already ran on the candidate.
    `INSERT INTO normalized_sync_publication(singleton,generation) VALUES (1,${literal(generation)}) ON CONFLICT(singleton) DO UPDATE SET generation=excluded.generation;`,
    `DROP TABLE ${guard};`,
  )
  return { sql: statements.join('\n') + '\n', generation, previousGeneration, changes }
}
