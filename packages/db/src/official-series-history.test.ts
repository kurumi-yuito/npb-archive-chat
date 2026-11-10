import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { saveOfficialSeriesCapture, verifyOfficialSeriesArchive, OFFICIAL_SERIES_ENTRY_URL } from './official-series-history'
import { migrateDatabase } from './migrations'
import { openDatabase } from './sqlite'
import type { ObjectStorage } from './object-storage'
import { preservePublishedOfficialStatistics } from './official-statistic-preservation'
import { buildNormalizedDelta } from './normalized-d1-delta'
import { sqliteDatabaseToQuery } from './query-driver'
import { searchOfficialSeriesResults } from './repository/official-series-repository'
import { createMultiYearQueryService } from './multi-year-query-service'

const html = readFileSync(new URL('../../parser/src/__fixtures__/series-history-2020.html', import.meta.url), 'utf8')
const original = JSON.parse(readFileSync(new URL('../../parser/src/__fixtures__/series-history-2020.source.json', import.meta.url), 'utf8'))
const capture = (fetchedAt = original.fetchedAt) => ({ html, sourceUrl: OFFICIAL_SERIES_ENTRY_URL, fetchedAt,
  discovery: { url: OFFICIAL_SERIES_ENTRY_URL, html, fetchedAt } })
const memoryStorage = () => {
  const objects = new Map<string, string>()
  const storage = { getText: vi.fn(async (key: string) => objects.get(key) ?? null), putText: vi.fn(async (key: string, value: string) => { objects.set(key, value); return key }) }
  return { storage: storage as unknown as ObjectStorage, objects, writes: storage.putText }
}

