import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { parseOfficialCalendar } from '@npb/parser'
import type { ObjectStorage } from './object-storage'
import { withTransaction, type SqliteDatabase } from './sqlite'

export type CalendarCapture = { sourceUrl: string; html: string; fetchedAt: string;
  discovery: Array<{ sourceUrl: string; html: string; fetchedAt: string }> }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const rawKey = (value: string) => `raw/bis-calendar/${hash(value)}.html`

/** Sources and fetch observations remain immutable across retries and later acquisitions. */
export function prepareOfficialCalendarCapture(input: CalendarCapture) {
  const fetchedAtMs = Date.parse(input.fetchedAt)
  if (!Number.isFinite(fetchedAtMs) || !input.discovery.length) throw new Error('Calendar fetch/discovery metadata required')
  let previous: CalendarCapture['discovery'][number] | undefined
  for (const step of [...input.discovery, input]) {
    const url = new URL(step.sourceUrl)
    const observed = Date.parse(step.fetchedAt)
    if (url.origin !== 'https://npb.jp' || url.search || url.hash || !Number.isFinite(observed) || observed > fetchedAtMs ||
      (previous && (observed < Date.parse(previous.fetchedAt) || ![...previous.html.matchAll(/href=["']([^"']+)["']/giu)]
        .some((match) => new URL(match[1]!, previous!.sourceUrl).href === step.sourceUrl)))) throw new Error('Calendar discovery link/time mismatch')
    previous = step
  }
  const seed = input.discovery[0]!.sourceUrl
  if (seed !== 'https://npb.jp/bis/teams/rst_db.html') throw new Error('Official calendar discovery seed mismatch')
  const facts = parseOfficialCalendar(input.html, input.sourceUrl), factsJson = JSON.stringify(facts)
  const contentHash = hash(input.html), factsHash = hash(factsJson)
  const observationId = hash(JSON.stringify([input.sourceUrl, contentHash, fetchedAtMs, factsHash]))
  const structuredKey = `structured/bis-calendar/${observationId}.json`
  const discovery = input.discovery.map((step) => ({ sourceUrl: step.sourceUrl, fetchedAt: step.fetchedAt,
    contentHash: hash(step.html), rawKey: rawKey(step.html) }))
  const observation = { observationId, sourceUrl: input.sourceUrl, fetchedAt: input.fetchedAt, fetchedAtMs,
    contentHash, rawKey: rawKey(input.html), facts, factsHash, structuredKey, discovery }
  return { observation, factsJson, discoveryJson: JSON.stringify(discovery) }
}

export async function storeOfficialCalendarCapture(database: SqliteDatabase, storage: ObjectStorage, input: CalendarCapture) {
  const prepared = prepareOfficialCalendarCapture(input), item = prepared.observation
  const objects = [...input.discovery, input].map((step) => ({ key: rawKey(step.html), text: step.html, type: 'text/html; charset=utf-8' }))
  objects.push({ key: item.structuredKey, text: JSON.stringify(item, null, 2) + '\n', type: 'application/json; charset=utf-8' })
  for (const object of objects) {
    const previous = await storage.getText(object.key)
    if (previous !== null && previous !== object.text) throw new Error('Immutable official calendar object conflict')
    if (previous === null) await storage.putText(object.key, object.text, object.type)
  }
  withTransaction(database, () => {
    const values = [item.observationId, item.sourceUrl, item.facts.year, item.facts.kind, item.contentHash, item.rawKey,
      item.fetchedAt, item.fetchedAtMs, prepared.factsJson, item.factsHash, item.structuredKey, prepared.discoveryJson]
    const previous = database.prepare('SELECT * FROM official_calendar_observations WHERE observation_id=?').get(item.observationId) as Record<string, unknown> | undefined
    if (previous) {
      const columns = ['observation_id', 'source_url', 'year', 'source_kind', 'content_hash', 'raw_key', 'fetched_at', 'fetched_at_ms', 'facts_json', 'facts_hash', 'structured_key', 'discovery_json']
      if (!isDeepStrictEqual(columns.map((field) => previous[field]), values)) throw new Error('Immutable official calendar observation conflict')
    } else database.prepare('INSERT INTO official_calendar_observations VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(...values)
  })
  return item
}

/** Rebuild every stored observation from its immutable original documents. */
export async function verifyOfficialCalendarArchive(database: SqliteDatabase, storage: ObjectStorage) {
  const rows = database.prepare('SELECT * FROM official_calendar_observations ORDER BY observation_id').all() as Array<Record<string, string | number>>
  const objects = new Map<string, { key: string; sha256: string; bytes: number }>()
  async function readObject(key: string, expectedHash: string) {
    const value = await storage.getText(key)
    if (value === null || hash(value) !== expectedHash) throw new Error('Official calendar original object integrity mismatch')
    objects.set(key, { key, sha256: expectedHash, bytes: new TextEncoder().encode(value).length })
    return value
  }
  for (const row of rows) {
    const contentHash = String(row.content_hash), observationId = String(row.observation_id)
    if (!/^[a-f0-9]{64}$/u.test(contentHash) || !/^[a-f0-9]{64}$/u.test(observationId) ||
      row.raw_key !== `raw/bis-calendar/${contentHash}.html` ||
      row.structured_key !== `structured/bis-calendar/${observationId}.json`) throw new Error('Official calendar archive key mismatch')
    const html = await readObject(String(row.raw_key), contentHash)
    const metadata: unknown = JSON.parse(String(row.discovery_json))
    if (!Array.isArray(metadata) || !metadata.length) throw new Error('Official calendar discovery archive missing')
    const discovery: CalendarCapture['discovery'] = []
    for (const item of metadata) {
      if (!item || typeof item !== 'object' || typeof item.contentHash !== 'string' || !/^[a-f0-9]{64}$/u.test(item.contentHash) ||
        item.rawKey !== `raw/bis-calendar/${item.contentHash}.html` || typeof item.sourceUrl !== 'string' || typeof item.fetchedAt !== 'string') {
        throw new Error('Official calendar discovery archive metadata mismatch')
      }
      discovery.push({ sourceUrl: item.sourceUrl, fetchedAt: item.fetchedAt, html: await readObject(item.rawKey, item.contentHash) })
    }
    const prepared = prepareOfficialCalendarCapture({ sourceUrl: String(row.source_url), fetchedAt: String(row.fetched_at), html, discovery })
    const item = prepared.observation
    if (item.observationId !== observationId || item.facts.year !== row.year || item.facts.kind !== row.source_kind ||
      item.fetchedAtMs !== row.fetched_at_ms || item.factsHash !== row.facts_hash || prepared.factsJson !== row.facts_json ||
      prepared.discoveryJson !== row.discovery_json) throw new Error('Official calendar archived facts disagree with original documents')
    const sidecar = await storage.getText(item.structuredKey)
    if (sidecar === null || !isDeepStrictEqual(JSON.parse(sidecar), item)) throw new Error('Official calendar structured observation mismatch')
    objects.set(item.structuredKey, { key: item.structuredKey, sha256: hash(sidecar), bytes: new TextEncoder().encode(sidecar).length })
  }
  return { observations: rows.length, objects: [...objects.values()].sort((a, b) => a.key.localeCompare(b.key)) }
}
