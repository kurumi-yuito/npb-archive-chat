import { officialCalendarFactsSchema, type OfficialCalendarFacts } from '@npb/schemas'
import { cleanText, stripTags, extractTopLevelCells, extractTopLevelElements } from './scores-utils.js'

const teams: Record<string, string> = {
  巨: '読売ジャイアンツ', 神: '阪神タイガース', デ: '横浜DeNAベイスターズ', 広: '広島東洋カープ',
  ヤ: '東京ヤクルトスワローズ', 中: '中日ドラゴンズ', ソ: '福岡ソフトバンクホークス',
  日: '北海道日本ハムファイターズ', ロ: '千葉ロッテマリーンズ', 楽: '東北楽天ゴールデンイーグルス',
  オ: 'オリックス・バファローズ', 西: '埼玉西武ライオンズ',
}
const text = (html: string) => cleanText(stripTags(html))
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()
const isoDate = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

/** Closed official calendars supply bounded period and fixture evidence. */
export function parseOfficialCalendar(html: string, sourceUrl: string): OfficialCalendarFacts {
  const url = new URL(sourceUrl)
  const scope = url.pathname.match(/^\/bis\/(\d{4})\/(?:stats\/?|calendar\/index_(\d{2})\.html)$/u)
  if (url.origin !== 'https://npb.jp' || url.search || url.hash || !scope || !/<\/html\s*>/iu.test(html) || !html.includes('全日程終了')) throw new Error('Official closed calendar source required')
  const year = Number(scope[1]), month = scope[2] ? Number(scope[2]) : null
  const title = text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? '')
  if (!title.startsWith(`${year}年度`) || !title.includes(month ? 'カレンダー' : '公式戦成績')) throw new Error('Calendar source year/title mismatch')
  if (month === null) {
    const navigation = html.match(/<div\b[^>]*class=["'][^"']*\bstcalendar\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1]
    if (!navigation) throw new Error('Season calendar navigation missing')
    const months: number[] = [], calendarUrls: string[] = []
    for (const anchor of navigation.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu)) {
      const target = new URL(anchor[1]!, url)
      const targetScope = target.pathname.match(/^\/(?:bis\/(\d{4})\/calendar\/index_(\d{2})\.html|games\/(\d{4})\/schedule_(\d{2})_detail\.html)$/u)
      const namedMonths = text(anchor[2]!).match(/\d+/gu)?.map(Number) ?? []
      if (target.origin !== url.origin || target.search || target.hash || !targetScope || Number(targetScope[1] ?? targetScope[3]) !== year ||
        !namedMonths.length || Math.max(...namedMonths) !== Number(targetScope[2] ?? targetScope[4]) ||
        namedMonths.some((value) => value < 1 || value > 12)) throw new Error('Calendar navigation scope mismatch')
      calendarUrls.push(target.href); months.push(...namedMonths)
    }
    const first = Math.min(...months), last = Math.max(...months)
    if (!months.length || new Set(months).size !== last - first + 1 || new Set(calendarUrls).size !== calendarUrls.length) throw new Error('Incomplete calendar month navigation')
    const standings: Extract<OfficialCalendarFacts, { kind: 'season' }>['standings'] = []
    for (const league of ['central', 'pacific'] as const) {
      const table = html.match(new RegExp(`class=["'][^"']*standing_table--${league}[^"']*["'][^>]*>\\s*(<table\\b[\\s\\S]*?<\\/table>)`, 'iu'))?.[1]
      if (!table) throw new Error('Official league standings missing')
      const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/iu)?.[1] ?? ''
      const rows = extractTopLevelElements(body, 'tr')
      if (rows.length !== 6) throw new Error('Incomplete official league standings')
      for (const row of rows) {
        const cells = extractTopLevelCells(row)
        const team = text(cells[0]?.match(/<span\b[^>]*class=["']hide_sp["'][^>]*>([\s\S]*?)<\/span>/iu)?.[1] ?? '')
        const counts = cells.slice(1, 5).map((cell) => text(cell))
        const rate = text(cells[5] ?? '')
        if (!Object.values(teams).includes(team) || counts.length !== 4 || counts.some((value) => !/^\d+$/u.test(value)) || !/^(?:0?\.\d+|1\.0+)$/u.test(rate)) throw new Error('Invalid official club season counts')
        const [games, wins, losses, draws] = counts.map(Number)
        if (!games || wins! + losses! === 0 || games !== wins! + losses! + draws! || Math.abs(Number(rate) - wins! / (wins! + losses!)) > 0.00050001) throw new Error('Official club season decisions disagree')
        standings.push({ team, league, games: games!, wins: wins!, losses: losses!, draws: draws!, winRate: Number(rate) })
      }
    }
    if (new Set(standings.map((row) => row.team)).size !== 12) throw new Error('Duplicate official clubs')
    return officialCalendarFactsSchema.parse({ version: 1, kind: 'season', year,
      calendarFrom: isoDate(year, first, 1), calendarTo: isoDate(year, last, lastDay(year, last)), calendarUrls, standings })
  }
  if (month < 1 || month > 12 || !title.includes(`${month}月`)) throw new Error('Calendar month/title mismatch')
  const dates: string[] = []
  const games: Extract<OfficialCalendarFacts, { kind: 'month' }>['games'] = []
  for (const cell of html.matchAll(/<td\b[^>]*class=["']stschedule["'][^>]*>([\s\S]*?)<\/td>/giu)) {
    const dayHtml = cell[1]!.match(/<div\b[^>]*class=["']teschedate["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1]
    if (dayHtml === undefined) continue
    const day = Number(text(dayHtml))
    if (!Number.isInteger(day) || day < 1 || day > lastDay(year, month)) throw new Error('Invalid official calendar day')
    const date = isoDate(year, month, day)
    dates.push(date)
    for (const anchor of cell[1]!.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu)) {
      const target = new URL(anchor[1]!, url)
      const daily = target.pathname.match(/^\/bis\/(\d{4})\/games\/gm(\d{8})\.html$/u)
      if (daily && target.origin === url.origin && !target.search && !target.hash && Number(daily[1]) === year && daily[2] === date.replaceAll('-', '')) continue
      const match = target.pathname.match(/^\/bis\/(\d{4})\/games\/s(\d{8})\d+\.html$/u)
      const result = text(anchor[2]!).match(/^(\S+)\s+(\d+|\*)\s*-\s*(\d+|\*)\s+(\S+)$/u)
      if (target.origin !== url.origin || target.search || target.hash || !match || Number(match[1]) !== year ||
        match[2] !== date.replaceAll('-', '') || !result || !teams[result[1]!] || !teams[result[4]!] || result[1] === result[4]) throw new Error('Invalid official calendar game')
      const cancelled = result[2] === '*' && result[3] === '*'
      if (!cancelled && (result[2] === '*' || result[3] === '*')) throw new Error('Unconfirmed calendar score')
      games.push({ date, sourceUrl: target.href, homeTeam: teams[result[1]!]!, awayTeam: teams[result[4]!]!,
        status: cancelled ? 'cancelled' : 'completed', homeRuns: cancelled ? null : Number(result[2]), awayRuns: cancelled ? null : Number(result[3]) })
    }
  }
  if (dates.length !== lastDay(year, month) || new Set(dates).size !== dates.length || new Set(games.map((game) => game.sourceUrl)).size !== games.length) throw new Error('Incomplete or duplicate calendar days/games')
  return officialCalendarFactsSchema.parse({ version: 1, kind: 'month', year, month,
    calendarFrom: isoDate(year, month, 1), calendarTo: isoDate(year, month, lastDay(year, month)), dates, games })
}