describe('official series source archive (B16)', () => {
  it('finds historical outcomes inside newer SQLite archives and keeps distinct years separate', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'npb-series-years-')), { storage } = memoryStorage()
    const service = createMultiYearQueryService({ sqliteDir: directory, years: [2025, 2026] })
    try {
      for (const year of [2025, 2026]) {
        const database = openDatabase(path.join(directory, `npb-${year}.sqlite`))
        try { migrateDatabase(database); await saveOfficialSeriesCapture({ ...capture(), database, storage }) } finally { database.close() }
      }
      const result = await service.aggregateGameResults({ official_series_result: true, competition: '日本シリーズ', year: 2020 })
      expect(result).toHaveLength(1)
      expect(result[0]!.stats.year).toBe(2020)
      const years = await service.aggregateGameResults({ official_series_result: true, competition: '日本シリーズ', year_from: 2020, year_to: 2026 })
      expect(years.map((row) => row.stats.year)).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026])
    } finally { service.close(); rmSync(directory, { recursive: true, force: true }) }
  })
  it('keeps original facts and timestamps while appending separate repeat observations', async () => {
    const database = openDatabase(), { storage, writes, objects } = memoryStorage()
    try {
      migrateDatabase(database)
      const first = await saveOfficialSeriesCapture({ ...capture(), database, storage })
      const later = new Date(Date.parse(original.fetchedAt) + 1000).toISOString()
      const second = await saveOfficialSeriesCapture({ ...capture(later), database, storage })
      await saveOfficialSeriesCapture({ ...capture(later), database, storage })
      expect(second.snapshotId).toBe(first.snapshotId)
      expect(second.observationId).not.toBe(first.observationId)
      expect(database.prepare('SELECT COUNT(*) AS n FROM official_series_history_snapshots').get()).toEqual({ n: 1 })
      expect(database.prepare('SELECT COUNT(*) AS n FROM official_series_results').get()).toEqual({ n: 7 })
      expect(database.prepare('SELECT fetched_at FROM official_series_history_observations ORDER BY fetched_at_ms').all()).toEqual([
        { fetched_at: original.fetchedAt }, { fetched_at: later },
      ])
      expect(writes).toHaveBeenCalledTimes(3) // one immutable raw object and two capture sidecars
      expect(JSON.parse(await storage.getText(first.structuredKey) ?? '{}').fetchedAt).toBe(original.fetchedAt)
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(await verifyOfficialSeriesArchive(database, storage)).toEqual({ snapshots: 1, observations: 2, rows: 7 })
      objects.set(first.rawKey, html + '<!-- altered archive -->')
      await expect(verifyOfficialSeriesArchive(database, storage)).rejects.toThrow('differs from its source archive')
    } finally { database.close() }
  })

  it('preserves verified historical sources absent from an update and refuses changes to their facts', async () => {
    const previous = openDatabase(), next = openDatabase(), { storage } = memoryStorage()
    try {
      migrateDatabase(previous); migrateDatabase(next)
      await saveOfficialSeriesCapture({ ...capture(), database: previous, storage })
      preservePublishedOfficialStatistics(previous, next)
      expect(await verifyOfficialSeriesArchive(next, storage)).toEqual({ snapshots: 1, observations: 1, rows: 7 })
      const tables = ['official_series_history_snapshots', 'official_series_history_observations', 'official_series_results']
      const delta = buildNormalizedDelta(previous, next, tables)
      expect(Object.values(delta.changes).every((row) => row.inserted === 0 && row.updated === 0 && row.deleted === 0)).toBe(true)
      next.prepare("UPDATE official_series_results SET record_json='{}' WHERE year=2025").run()
      expect(() => preservePublishedOfficialStatistics(previous, next)).toThrow('Immutable official history conflict')
    } finally { previous.close(); next.close() }
  })

  it('rejects unreconciled scores and an invented discovery before writing objects or facts', async () => {
    const database = openDatabase(), { storage, writes } = memoryStorage()
    try {
      migrateDatabase(database)
      await expect(saveOfficialSeriesCapture({ ...capture(), html: html.replace('（4勝）', '（5勝）'), database, storage })).rejects.toThrow('do not reconcile')
      await expect(saveOfficialSeriesCapture({ ...capture(), discovery: { ...capture().discovery, html: 'unrelated' }, database, storage })).rejects.toThrow('actual observation')
      expect(writes).not.toHaveBeenCalled()
      expect(database.prepare('SELECT COUNT(*) AS n FROM official_series_results').get()).toEqual({ n: 0 })
    } finally { database.close() }
  })

  it('returns one verified series outcome per year using the latest observation and rejects damaged evidence', async () => {
    const database = openDatabase(), { storage } = memoryStorage()
    try {
      migrateDatabase(database)
      await saveOfficialSeriesCapture({ ...capture(), database, storage })
      const later = new Date(Date.parse(original.fetchedAt) + 1000).toISOString()
      await saveOfficialSeriesCapture({ ...capture(later), database, storage })
      const query = sqliteDatabaseToQuery(database)
      const filters = { competition: '日本シリーズ', year_from: 2020, year_to: 2026 }
      const rows = await searchOfficialSeriesResults(query, filters)
      expect(rows).toHaveLength(7)
      expect(rows.every((row) => row.stats.fetchedAt === later)).toBe(true)
      expect(rows.find((row) => row.stats.year === 2025)?.stats).toMatchObject({ winnerName: 'ソフトバンク', winnerWins: 4, loserWins: 1 })
      expect(rows.find((row) => row.stats.year === 2022)?.stats.draws).toBe(1)
      expect((await searchOfficialSeriesResults(query, { ...filters, order: 'desc', limit: 2 })).map((row) => row.stats.year)).toEqual([2026, 2025])
      expect(await searchOfficialSeriesResults(query, { ...filters, competition: '未収録大会' })).toEqual([])
      expect(await searchOfficialSeriesResults(query, { ...filters, level: 'farm' })).toEqual([])
      database.prepare("UPDATE official_series_results SET record_hash='incorrect' WHERE year=2025").run()
      await expect(searchOfficialSeriesResults(query, filters)).rejects.toThrow('identity or integrity')
      database.prepare('DELETE FROM official_series_results WHERE year=2025').run()
      await expect(searchOfficialSeriesResults(query, filters)).rejects.toThrow('source integrity')
    } finally { database.close() }
  })

  it('selects a newer source version before applying the requested year, without filling its absence from an old version', async () => {
    const database = openDatabase(), { storage } = memoryStorage()
    try {
      migrateDatabase(database)
      const first = await saveOfficialSeriesCapture({ ...capture(), database, storage })
      const later = new Date(Date.parse(original.fetchedAt) + 2000).toISOString()
      const changedHtml = html.replace('</html>', '<!-- source version test -->\n</html>')
      const second = await saveOfficialSeriesCapture({ ...capture(later), html: changedHtml,
        discovery: { url: OFFICIAL_SERIES_ENTRY_URL, html: changedHtml, fetchedAt: later }, database, storage })
      expect(second.snapshotId).not.toBe(first.snapshotId)
      const query = sqliteDatabaseToQuery(database)
      const rows = await searchOfficialSeriesResults(query, { competition: '日本シリーズ', year: 2025 })
      expect(rows).toHaveLength(1)
      expect(rows[0]!.stats.snapshotId).toBe(second.snapshotId)
      // Simulate a later source declaring shorter coverage. The original 2026
      // fact remains stored, but cannot be silently mixed into the newer version.
      database.prepare('DELETE FROM official_series_results WHERE snapshot_id=? AND year=2026').run(second.snapshotId)
      database.prepare('UPDATE official_series_history_snapshots SET last_year=2025,row_count=6 WHERE snapshot_id=?').run(second.snapshotId)
      expect(await searchOfficialSeriesResults(query, { competition: '日本シリーズ', year: 2026 })).toEqual([])
      await expect(verifyOfficialSeriesArchive(database, storage)).rejects.toThrow('differs from its source archive')
    } finally { database.close() }
  })
})
