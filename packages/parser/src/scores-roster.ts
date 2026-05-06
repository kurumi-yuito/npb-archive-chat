import type { StructuredRosterEntry } from './scores-types'
import {
  capture,
  cleanText,
  extractTopLevelCells,
  extractTopLevelElements,
  normalizeNullableText,
  parseCell,
  stripTags,
} from './scores-utils'

export function parseScoresRosterHtml(html: string): StructuredRosterEntry[] {
  const sourceUrl =
    capture(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ?? null
  const sections = [...html.matchAll(/<div class="half_(left|right)">([\s\S]*?)<\/div>\s*<\/div>/gi)].map(
    (match) => match[2] ?? '',
  )
  const entries: StructuredRosterEntry[] = []

  for (const sectionHtml of sections) {
    const team = normalizeNullableText(capture(sectionHtml, /<h5>([\s\S]*?)<\/h5>/i))
    const tableHtml = capture(sectionHtml, /<table[^>]*>([\s\S]*?)<\/table>/i) ?? ''
    const rows = extractTopLevelElements(tableHtml, 'tr')
    let currentGroup: string | null = null

    for (const rowHtml of rows) {
      const cells = extractTopLevelCells(rowHtml).map((cell) => parseCell(cell))
      if (cells.length === 1) {
        currentGroup = normalizeNullableText(cells[0]?.text)
        continue
      }
      if (cells.length < 3) {
        continue
      }
      entries.push({
        game_id: null,
        team,
        player_name:
          cells[1]?.links[0]?.name ?? normalizeNullableText(cells[1]?.text) ?? null,
        uniform_number: normalizeNullableText(cells[0]?.text),
        position: currentGroup,
        starter: null,
        batting_order: null,
        raw_text: cleanText(stripTags(rowHtml)),
        source_url: sourceUrl,
      })
    }
  }

  return entries
}
