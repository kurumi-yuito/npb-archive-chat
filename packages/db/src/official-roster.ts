import { createHash } from 'node:crypto'
import { parseBisTeamRosterHtml, type BisCurrentRosterEntry, type BisSourceSnapshot, type BisTeamInfo } from '@npb/parser'
import type { ObjectStorage } from './object-storage'

/** Current roster URLs are discovered, and their published year is checked. */
export async function captureOfficialRoster(input: {
  year: number; team: BisTeamInfo; storage: ObjectStorage; fetch?: typeof fetch; now?: () => Date
}): Promise<{ entries: BisCurrentRosterEntry[]; snapshot: BisSourceSnapshot }> {
  const fetchFn = input.fetch ?? fetch
  const get = async (url: string) => {
    let error: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetchFn(url, { headers: { 'user-agent': 'npb-archive-chat/0.1 (+https://npb-chat.dom9th-works.com/)' }, signal: AbortSignal.timeout(30_000) })
        if (response.ok) {
          if (response.url && response.url !== url) throw new Error(`Unexpected official roster redirect: ${response.url}`)
          return { html: await response.text(), fetchedAt: (input.now?.() ?? new Date()).toISOString() }
        }
        error = new Error(`Official roster HTTP ${response.status}: ${url}`)
        if (response.status !== 429 && response.status < 500) throw error
      } catch (caught) {
        error = caught
        if (!/fetch failed|timeout|HTTP (?:429|5\d\d)/iu.test(String(caught))) throw caught
      }
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
    }
    throw error
  }
  const put = async (key: string, text: string, type: string) => {
    for (let attempt = 0; ; attempt++) {
      try { await input.storage.putText(key, text, type); return }
      catch (error) {
        if (attempt >= 2 || !/10001|ECONNRESET|ETIMEDOUT|fetch failed|temporar|HTTP (?:429|5\d\d)/iu.test(String(error))) throw error
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
      }
    }
  }
  const indexUrl = `https://npb.jp/bis/teams/index_${input.team.teamId}.html`
  const index = await get(indexUrl)
  const urls = [...index.html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/giu)].map((match) => {
    try { return new URL(match[1]!, indexUrl) } catch { return null }
  })
  const rosterUrl = urls.find((url) => url?.protocol === 'https:' && url.hostname === 'npb.jp' && url.pathname === `/bis/teams/rst_${input.team.teamId}.html`)?.href
  if (!rosterUrl) throw new Error('Official team index has no matching roster link')
  const { html, fetchedAt } = await get(rosterUrl)
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1]?.normalize('NFKC').replace(/\s+/gu, '') ?? ''
  if (!title.includes(input.team.teamName.normalize('NFKC').replace(/\s+/gu, '')) || !title.includes(`${input.year}年度選手一覧`)) throw new Error('Official roster year/team does not match the requested scope')
  const basisText = html.match(/class=["'][^"']*\brosterUpdate\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1]?.replace(/<[^>]+>/gu, '').replace(/\s+/gu, ' ').trim() ?? null
  const entries = parseBisTeamRosterHtml(html, { year: input.year, ...input.team, sourceUrl: rosterUrl })
  if (!entries.length) throw new Error('Official roster contained no validated player entries')
  const contentHash = createHash('sha256').update(html).digest('hex')
  const rawKey = `raw/bis/${input.year}/rst_${input.team.teamId}/${contentHash}.html`
  const structuredKey = `structured/bis/${input.year}/rst_${input.team.teamId}/${contentHash}.json`
  const indexHash = createHash('sha256').update(index.html).digest('hex')
  const indexRawKey = `raw/bis/${input.year}/index_${input.team.teamId}/${indexHash}.html`
  const snapshot: BisSourceSnapshot = { sourceKey: `bis:${input.year}:${input.team.teamId}:rst_${input.team.teamId}:${contentHash}`,
    sourceType: 'team_roster', sourceUrl: rosterUrl, rawPath: `data/${rawKey}`, structuredPath: `data/${structuredKey}`, fetchedAt, contentHash, basisText }
  await put(indexRawKey, index.html, 'text/html; charset=utf-8')
  await put(rawKey, html, 'text/html; charset=utf-8')
  await put(structuredKey, JSON.stringify({ source: snapshot, discovery: { url: indexUrl, fetchedAt: index.fetchedAt, rawPath: `data/${indexRawKey}`, contentHash: indexHash }, entries }, null, 2), 'application/json; charset=utf-8')
  return { entries, snapshot }
}
