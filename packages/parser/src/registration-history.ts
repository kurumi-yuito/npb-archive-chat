import { cleanText, extractTopLevelCells, extractTopLevelElements, parseCell, stripTags } from './scores-utils'

export type RegistrationPageScope = { year: number; teamId: string; teamName: string; kind: 'registered' | 'development'; sourceUrl: string }
export type RegistrationHistoryEntry = {
  rowIndex: number; playerId: string | null; playerName: string; position: string; uniformNumber: string;
  announcementDateText: string; removed: boolean; removalDates: string[]; membershipInYear: boolean | null; literal: string;
}

/** Annual registration lists retain removed players too. A listing is not a
 * current contract, nor proof that a pre-season departure stayed that year. */
export function parseOfficialRegistrationHistory(html: string, scope: RegistrationPageScope): { entries: RegistrationHistoryEntry[]; declaredActive: number; currentContractConfirmed: false } {
  const url = new URL(scope.sourceUrl), filename = scope.kind === 'registered' ? 'registered' : 'registereddev'
  if (url.protocol !== 'https:' || url.hostname !== 'npb.jp' || url.pathname !== `/announcement/${scope.year}/${filename}_${scope.teamId}.html` || url.search || url.hash) throw new Error('Registration URL scope mismatch')
  const compact = (value: string) => value.normalize('NFKC').replace(/\s+/gu, '')
  const title = compact(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? '')
  if (!title.includes(`${scope.year}年度${scope.kind === 'registered' ? '支配下' : '育成'}選手登録`) || !title.includes(compact(scope.teamName))) throw new Error('Registration published year/team mismatch')
  const playerId = (link: string | null) => {
    if (!link) return null
    try {
      const player = new URL(link, scope.sourceUrl)
      return ['http:', 'https:'].includes(player.protocol) && player.hostname === 'npb.jp' ? /^\/bis\/players\/(\d{8})\.html$/u.exec(player.pathname)?.[1] ?? null : null
    } catch { return null }
  }
  const removals = new Map<string, string[]>()
  for (const row of extractTopLevelElements(html, 'tr')) {
    const cells = extractTopLevelCells(row).map(parseCell)
    if (cells[0]?.text.trim() !== '▼') continue
    const date = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/u.exec(cells[1]?.text.trim() ?? '')
    const link = cells.flatMap((cell) => cell.links).find((item) => playerId(item.url))
    if (!date || !link) continue
    const iso = `${date[1]}-${date[2]!.padStart(2, '0')}-${date[3]!.padStart(2, '0')}`
    const parsedDate = new Date(`${iso}T00:00:00Z`)
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== iso) throw new Error('Invalid registration change date')
    const id = playerId(link.url)!
    removals.set(id, [...(removals.get(id) ?? []), iso])
  }
  const sections = extractTopLevelElements(html, 'section').filter((section) => /公示日/u.test(section) && /選手名/u.test(section))
  if (sections.length !== 1) throw new Error('Registration main list is not unique')
  const section = sections[0]!, declared = /(\d+)\s*名/u.exec(cleanText(stripTags(section)))
  if (!declared) throw new Error('Registration list lacks a declared active count')
  const entries: RegistrationHistoryEntry[] = []
  for (const row of extractTopLevelElements(section, 'tr')) {
    const cells = extractTopLevelCells(row).map(parseCell)
    if (cells.length !== 4 || !/^\d{1,2}\/\d{1,2}$/u.test(cells[0]!.text.trim())) continue
    const link = cells[3]!.links.find((item) => playerId(item.url))
    const id = link ? playerId(link.url) : null, name = link?.name || cells[3]!.text
    if (!name.trim()) throw new Error('Registration entry lacks a name')
    const removed = /^<tr\b[^>]*\bclass=["'][^"']*\bxxx\b/iu.test(row)
    const dates = id ? removals.get(id) ?? [] : []
    const membership = !removed ? true : dates.length ? dates.some((date) => Number(date.slice(0, 4)) >= scope.year) : null
    entries.push({ rowIndex: entries.length + 1, playerId: id, playerName: cleanText(name), position: cells[1]!.text.normalize('NFKC').replace(/\s+/gu, ''),
      uniformNumber: cells[2]!.text, announcementDateText: cells[0]!.text, removed, removalDates: dates,
      membershipInYear: membership, literal: cleanText(stripTags(row)) })
  }
  const declaredActive = Number(declared[1])
  if (!entries.length || entries.filter((entry) => !entry.removed).length !== declaredActive) throw new Error('Registration active count mismatch')
  return { entries, declaredActive, currentContractConfirmed: false }
}
