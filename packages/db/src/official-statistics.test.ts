import { describe, expect, it, vi } from 'vitest'
import { collectOfficialStatistics, discoverOfficialStatisticPages, parseOfficialStatisticPage, type OfficialStatisticPage } from './official-statistics'
import { openDatabase } from './sqlite'
import { migrateDatabase } from './migrations'
import type { ObjectStorage } from './object-storage'
import { sqliteDatabaseToQuery } from './query-driver'
import { searchOfficialStatisticRows } from './repository/official-statistics-repository'
import { searchBattingLines } from './repository/batting-repository'

const page: OfficialStatisticPage = { year: 2025, teamId: 's', teamName: '東京ヤクルトスワローズ', level: 'first', kind: 'fielding', url: 'https://npb.jp/bis/2025/stats/idf1_s.html' }
const html = `<title>2025年度 東京ヤクルトスワローズ 個人守備成績</title>
  <table><tr><th>選手</th><th>守備位置</th><th>刺殺</th><th>補殺</th><th>失策</th></tr>
  <tr><td>検証 選手</td><td>一塁手</td><td>10</td><td>2</td><td>0</td></tr>
  <tr><td>検証 選手</td><td>三塁手</td><td>3</td><td>4</td><td>1</td></tr></table>`

describe('official statistic source versions', () => {
  it('reads only the latest requested scope and uses its official ID for total verification', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      database.prepare(`INSERT INTO player_profiles(player_id,full_name,source_url,year_teams_json)
        VALUES ('official-id','検証 選手','https://npb.jp/bis/players/official-id.html','{"2025":"東京 ヤクルト"}')`).run()
      let document = `<title>2025年度 東京ヤクルトスワローズ 個人打撃成績</title>
        <table><tr><th>選手</th><th>打数</th><th>安打</th><th>本塁打</th></tr>
        <tr><td>検証 選手</td><td>10</td><td>3</td><td>1</td></tr></table>`
      const storage = { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage
      const fetch = vi.fn(async () => new Response(document)) as unknown as typeof globalThis.fetch
      const batting = { ...page, kind: 'batting' as const, url: 'https://npb.jp/bis/2025/stats/idb1_s.html' }
      await collectOfficialStatistics({ database, storage, fetch, pages: [batting], now: () => new Date('2026-11-03T00:00:00Z') })
      document = document.replace('<td>1</td>', '<td>2</td>')
      await collectOfficialStatistics({ database, storage, fetch, pages: [batting], now: () => new Date('2026-11-03T01:00:00Z') })
      const query = sqliteDatabaseToQuery(database)
      const filters = { year: 2025, team: 'ヤクルト', player_id: 'official-id' }
      const rows = await searchBattingLines(query, filters)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ playerId: 'official-id', sourceKind: 'bis_batting', sourceUrl: batting.url })
      expect(JSON.parse(rows[0]!.statsJson!).本塁打).toBe('2')
      expect(await searchBattingLines(query, { ...filters, player_id: 'different-id' })).toEqual([])
      expect(await searchOfficialStatisticRows(query, { ...filters, kind: 'batting', level: 'farm' })).toEqual([])
      expect(await searchOfficialStatisticRows(query, { ...filters, kind: 'batting', year: 2024 })).toEqual([])
    } finally { database.close() }
  })

  it('follows archive links and keeps regular and farm links distinct', async () => {
    const documents: Record<string, string> = {
      'https://npb.jp/bis/teams/index_s.html': '<a href="/bis/2026/stats/idb1_s.html">成績</a>',
      'https://npb.jp/bis/2026/stats/idb1_s.html': '<a href="backnumber.html">過年度</a>',
      'https://npb.jp/bis/2026/stats/backnumber.html': '<a href="/bis/2025/stats/">2025</a>',
      'https://npb.jp/bis/2025/stats/': '<a href="idb1_s.html">打撃</a><a href="index_farm.html">二軍</a><a href="idb1s1_s.html">CS</a>',
      'https://npb.jp/bis/2025/stats/index_farm.html': '<a href="idf2_s.html">守備</a>',
    }
    const fetchPage = vi.fn(async (url: string) => { if (!(url in documents)) throw new Error(`Unexpected URL ${url}`); return documents[url]! })
    const pages = await discoverOfficialStatisticPages({ year: 2025, teamId: 's', teamName: page.teamName, teamIndexUrl: 'https://npb.jp/bis/teams/index_s.html' }, fetchPage)
    expect(pages.map((entry) => [entry.level, entry.kind])).toEqual([['first', 'batting'], ['farm', 'fielding']])
    await expect(discoverOfficialStatisticPages({ year: 2024, teamId: 's', teamName: page.teamName, teamIndexUrl: 'https://npb.jp/bis/teams/index_s.html' }, fetchPage)).rejects.toThrow('does not publish year 2024')
  })

  it('rejects a mismatched year before persisting any statistic', () => {
    expect(() => parseOfficialStatisticPage(html.replaceAll('2025', '2026'), page)).toThrow('identity mismatch')
  })

  it('leaves a full-name match unresolved when its official membership belongs to another year', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      database.prepare(`INSERT INTO player_profiles(player_id,full_name,team_name,year_teams_json,source_url)
        VALUES ('retired-id','検証 選手','ヤクルト','{"2020":"ヤクルト"}','https://npb.jp/bis/players/retired-id.html')`).run()
      await collectOfficialStatistics({ database, pages: [page],
        storage: { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage,
        fetch: vi.fn(async () => new Response(html)) as unknown as typeof globalThis.fetch })
      expect(database.prepare('SELECT DISTINCT player_id FROM official_player_statistics').all()).toEqual([{ player_id: null }])
    } finally { database.close() }
  })

  it('preserves two positions, farm rows and changed source versions, without duplicate ingestion', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      database.prepare(`INSERT INTO player_profiles(player_id,full_name,source_url,year_teams_json)
        VALUES ('official-id','検証 選手','https://npb.jp/bis/players/official-id.html','{"2025":"ヤクルト"}')`).run()
      let document = html
      let time = '2026-11-03T00:00:00Z'
      const storage = { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage
      const fetch = vi.fn(async () => new Response(document)) as unknown as typeof globalThis.fetch
      const run = (pages = [page]) => collectOfficialStatistics({ database, storage, pages, fetch, now: () => new Date(time) })
      await run()
      time = '2026-11-03T01:00:00Z'
      await run()
      expect(database.prepare('SELECT * FROM official_statistic_snapshots').all()).toHaveLength(1)
      expect(database.prepare('SELECT * FROM official_player_statistics').all()).toMatchObject([
        { player_id: 'official-id', row_index: 1 }, { player_id: 'official-id', row_index: 2 },
      ])
      await run([{ ...page, level: 'farm', url: 'https://npb.jp/bis/2025/stats/idf2_s.html' }])
      document = html.replace('<td>10</td>', '<td>11</td>')
      time = '2026-11-03T02:00:00Z'
      await run()
      expect(database.prepare('SELECT * FROM official_statistic_snapshots').all()).toHaveLength(3)
      expect(database.prepare('SELECT * FROM official_player_statistics').all()).toHaveLength(6)
      expect(fetch).toHaveBeenCalledTimes(4)
    } finally { database.close() }
  })
})
