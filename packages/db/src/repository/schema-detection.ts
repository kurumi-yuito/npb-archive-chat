import type { QueryDatabase } from '../query-driver'

const tablePresenceCache = new WeakMap<QueryDatabase, Map<string, Promise<boolean>>>()

export function hasRepositoryTable(database: QueryDatabase, table: string): Promise<boolean> {
  let databaseCache = tablePresenceCache.get(database)
  if (!databaseCache) {
    databaseCache = new Map()
    tablePresenceCache.set(database, databaseCache)
  }
  const cached = databaseCache.get(table)
  if (cached) return cached

  const promise = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table)
    .then((row) => Boolean((row as { name?: string } | undefined)?.name))
  databaseCache.set(table, promise)
  return promise
}

export function isNormalizedFactsSchema(database: QueryDatabase): Promise<boolean> {
  return hasRepositoryTable(database, 'event_facts')
}
