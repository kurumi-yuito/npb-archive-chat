import { describe, expect, it } from 'vitest'
import { captureOfficialCalendar } from './official-calendar-capture'

const seed = 'https://npb.jp/bis/teams/rst_db.html'
const stat = 'https://npb.jp/bis/2026/stats/idb1_db.html'
const root = 'https://npb.jp/bis/2026/stats/'
const back = 'https://npb.jp/bis/2026/stats/backnumber.html'
const historic = 'https://npb.jp/bis/2025/stats/'

describe('official calendar source discovery', () => {
  it('follows source links and fails when the requested year is not linked', async () => {
    const pages = new Map([[seed, `<a href="${stat}">打撃</a></html>`], [stat, `<a href="${root}">成績</a></html>`],
      [root, `<a href="${back}">過去</a></html>`], [back, '</html>']])
    const visited: string[] = []
    await expect(captureOfficialCalendar(2025, undefined, async (url) => {
      visited.push(url)
      return { ok: true, status: 200, url, text: async () => pages.get(url)! }
    })).rejects.toThrow('missing or ambiguous')
    expect(visited).toEqual([seed, stat, root, back])
    expect(visited).not.toContain(historic)
  })

  it('rejects redirects and partial discovery responses', async () => {
    await expect(captureOfficialCalendar(2025, undefined, async () => ({ ok: true, status: 200, url: stat, text: async () => '</html>' }))).rejects.toThrow('fetch failed')
    await expect(captureOfficialCalendar(2025, undefined, async (url) => ({ ok: true, status: 200, url, text: async () => '<html>' }))).rejects.toThrow('Incomplete')
  })
})
