import { createHash } from 'node:crypto'
import { parseBisPlayerStatsHtml, type BisPlayerStatsRow } from '@npb/parser'
import type { SqliteDatabase } from './sqlite'
import { withTransaction } from './sqlite'
import type { ObjectStorage } from './object-storage'
import { officialStatisticIdentityIndex } from './official-statistic-identities'
import { verifiedOfficialRosterIdentities } from './official-roster-identities'

export type OfficialStatisticPage = {
  url: string; year: number; teamId: string; teamName: string
  level: 'first' | 'farm'; kind: 'batting' | 'pitching' | 'fielding'
}
type FetchPage = (url: string) => Promise<string>
const normalize = (value: string) => value.normalize('NFKC').replace(/[\s\u3000]/gu, '')
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

/** Follow published links. Never manufacture an archive URL by replacing a year. */
export async function discoverOfficialStatisticPages(
  input: { year: number; teamId: string; teamName: string; teamIndexUrl: string }, fetchPage: FetchPage,
): Promise<OfficialStatisticPage[]> {
  const index = await fetchPage(officialUrl(input.teamIndexUrl))
  const current = links(index, input.teamIndexUrl).find((url) => /\/bis\/\d{4}\/stats\/idb1_[a-z]+\.html$/u.test(url))
  if (!current) throw new Error('Official team index has no regular-season statistic link')
  const statisticHtml = await fetchPage(current)
  const backnumber = links(statisticHtml, current).find((url) => /\/stats\/backnumber\.html$/u.test(url))
  if (!backnumber) throw new Error('Official statistics have no archive link')
  const archive = await fetchPage(backnumber)
  const yearIndex = links(archive, backnumber).find((url) => new URL(url).pathname === `/bis/${input.year}/stats/`)
  if (!yearIndex) throw new Error(`Official archive does not publish year ${input.year}`)
  const yearHtml = await fetchPage(yearIndex)
  const farmIndex = links(yearHtml, yearIndex).find((url) => new URL(url).pathname === `/bis/${input.year}/stats/index_farm.html`)
  const pageLinks = [...links(yearHtml, yearIndex)]
  if (farmIndex) pageLinks.push(...links(await fetchPage(farmIndex), farmIndex))
  const pages: OfficialStatisticPage[] = []
  for (const url of new Set(pageLinks)) {
    const match = new URL(url).pathname.match(/^\/bis\/(\d{4})\/stats\/id([bpf])([12])_([a-z]+)\.html$/u)
    if (!match || Number(match[1]) !== input.year || match[4] !== input.teamId) continue
    pages.push({ url, year: input.year, teamId: input.teamId, teamName: input.teamName,
      level: match[3] === '1' ? 'first' : 'farm', kind: match[2] === 'b' ? 'batting' : match[2] === 'p' ? 'pitching' : 'fielding' })
  }
  if (!pages.some((page) => page.kind === 'batting' && page.level === 'first')) throw new Error('Archive lacks the requested team regular-season statistics')
  return pages
}

export function parseOfficialStatisticPage(html: string, page: OfficialStatisticPage): { rows: BisPlayerStatsRow[]; basisText: string | null } {
  officialUrl(page.url)
  const code = page.kind === 'batting' ? 'b' : page.kind === 'pitching' ? 'p' : 'f'
  if (new URL(page.url).pathname !== `/bis/${page.year}/stats/id${code}${page.level === 'first' ? '1' : '2'}_${page.teamId}.html`) {
    throw new Error(`Official statistic URL scope mismatch: ${page.url}`)
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1]?.replace(/<[^>]+>/gu, '') ?? ''
  const expectedKind = page.kind === 'batting' ? '打撃' : page.kind === 'pitching' ? '投手' : '守備'
  if (!title.includes(`${page.year}年度`) || !normalize(title).includes(normalize(page.teamName)) || !title.includes(`個人${expectedKind}成績`)) {
    throw new Error(`Official statistic page identity mismatch: ${page.url}`)
  }
  const required = page.kind === 'batting' ? ['打数', '安打', '本塁打'] : page.kind === 'pitching' ? ['防御率', '投球回'] : ['刺殺', '補殺', '失策']
  const parsed = parseBisPlayerStatsHtml(html, { year: page.year, teamId: page.teamId, teamName: page.teamName, sourceUrl: page.url })
  const rows = parsed.filter((row) => required.every((key) => key in row.values))
    .map((row, index) => ({ ...row, rowIndex: index + 1, playerName: row.playerName.replace(/^[*+＊＋]+/u, '').trim() }))
  if (!rows.length || rows.some((row) => !row.playerName)) throw new Error(`No validated statistic rows: ${page.url}`)
  const plain = html.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ')
  const basisText = plain.match(/\d{4}年\s*\d{1,2}月\s*\d{1,2}日[^。]{0,20}(?:現在|終了)/u)?.[0] ?? null
  return { rows, basisText }
}

