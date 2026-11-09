import { createHash } from 'node:crypto'
import path from 'node:path'
import { findWorkspaceRoot } from '@npb/crawler'
import { BIS_TEAMS, type UpdateBisCurrentArgs } from './bis-current'
import { createObjectStorage } from './object-storage'
import { openDatabase } from './sqlite'
import { migrateDatabase } from './migrations'
import { captureOfficialRegistrationHistory } from './official-registration-history'
import type { RegistrationPageScope } from '@npb/parser'

export async function runOfficialRegistrationHistoryUpdate(args: UpdateBisCurrentArgs, dependencies: { fetch?: typeof fetch; now?: () => Date } = {}) {
  const year = args.year
  const currentYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date()))
  if (!year || !Number.isInteger(year) || year < 1936 || year > currentYear) throw new Error('Registration history requires an explicit published past/current year')
  const workspaceRoot = args.workspaceRoot ?? await findWorkspaceRoot(process.cwd())
  const sqlitePath = args.sqlitePath ?? path.join(workspaceRoot, 'data', 'staging', 'official-registration', `npb-${year}.sqlite`)
  const storage = createObjectStorage({ mode: args.storage ?? 'local', workspaceRoot, bucket: args.r2Bucket, prefix: args.r2Prefix, endpoint: args.r2Endpoint })
  const fetchFn = dependencies.fetch ?? fetch
  const captures: Array<{ url: string; rawKey: string; contentHash: string; fetchedAt: string }> = []
  const get = async (url: string) => {
    const parsed = new URL(url)
    if (parsed.origin !== 'https://npb.jp' || parsed.search || parsed.hash) throw new Error('Untrusted registration discovery URL')
    if ((args.delayMs ?? 500) > 0) await new Promise((resolve) => setTimeout(resolve, args.delayMs ?? 500))
    const response = await fetchFn(url, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': args.userAgent ?? 'npb-archive-chat/0.1 (+https://npb.jp/)' } })
    if (!response.ok || (response.url && response.url !== url)) throw new Error(`Registration discovery HTTP ${response.status}: ${url}`)
    const html = await response.text(), fetchedAt = (dependencies.now?.() ?? new Date()).toISOString()
    const contentHash = createHash('sha256').update(html).digest('hex'), rawKey = `raw/official-registration-discovery/${contentHash}.html`
    if (!args.dryRun) await storage.putText(rawKey, html, 'text/html; charset=utf-8')
    captures.push({ url, rawKey, contentHash, fetchedAt })
    return { html, url, rawKey, contentHash, fetchedAt }
  }
  const links = (html: string, base: string) => [...new Set([...html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/giu)].flatMap((match) => {
    try { const url = new URL(match[1]!, base); return url.origin === 'https://npb.jp' && !url.search && !url.hash ? [url.href] : [] } catch { return [] }
  }))]
  let root = await get('https://npb.jp/announcement/')
  // The announcement root is a published HTML refresh, rather than an HTTP
  // redirect. Follow only its explicit same-site annual index link.
  const refresh = root.html.match(/<meta\b[^>]*http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["']\s*0\s*;\s*URL=([^"']+)["'][^>]*>/iu)
  if (refresh) {
    const target = new URL(refresh[1]!, root.url)
    if (target.origin !== 'https://npb.jp' || !/^\/announcement\/\d{4}\/$/u.test(target.pathname) || target.search || target.hash) throw new Error('Untrusted announcement refresh target')
    root = await get(target.href)
  }
  const backnumberUrl = links(root.html, root.url).find((url) => new URL(url).pathname === '/announcement/backnumber.html')
  if (!backnumberUrl) throw new Error('Official announcements lack the archive link')
  const backnumber = await get(backnumberUrl)
  const yearUrl = links(backnumber.html, backnumber.url).find((url) => new URL(url).pathname === `/announcement/${year}/`)
  if (!yearUrl) throw new Error(`Official announcement archive does not publish ${year}`)
  const index = await get(yearUrl)
  const teams = BIS_TEAMS.filter((team) => !args.team || team.teamId === args.team || team.teamName === args.team)
  if (!teams.length) throw new Error('Unknown registration team')
  const pages: RegistrationPageScope[] = []
  for (const sourceUrl of links(index.html, index.url)) {
    const match = new URL(sourceUrl).pathname.match(/^\/announcement\/(\d{4})\/(registered|registereddev)_([a-z]+)\.html$/u)
    const team = match && teams.find((entry) => entry.teamId === match[3])
    if (!match || Number(match[1]) !== year || !team) continue
    pages.push({ year, ...team, kind: match[2] === 'registered' ? 'registered' : 'development', sourceUrl })
  }
  if (pages.length !== teams.length * 2 || teams.some((team) => !['registered', 'development'].every((kind) => pages.some((page) => page.teamId === team.teamId && page.kind === kind)))) throw new Error('Registration archive lacks a complete requested team/page set')
  if (args.dryRun) return { year, sqlitePath, pages, captures, dryRun: true, published: false }
  const database = openDatabase(sqlitePath)
  try {
    migrateDatabase(database)
    const results = []
    for (const scope of pages) {
      if ((args.delayMs ?? 500) > 0) await new Promise((resolve) => setTimeout(resolve, args.delayMs ?? 500))
      results.push(await captureOfficialRegistrationHistory({ database, storage, scope, discovery: index, fetch: fetchFn, now: dependencies.now }))
    }
    return { year, sqlitePath, pages, captures, results, rows: results.reduce((sum, entry) => sum + entry.rows, 0), identities: results.reduce((sum, entry) => sum + entry.identities, 0), published: false }
  } finally { database.close() }
}
