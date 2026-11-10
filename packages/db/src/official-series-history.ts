import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { parseOfficialSeriesHistory } from '@npb/parser'
import { officialSeriesResultSchema } from '@npb/schemas'
import type { ObjectStorage } from './object-storage'
import { withTransaction, type SqliteDatabase } from './sqlite'

const digest = (text: string) => createHash('sha256').update(text).digest('hex')
export const OFFICIAL_SERIES_ENTRY_URL = 'https://npb.jp/bis/scores/nipponseries/yearlyresults2020.html'
export type OfficialSeriesCapture = {
  sourceUrl: string; html: string; fetchedAt: string; serverDate?: string | null; lastModified?: string | null
  discovery: { url: string; html: string; fetchedAt: string }
}

/** Capture timestamps remain observations, while source facts are immutable. */
export function prepareOfficialSeriesCapture(input: OfficialSeriesCapture) {
  const rows = parseOfficialSeriesHistory(input.html, input.sourceUrl).map((row) => officialSeriesResultSchema.parse(row))
  for (const value of [input.fetchedAt, input.discovery.fetchedAt]) if (!/^\d{4}-\d\d-\d\dT/u.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid official series observation timestamp')
  if (Date.parse(input.discovery.fetchedAt) > Date.parse(input.fetchedAt)) throw new Error('Official discovery occurred after the captured source')
  const discovery = new URL(input.discovery.url)
  if (discovery.href !== OFFICIAL_SERIES_ENTRY_URL) throw new Error('Official series discovery entry mismatch')
  if (input.sourceUrl === OFFICIAL_SERIES_ENTRY_URL) {
    if (input.html !== input.discovery.html || input.fetchedAt !== input.discovery.fetchedAt) throw new Error('Entry source must preserve its actual observation')
  } else {
    parseOfficialSeriesHistory(input.discovery.html, OFFICIAL_SERIES_ENTRY_URL)
    const links = [...input.discovery.html.matchAll(/\bhref=["']([^"']+)["']/giu)].map((match) => new URL(match[1]!, discovery).href)
    if (!links.includes(input.sourceUrl)) throw new Error('Official series source was not linked by its discovery capture')
  }
  const contentHash = digest(input.html), snapshotId = digest(`${input.sourceUrl}\n${contentHash}`)
  const discoveryHash = digest(input.discovery.html), rawKey = `raw/bis-series-history/${contentHash}.html`, discoveryRawKey = `raw/bis-series-history/${discoveryHash}.html`
  const observationId = digest(`${snapshotId}\n${input.fetchedAt}\n${input.discovery.url}\n${discoveryHash}\n${input.discovery.fetchedAt}`)
  const structuredKey = `structured/bis-series-history/captures/${observationId}.json`
  const evidence = { schemaVersion: 1, snapshotId, sourceUrl: input.sourceUrl, competition: '日本シリーズ', level: 'first',
    firstYear: rows[0]!.year, lastYear: rows.at(-1)!.year, rowCount: rows.length, contentHash, rawKey, fetchedAt: input.fetchedAt,
    serverDate: input.serverDate ?? null, lastModified: input.lastModified ?? null, observationId, structuredKey, rows,
    discovery: { sourceUrl: input.discovery.url, contentHash: discoveryHash, rawKey: discoveryRawKey, fetchedAt: input.discovery.fetchedAt } }
  const snapshot = { snapshot_id: snapshotId, source_url: input.sourceUrl, competition: '日本シリーズ', level: 'first', first_year: evidence.firstYear,
    last_year: evidence.lastYear, content_hash: contentHash, raw_key: rawKey, row_count: rows.length }
  const observation = { observation_id: observationId, snapshot_id: snapshotId, fetched_at: input.fetchedAt, fetched_at_ms: Date.parse(input.fetchedAt),
    source_response_date: input.serverDate ?? null, source_last_modified: input.lastModified ?? null, structured_key: structuredKey,
    discovery_url: input.discovery.url, discovery_fetched_at: input.discovery.fetchedAt, discovery_content_hash: discoveryHash, discovery_raw_key: discoveryRawKey }
  const records = rows.map((row, index) => {
    const record = JSON.stringify(row)
    return { snapshot_id: snapshotId, year: row.year, row_index: index + 1, record_json: record, record_hash: digest(record) }
  })
  return { evidence, snapshot, observation, records }
}

export async function saveOfficialSeriesCapture(input: OfficialSeriesCapture & { database: SqliteDatabase; storage: ObjectStorage }) {
  const { evidence, snapshot, observation, records } = prepareOfficialSeriesCapture(input)
  const { snapshotId, rawKey, structuredKey, discovery: { rawKey: discoveryRawKey } } = evidence
  const store = async (key: string, value: string, type: string) => {
    const previous = await input.storage.getText(key)
    if (previous !== null && previous !== value) throw new Error('Immutable official series object conflicts with its archive')
    if (previous === null) await input.storage.putText(key, value, type)
  }
  await store(rawKey, input.html, 'text/html; charset=utf-8')
  await store(discoveryRawKey, input.discovery.html, 'text/html; charset=utf-8')
  await store(structuredKey, JSON.stringify(evidence, null, 2), 'application/json; charset=utf-8')
  const insertImmutable = (table: string, value: Record<string, string | number | null>, key: string) => {
    const columns = Object.keys(value)
    input.database.prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map((column) => value[column]))
    const actual = input.database.prepare(`SELECT * FROM ${table} WHERE ${key}=?`).get(value[key]) as Record<string, unknown> | undefined
    if (!actual || !isDeepStrictEqual({ ...actual }, value)) throw new Error(`Immutable official series metadata mismatch: ${table}`)
  }
  withTransaction(input.database, () => {
    insertImmutable('official_series_history_snapshots', snapshot, 'snapshot_id')
    const insert = input.database.prepare('INSERT OR IGNORE INTO official_series_results(snapshot_id,year,row_index,record_json,record_hash) VALUES (?,?,?,?,?)')
    records.forEach((row) => insert.run(row.snapshot_id, row.year, row.row_index, row.record_json, row.record_hash))
    const actual = input.database.prepare('SELECT * FROM official_series_results WHERE snapshot_id=? ORDER BY row_index').all(snapshotId).map((row) => ({ ...row as Record<string, unknown> }))
    if (!isDeepStrictEqual(actual, records)) throw new Error('Official series stored facts disagree with their source')
    insertImmutable('official_series_history_observations', observation, 'observation_id')
  })
  return evidence
}