/** Always perform a real GET; a cached page never receives a new fetch timestamp. */
export async function collectOfficialStatistics(input: {
  database: SqliteDatabase; storage: ObjectStorage; pages: OfficialStatisticPage[]; fetch?: typeof fetch; now?: () => Date
}): Promise<{ snapshots: number; rows: number }> {
  const fetchFn = input.fetch ?? fetch
  const identities = officialStatisticIdentityIndex(input.database, await verifiedOfficialRosterIdentities(input.database, input.storage))
  let count = 0
  for (const page of input.pages) {
    const response = await fetchFn(officialUrl(page.url), { headers: { 'user-agent': 'npb-archive-chat/0.1 (+https://npb.jp/)' }, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Official statistic fetch HTTP ${response.status}: ${page.url}`)
    if (response.url && response.url !== page.url) throw new Error(`Unexpected official statistic redirect: ${response.url}`)
    const html = await response.text()
    const fetchedAt = (input.now?.() ?? new Date()).toISOString()
    const { rows, basisText } = parseOfficialStatisticPage(html, page)
    const contentHash = digest(html)
    const snapshotId = digest(`${page.url}\n${contentHash}`)
    const rawKey = `raw/bis-statistics/${page.year}/${contentHash}.html`
    for (let attempt = 0; ; attempt++) {
      try { await input.storage.putText(rawKey, html, 'text/html; charset=utf-8'); break }
      catch (error) {
        if (attempt >= 2 || !/10001|ECONNRESET|ETIMEDOUT|fetch failed|temporar|HTTP (?:429|5\d\d)/iu.test(String(error))) throw error
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
      }
    }
    withTransaction(input.database, () => {
      input.database.prepare(`INSERT INTO official_statistic_snapshots
        (snapshot_id,source_url,target_year,team_id,team_name,level,statistic_kind,fetched_at,basis_text,content_hash,raw_key,row_count)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(snapshot_id) DO UPDATE SET fetched_at=excluded.fetched_at`)
        .run(snapshotId, page.url, page.year, page.teamId, page.teamName, page.level, page.kind, fetchedAt, basisText, contentHash, rawKey, rows.length)
      const insert = input.database.prepare(`INSERT INTO official_player_statistics
        (snapshot_id,row_index,player_id,player_name,normalized_name,metrics_json) VALUES (?,?,?,?,?,?)
        ON CONFLICT(snapshot_id,row_index) DO UPDATE SET player_id=COALESCE(official_player_statistics.player_id,excluded.player_id)`)
      for (const row of rows) {
        // Exact names require dated official membership proof too. Current-team
        // information alone cannot identify a historical namesake.
        const playerId = row.playerId ?? identities.resolve(row.playerName, page)
        insert.run(snapshotId, row.rowIndex, playerId, row.playerName, normalize(row.playerName), JSON.stringify(row.values))
      }
    })
    count += rows.length
  }
  return { snapshots: input.pages.length, rows: count }
}

function officialUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'npb.jp' || url.username || url.password || url.port || !url.pathname.startsWith('/bis/')) throw new Error('Untrusted official statistic URL')
  return url.href
}

function links(html: string, base: string): string[] {
  return [...html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/giu)].flatMap((match) => {
    try { return [officialUrl(new URL(match[1]!, base).href)] } catch { return [] }
  })
}
