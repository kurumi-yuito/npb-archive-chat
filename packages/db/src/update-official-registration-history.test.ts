import { describe, expect, it, vi } from 'vitest'
import { runOfficialRegistrationHistoryUpdate } from './update-official-registration-history'
import { BIS_TEAMS } from './bis-current'

describe('official registration archive discovery', () => {
  it('follows the published HTML refresh and archive links before selecting a complete year', async () => {
    const requested: string[] = []
    const pages = new Map([
      ['https://npb.jp/announcement/', '<meta http-equiv="Refresh" content="0;URL=/announcement/2026/" />'],
      ['https://npb.jp/announcement/2026/', '<a href="../backnumber.html">過去の公示</a>'],
      ['https://npb.jp/announcement/backnumber.html', '<a href="2025/">2025年度</a>'],
      ['https://npb.jp/announcement/2025/', BIS_TEAMS.flatMap((team) => ['registered', 'registereddev'].map((kind) => `<a href="${kind}_${team.teamId}.html">登録</a>`)).join('')],
    ])
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input); requested.push(url)
      if (!pages.has(url)) throw new Error(`Unpublished URL requested: ${url}`)
      return new Response(pages.get(url))
    }) as unknown as typeof globalThis.fetch
    const result = await runOfficialRegistrationHistoryUpdate({ year: 2025, dryRun: true, workspaceRoot: '/tmp', delayMs: 0 }, { fetch })
    expect(requested).toEqual([...pages.keys()])
    expect(result.pages).toHaveLength(24)
    expect(result.published).toBe(false)
    pages.set('https://npb.jp/announcement/', '<meta http-equiv="Refresh" content="0;URL=https://example.com/announcement/2026/" />')
    await expect(runOfficialRegistrationHistoryUpdate({ year: 2025, dryRun: true, workspaceRoot: '/tmp', delayMs: 0 }, { fetch })).rejects.toThrow('Untrusted announcement refresh')
  })
})
