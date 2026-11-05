import { describe, expect, it, vi } from 'vitest'
import { captureOfficialPlayerProfile } from './official-player-profile'
import { openDatabase } from './sqlite'
import { migrateDatabase } from './migrations'
import type { ObjectStorage } from './object-storage'
import { verifiedPlayerCareerRows, officialInningsOuts } from '@npb/schemas'

const html = `<title>検証 太郎（阪神タイガース） | 個人年度別成績 | NPB.jp 日本野球機構</title>
<meta property="og:url" content="http://npb.jp/bis/players/proof-id.html"><time>2026年シーズン終了時</time>
<table><tr><th>年度</th><th>所属球団</th><th>登板</th><th>勝利</th><th>投球回</th><th>自責点</th><th>防御率</th></tr>
<tr><td>2025</td><td>阪 神</td><td>10</td><td>2</td><td>30 .1</td><td>10</td><td>2.97</td></tr>
<tr><td>2026</td><td>阪 神</td><td>11</td><td>3</td><td>40 .2</td><td>10</td><td>2.21</td></tr>
<tr><th></th><th>通\u3000算</th><th>21</th><th>5</th><th>71</th><th>20</th><th>2.54</th></tr></table>`

describe('verified official player profile capture', () => {
  it('counts official innings in outs, preserving plus notation without inventing an out', () => {
    expect(officialInningsOuts('+')).toBe(0)
    expect(officialInningsOuts('0 ＋')).toBe(0)
    expect(officialInningsOuts('11 .1')).toBe(34)
    expect(officialInningsOuts('11 .2')).toBe(35)
    expect(() => officialInningsOuts('11.3')).toThrow()
  })
  it('archives the real response and retains aliases and unknown contract status during an ID upsert', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      database.prepare(`INSERT INTO player_profiles(player_id,full_name,source_url,active,metadata) VALUES ('proof-id','旧 登録名','https://npb.jp/bis/players/proof-id.html',0,'{"retained":true}')`).run()
      database.prepare(`INSERT INTO player_aliases(player_id,alias,normalized_alias,alias_type,source_type)
        VALUES ('proof-id','旧 登録名','旧登録名','registered_name','player_profile')`).run()
      const storage = { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage
      const evidence = await captureOfficialPlayerProfile({ playerId: 'proof-id', database, storage,
        fetch: vi.fn(async () => new Response(html)) as unknown as typeof fetch, now: () => new Date('2026-11-04T00:00:00Z') })
      expect(verifiedPlayerCareerRows(evidence)[0]!.metrics.勝利).toBe('5')
      expect(storage.putText).toHaveBeenCalledTimes(2)
      const row = database.prepare("SELECT full_name,active,metadata FROM player_profiles WHERE player_id='proof-id'").get() as { full_name: string; active: number; metadata: string }
      expect(row.full_name).toBe('検証 太郎')
      expect(row.active).toBe(0)
      expect(JSON.parse(row.metadata)).toMatchObject({ retained: true, official_profile_evidence: { basisText: '2026年シーズン終了時' } })
      expect(database.prepare('SELECT count(*) AS count FROM player_aliases').get()).toEqual({ count: 1 })
    } finally { database.close() }
  })

  it('rejects conflicting career values or declared IDs without archiving or writing', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const storage = { putText: vi.fn() } as unknown as ObjectStorage
      for (const document of [html.replace('<th>5</th>', '<th>6</th>'), html.replace('players/proof-id.html', 'players/other-id.html')]) {
        await expect(captureOfficialPlayerProfile({ playerId: 'proof-id', database, storage,
          fetch: vi.fn(async () => new Response(document)) as unknown as typeof fetch })).rejects.toThrow()
      }
      expect(storage.putText).not.toHaveBeenCalled()
      expect(database.prepare('SELECT count(*) AS count FROM player_profiles').get()).toEqual({ count: 0 })
    } finally { database.close() }
  })
})
