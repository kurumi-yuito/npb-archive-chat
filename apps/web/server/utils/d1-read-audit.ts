import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'

export type D1ReadCategory = 'meta' | 'repository' | 'other'
type Entry = { category: D1ReadCategory; sql: string; fingerprint: string; rowsRead: number | null; failed: boolean }
type Audit = { entries: Entry[] }
const storage = new AsyncLocalStorage<Audit>()

export async function withD1ReadAudit<T>(work: () => Promise<T>, publish: (audit: ReturnType<typeof summarize>) => void): Promise<T> {
  const audit: Audit = { entries: [] }
  return storage.run(audit, async () => {
    try { return await work() } finally { publish(summarize(audit)) }
  })
}

export async function measureD1<T extends { meta?: { rows_read?: number } }>(
  category: D1ReadCategory, sql: string, params: unknown[], execute: () => Promise<T>,
): Promise<T> {
  const audit = storage.getStore()
  if (!audit) return execute()
  const entry: Entry = {
    category, sql: sql.replace(/\s+/gu, ' ').trim(),
    fingerprint: createHash('sha256').update(JSON.stringify([sql, params])).digest('hex'),
    rowsRead: null, failed: false,
  }
  audit.entries.push(entry)
  try {
    const result = await execute()
    entry.rowsRead = typeof result.meta?.rows_read === 'number' ? result.meta.rows_read : null
    return result
  } catch (error) { entry.failed = true; throw error }
}

function summarize(audit: Audit) {
  const categories = ['meta', 'repository', 'other'] as const
  const rowsRead = Object.fromEntries(categories.map((category) => {
    const entries = audit.entries.filter((entry) => entry.category === category)
    return [category, entries.some((entry) => entry.rowsRead === null) ? null : entries.reduce((sum, entry) => sum + entry.rowsRead!, 0)]
  }))
  return {
    rowsRead,
    total: Object.values(rowsRead).some((value) => value === null) ? null : Object.values(rowsRead).reduce<number>((sum, value) => sum + value!, 0),
    statements: audit.entries.length,
    unknown: audit.entries.filter((entry) => entry.rowsRead === null).length,
    unknownEntries: audit.entries.filter((entry) => entry.rowsRead === null).map(({ category, sql, fingerprint, failed }) => ({ category, sql, fingerprint, failed })),
    entries: audit.entries,
  }
}
