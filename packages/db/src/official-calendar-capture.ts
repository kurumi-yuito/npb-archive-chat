import { prepareOfficialCalendarCapture, type CalendarCapture } from './official-calendar'

type Page = CalendarCapture['discovery'][number]
export type CalendarFetch = (url: string) => Promise<{ ok: boolean; status: number; url: string; text(): Promise<string> }>

function linkedUrl(page: Page, matches: (url: URL) => boolean) {
  const links = [...page.html.matchAll(/href=["']([^"']+)["']/giu)]
    .map((match) => new URL(match[1]!, page.sourceUrl))
    .filter((url) => url.origin === 'https://npb.jp' && !url.search && !url.hash && matches(url))
  const unique = [...new Set(links.map((url) => url.href))]
  if (unique.length !== 1) throw new Error('Official calendar discovery link is missing or ambiguous')
  return unique[0]!
}

/** Follow the public current roster and statistics navigation into the chosen calendar. */
export async function captureOfficialCalendar(year: number, month?: number, fetchPage: CalendarFetch = fetch): Promise<CalendarCapture> {
  if (!Number.isInteger(year) || year < 1936 || year > 2200 || (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12))) throw new Error('Invalid calendar capture scope')
  const pages: Page[] = []
  async function read(url: string) {
    const response = await fetchPage(url)
    if (!response.ok || response.url !== url) throw new Error(`Official calendar fetch failed (${response.status})`)
    const html = await response.text()
    if (!/<\/html\s*>/iu.test(html)) throw new Error('Incomplete official calendar discovery document')
    const page = { sourceUrl: url, html, fetchedAt: new Date().toISOString() }
    pages.push(page)
    return page
  }
  let page = await read('https://npb.jp/bis/teams/rst_db.html')
  page = await read(linkedUrl(page, (url) => /^\/bis\/\d{4}\/stats\/idb1_db\.html$/u.test(url.pathname)))
  page = await read(linkedUrl(page, (url) => /^\/bis\/\d{4}\/stats\/$/u.test(url.pathname)))
  if (page.sourceUrl !== `https://npb.jp/bis/${year}/stats/`) {
    page = await read(linkedUrl(page, (url) => /^\/bis\/\d{4}\/stats\/backnumber\.html$/u.test(url.pathname)))
    page = await read(linkedUrl(page, (url) => url.pathname === `/bis/${year}/stats/`))
  }
  if (month !== undefined) page = await read(linkedUrl(page, (url) => url.pathname === `/bis/${year}/calendar/index_${String(month).padStart(2, '0')}.html`))
  const capture = { ...page, discovery: pages.slice(0, -1) }
  prepareOfficialCalendarCapture(capture)
  return capture
}
