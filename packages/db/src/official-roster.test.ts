import { describe, expect, it, vi } from 'vitest'
import { captureOfficialRoster } from './official-roster'
import type { ObjectStorage } from './object-storage'

const team = { teamId: 't', teamName: '阪神タイガース' }
const roster = `<title>2026年度選手一覧 阪神タイガース</title><div class="rosterUpdate">2026年度シーズン終了 現在</div>
<table><tr><th>No.</th><th>外野手</th><th>投</th><th>打</th><th>備考</th></tr>
<tr><td>1</td><td><a href="/bis/players/11111111.html">検証 選手</a></td><td>右</td><td>左</td><td>自由契約選手</td></tr></table>`

describe('official roster capture', () => {
  it('discovers and fetches the current page afresh, archiving the published basis and remarks', async () => {
    const storage = { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage
    const fetch = vi.fn(async (url: string | URL | Request) => new Response(String(url).includes('index_')
      ? '<a href="rst_t.html">選手一覧</a>' : roster)) as unknown as typeof globalThis.fetch
    const run = () => captureOfficialRoster({ year: 2026, team, storage, fetch, now: () => new Date('2026-11-04T00:00:00Z') })
    const result = await run()
    await run()
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(result.entries).toMatchObject([{ playerId: '11111111', position: '外野手', throws: '右', bats: '左', remarks: '自由契約選手' }])
    expect(result.snapshot).toMatchObject({ fetchedAt: '2026-11-04T00:00:00.000Z', basisText: '2026年度シーズン終了 現在' })
    const archived = (storage.putText as ReturnType<typeof vi.fn>).mock.calls.find(([key]) => key.startsWith('structured/'))
    expect(JSON.parse(archived![1]).entries[0].remarks).toBe('自由契約選手')
    expect(result.entries[0]).not.toHaveProperty('active')
  })

  it('rejects an unversioned current roster requested as a past season before storing anything', async () => {
    const storage = { putText: vi.fn() } as unknown as ObjectStorage
    const fetch = vi.fn(async (url: string | URL | Request) => new Response(String(url).includes('index_')
      ? '<a href="rst_t.html">選手一覧</a>' : roster)) as unknown as typeof globalThis.fetch
    await expect(captureOfficialRoster({ year: 2025, team, storage, fetch })).rejects.toThrow('year/team')
    expect(storage.putText).not.toHaveBeenCalled()
  })
})
