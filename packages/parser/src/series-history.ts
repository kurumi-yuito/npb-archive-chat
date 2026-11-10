import { decodeHtmlEntities, extractTopLevelElements } from './scores-utils'

export type OfficialSeriesSeason = {
  year: number; competition: '日本シリーズ'; level: 'first'; winnerName: string; loserName: string;
  winnerWins: number; loserWins: number; draws: number;
  games: Array<{ winnerSideRuns: number; loserSideRuns: number; literalScore: string }>
}

const literal = (html: string) => decodeHtmlEntities(html.replace(/<[^>]+>/gu, '')).trim()
const compact = (text: string) => text.normalize('NFKC').replace(/\s+/gu, '')

function classElements(html: string, tag: 'span' | 'td', name: string) {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'giu'))].flatMap((match) => {
    const classes = /\bclass=["']([^"']*)["']/iu.exec(match[0])?.[1]?.split(/\s+/u) ?? []
    if (!classes.includes(name)) return []
    const element = extractTopLevelElements(html.slice(match.index), tag)[0]
    if (!element) throw new Error('Incomplete official series element')
    return [{ index: match.index!, html: element, text: literal(element) }]
  })
}

/** Winner labels and score columns come from the official archive, not an
 * assumed best-of rule, player names or the result of a single game. */
export function parseOfficialSeriesHistory(html: string, sourceUrl: string): OfficialSeriesSeason[] {
  const source = new URL(sourceUrl)
  const period = /^\/bis\/scores\/nipponseries\/yearlyresults(\d{4})\.html$/u.exec(source.pathname)
  if (source.protocol !== 'https:' || source.hostname !== 'npb.jp' || source.username || source.password || source.port || source.search || source.hash || !period) throw new Error('Official series URL scope mismatch')
  const firstYear = Number(period[1]), title = compact(literal(/<title\b[^>]*>([\s\S]*?)<\/title>/iu.exec(html)?.[1] ?? ''))
  if (firstYear < 1950 || firstYear % 10 !== 0 || !title.includes('日本シリーズ') || !title.includes('各年度試合結果') || !title.includes(`${firstYear}-`) || !/<\/html\s*>/iu.test(html)) throw new Error('Official series title/period or document completeness mismatch')
  const headings = classElements(html, 'td', 'seriesYear')
  if (!headings.length) throw new Error('Official series history contains no seasons')
  const rows = headings.map((heading, index): OfficialSeriesSeason => {
    const yearMatch = /^【(\d{4})】$/u.exec(compact(heading.text))
    if (!yearMatch) throw new Error('Invalid official series year')
    const block = html.slice(heading.index, headings[index + 1]?.index)
    const winner = classElements(block, 'span', 'seriesWinner'), loser = classElements(block, 'span', 'seriesLoser')
    const counts = classElements(block, 'span', 'seriesWin').map(({ text }) => {
      const match = /^\((\d+)勝\)$/u.exec(compact(text))
      if (!match) throw new Error('Invalid published series decision count')
      const value = Number(match[1])
      if (!Number.isSafeInteger(value)) throw new Error('Unsafe official series count')
      return value
    })
    const games = classElements(block, 'td', 'seriesScore').map(({ text }) => {
      const score = /^(\d+)[xX]?-(\d+)[xX]?$/u.exec(compact(text))
      if (!score) throw new Error('Invalid official series score')
      const winnerSideRuns = Number(score[1]), loserSideRuns = Number(score[2])
      if (![winnerSideRuns, loserSideRuns].every(Number.isSafeInteger)) throw new Error('Unsafe official series score')
      return { winnerSideRuns, loserSideRuns, literalScore: text }
    })
    const wins = games.filter((game) => game.winnerSideRuns > game.loserSideRuns).length
    const losses = games.filter((game) => game.winnerSideRuns < game.loserSideRuns).length
    if (winner.length !== 1 || loser.length !== 1 || !winner[0]!.text || !loser[0]!.text || compact(winner[0]!.text) === compact(loser[0]!.text) ||
      counts.length !== 2 || counts[0] !== wins || counts[1] !== losses || wins <= losses) throw new Error('Official series header and played games do not reconcile')
    return { year: Number(yearMatch[1]), competition: '日本シリーズ', level: 'first', winnerName: winner[0]!.text, loserName: loser[0]!.text,
      winnerWins: wins, loserWins: losses, draws: games.length - wins - losses, games }
  })
  if (rows.some((row, index) => row.year !== firstYear + index || row.year >= firstYear + 10)) throw new Error('Official series season coverage mismatch')
  const closedPeriod = new RegExp(`\\(${firstYear}-(\\d{4})\\)`, 'u').exec(title)
  if (closedPeriod && rows.at(-1)!.year !== Number(closedPeriod[1])) throw new Error('Official series closed period is incomplete')
  return rows
}
