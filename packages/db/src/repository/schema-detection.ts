import type { QueryDatabase } from '../query-driver'

const normalizedSchemaCache = new WeakMap<QueryDatabase, Promise<boolean>>()

export function isNormalizedFactsSchema(database: QueryDatabase): Promise<boolean> {
  const cached = normalizedSchemaCache.get(database)
  if (cached) {
    return cached
  }
  const promise = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'event_facts' LIMIT 1")
    .get()
    .then((row) => Boolean((row as { name?: string } | undefined)?.name))
    .catch(() => false)
  normalizedSchemaCache.set(database, promise)
  return promise
}
