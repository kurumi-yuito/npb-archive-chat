import { createHash } from 'node:crypto'
import { officialSeriesResultSchema } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import { hasRepositoryTable } from './schema-detection'
import type { AggregateRow } from './aggregate-repository'

export type OfficialSeriesFilters = {
  competition: string; year?: number; year_from?: number; year_to?: number
  level?: 'first' | 'farm'; order?: 'asc' | 'desc'; limit?: number
}
type Source = { snapshot_id: string; source_url: string; competition: string; level: string; first_year: number; last_year: number;
  content_hash: string; raw_key: string; row_count: number; stored_rows: number; observation_id: string; fetched_at: string;
  fetched_at_ms: number; structured_key: string }
type RecordRow = { snapshot_id: string; year: number; row_index: number; record_json: string; record_hash: string }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

/** Overall published series outcomes, never inferred from a partial game archive. */
export async function searchOfficialSeriesResults(database: QueryDatabase, filters: OfficialSeriesFilters): Promise<AggregateRow[]> {
  const from = filters.year ?? filters.year_from, to = filters.year ?? filters.year_to
  for (const year of [from, to]) if (year !== undefined && (!Number.isSafeInteger(year) || year < 1950 || year > 2200)) throw new Error('Invalid official series year')
  if (from === undefined || to === undefined || from > to) throw new Error('Official series search requires a bounded year scope')
  if (filters.limit !== undefined && (!Number.isSafeInteger(filters.limit) || filters.limit < 1)) throw new Error('Invalid official series limit')
  if (filters.order !== undefined && !['asc', 'desc'].includes(filters.order)) throw new Error('Invalid official series ordering')
  // Competition identity is verified against stored source metadata; no raw-game fallback.
  if (!await hasRepositoryTable(database, 'official_series_history_snapshots')) return []
  const sources = await database.prepare(`SELECT source.*, observation.observation_id, observation.fetched_at,
    observation.fetched_at_ms, observation.structured_key,
    (SELECT COUNT(*) FROM official_series_results fact WHERE fact.snapshot_id=source.snapshot_id) AS stored_rows
    FROM official_series_history_snapshots source
    JOIN official_series_history_observations observation ON observation.snapshot_id=source.snapshot_id
    WHERE source.competition=? AND source.level=? AND NOT EXISTS (
      SELECT 1 FROM official_series_history_snapshots newer_source
      JOIN official_series_history_observations newer ON newer.snapshot_id=newer_source.snapshot_id
      WHERE newer_source.source_url=source.source_url AND
      (newer.fetched_at_ms>observation.fetched_at_ms OR
        (newer.fetched_at_ms=observation.fetched_at_ms AND newer.observation_id>observation.observation_id)))`)
    .all(filters.competition, filters.level ?? 'first') as Source[]
  for (const source of sources) {
    const period = /^https:\/\/npb\.jp\/bis\/scores\/nipponseries\/yearlyresults(\d{4})\.html$/u.exec(source.source_url)
    if (!period || source.competition !== '日本シリーズ' || source.level !== 'first' ||
      source.first_year !== Number(period[1]) || source.first_year % 10 !== 0 || source.first_year < 1950 ||
      source.last_year < source.first_year || source.last_year > source.first_year + 9 ||
      source.row_count !== source.last_year - source.first_year + 1 || source.row_count !== source.stored_rows ||
      !/^[a-f0-9]{64}$/u.test(source.content_hash) || source.snapshot_id !== hash(`${source.source_url}\n${source.content_hash}`) ||
      source.raw_key !== `raw/bis-series-history/${source.content_hash}.html` || !/^[a-f0-9]{64}$/u.test(source.observation_id) ||
      source.structured_key !== `structured/bis-series-history/captures/${source.observation_id}.json` ||
      !Number.isFinite(Date.parse(source.fetched_at)) || Date.parse(source.fetched_at) !== source.fetched_at_ms) {
      throw new Error('Official series source integrity mismatch')
    }
  }
  const selected = sources.filter((source) => source.first_year <= to && source.last_year >= from)
  if (!selected.length) return []
  const records = await database.prepare(`SELECT * FROM official_series_results WHERE snapshot_id IN (${selected.map(() => '?').join(',')})
    AND year>=? AND year<=? ORDER BY year,snapshot_id`).all(...selected.map((source) => source.snapshot_id), from, to) as RecordRow[]
  const byId = new Map(selected.map((source) => [source.snapshot_id, source])), years = new Set<number>()
  const result = records.map((record): AggregateRow => {
    const source = byId.get(record.snapshot_id)!
    const row = officialSeriesResultSchema.parse(JSON.parse(record.record_json))
    if (hash(record.record_json) !== record.record_hash || row.year !== record.year || row.year < source.first_year || row.year > source.last_year || record.row_index !== row.year - source.first_year + 1 ||
      row.competition !== filters.competition || row.level !== (filters.level ?? 'first') || years.has(row.year)) throw new Error('Official series result identity or integrity mismatch')
    years.add(row.year)
    return { kind: 'games', label: row.winnerName, total: row.games.length, stats: {
      year: row.year, competition: row.competition, level: row.level, winnerName: row.winnerName, loserName: row.loserName,
      winnerWins: row.winnerWins, loserWins: row.loserWins, draws: row.draws,
      sourceUrls: JSON.stringify([source.source_url]), fetchedAt: source.fetched_at, snapshotId: source.snapshot_id,
      observationId: source.observation_id, evidenceStatus: 'official_complete_series_history',
    } }
  })
  // Missing years inside the selected source's asserted coverage are corruption, not no-match.
  for (const source of selected) for (let year = Math.max(from, source.first_year); year <= Math.min(to, source.last_year); year++) {
    if (!years.has(year)) throw new Error('Official series source coverage is incomplete')
  }
  if (filters.order === 'desc') result.reverse()
  return filters.limit === undefined ? result : result.slice(0, filters.limit)
}
