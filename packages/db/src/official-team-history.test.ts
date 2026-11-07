import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { openDatabase } from './sqlite'
import { migrateDatabase } from './migrations'
import { captureOfficialTeamHistory, parseOfficialTeamHistory } from './official-team-history'
import type { ObjectStorage } from './object-storage'

const html = readFileSync(new URL('../../parser/src/__fixtures__/bis-team-yearly-giants.html', import.meta.url), 'utf8')
const team = { teamId: 'g', teamName: '読売ジャイアンツ' }
const sourceUrl = 'https://npb.jp/bis/teams/yearly_g.html'
describe('B28 official club season capture', () => {
  it('discovers the real history link, stores its dated raw evidence and keeps period rows separate', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const storage = { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage
      const fetch = vi.fn(async (url: string) => new Response(url === sourceUrl ? html : '<a href="yearly_g.html">年度別成績</a>'))
      const result = await captureOfficialTeamHistory({ database, storage, team, targetYear: 2026, fetch: fetch as unknown as typeof globalThis.fetch, now: () => new Date('2026-11-06T00:00:00Z') })
      expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://npb.jp/bis/teams/index_g.html', sourceUrl])
      expect(result.rows).toHaveLength(93)
      expect(result.rows.find((row) => row.seasonLabel === '2026')?.metrics).toMatchObject({ 勝利: '76', 敗北: '64', 引分: '3', 順位: '2' })
      expect(result.rows.filter((row) => row.year === 1937).map((row) => row.seasonLabel)).toEqual(['1937春', '1937秋'])
      expect(result.basisText).toContain('2026年度シーズン終了')
      expect(result.fetchedAt).toBe('2026-11-06T00:00:00.000Z')
      expect(storage.putText).toHaveBeenCalledTimes(3)
      expect(database.prepare('SELECT COUNT(*) AS n FROM official_team_seasons').get()).toEqual({ n: 93 })
      await captureOfficialTeamHistory({ database, storage, team, targetYear: 2026, fetch: fetch as unknown as typeof globalThis.fetch })
      expect(database.prepare('SELECT COUNT(*) AS n FROM official_team_history_snapshots').get()).toEqual({ n: 1 })
      expect(database.prepare('SELECT COUNT(*) AS n FROM official_team_seasons').get()).toEqual({ n: 93 })
    } finally { database.close() }
  })
  it('rejects a modern-season count inconsistency instead of filling or deleting records', () => {
    const fragment = '<td>76</td><td>64</td><td>3</td>'
    expect(html).toContain(fragment)
    expect(() => parseOfficialTeamHistory(html.replace(fragment, '<td>75</td><td>64</td><td>3</td>'), { team, targetYear: 2026, sourceUrl })).toThrow('games and decisions disagree')
    expect(() => parseOfficialTeamHistory(html, { team, targetYear: 2025, sourceUrl })).toThrow('year/period coverage mismatch')
  })
  it('keeps the DB unchanged when raw evidence cannot be saved', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      await expect(captureOfficialTeamHistory({ database, storage: { putText: vi.fn().mockRejectedValue(new Error('storage unavailable')) } as unknown as ObjectStorage,
        team, targetYear: 2026, fetch: vi.fn(async (url: string) => new Response(url === sourceUrl ? html : '<a href="yearly_g.html">年度別成績</a>')) as unknown as typeof fetch })).rejects.toThrow('storage unavailable')
      expect(database.prepare('SELECT COUNT(*) AS n FROM official_team_history_snapshots').get()).toEqual({ n: 0 })
    } finally { database.close() }
  })
})