/** Reparse archived bytes and compare every stored projection without writing. */
export async function verifyOfficialSeriesArchive(database: SqliteDatabase, storage: Pick<ObjectStorage, 'getText'>) {
  type Snapshot = ReturnType<typeof prepareOfficialSeriesCapture>['snapshot']
  type Observation = ReturnType<typeof prepareOfficialSeriesCapture>['observation']
  const snapshots = database.prepare('SELECT * FROM official_series_history_snapshots').all() as Snapshot[]
  const observations = database.prepare('SELECT * FROM official_series_history_observations').all() as Observation[]
  if (!snapshots.length || !observations.length) throw new Error('Official series archive is empty')
  const byId = new Map(snapshots.map((snapshot) => [snapshot.snapshot_id, snapshot])), verified = new Set<string>()
  let rows = 0
  for (const observation of observations) {
    const snapshot = byId.get(observation.snapshot_id)
    if (!snapshot || !/^[a-f0-9]{64}$/u.test(snapshot.content_hash) || !/^[a-f0-9]{64}$/u.test(observation.discovery_content_hash) ||
      !/^[a-f0-9]{64}$/u.test(observation.observation_id) || snapshot.raw_key !== `raw/bis-series-history/${snapshot.content_hash}.html` ||
      observation.discovery_raw_key !== `raw/bis-series-history/${observation.discovery_content_hash}.html` ||
      observation.structured_key !== `structured/bis-series-history/captures/${observation.observation_id}.json`) throw new Error('Official series archive key mismatch')
    const [html, discoveryHtml, structured] = await Promise.all([storage.getText(snapshot.raw_key), storage.getText(observation.discovery_raw_key), storage.getText(observation.structured_key)])
    if (html === null || discoveryHtml === null || structured === null) throw new Error('Official series raw/structured archive is missing')
    const expected = prepareOfficialSeriesCapture({ html, sourceUrl: snapshot.source_url, fetchedAt: observation.fetched_at,
      serverDate: observation.source_response_date, lastModified: observation.source_last_modified,
      discovery: { url: observation.discovery_url, html: discoveryHtml, fetchedAt: observation.discovery_fetched_at } })
    if (!isDeepStrictEqual({ ...snapshot }, expected.snapshot) || !isDeepStrictEqual({ ...observation }, expected.observation) ||
      !isDeepStrictEqual(JSON.parse(structured), expected.evidence)) throw new Error('Official series capture differs from its source archive')
    if (!verified.has(snapshot.snapshot_id)) {
      const actual = database.prepare('SELECT * FROM official_series_results WHERE snapshot_id=? ORDER BY row_index').all(snapshot.snapshot_id).map((row) => ({ ...row as Record<string, unknown> }))
      if (!isDeepStrictEqual(actual, expected.records)) throw new Error('Official series stored facts disagree with their archive')
      verified.add(snapshot.snapshot_id); rows += actual.length
    }
  }
  const total = Number((database.prepare('SELECT COUNT(*) AS n FROM official_series_results').get() as { n: number }).n)
  if (verified.size !== snapshots.length || total !== rows) throw new Error('Official series has orphaned facts or missing observations')
  return { snapshots: snapshots.length, observations: observations.length, rows }
}
