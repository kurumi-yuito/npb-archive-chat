import type {
  StructuredBattingLine,
  StructuredLineScore,
  StructuredPitchingLine,
} from './scores-types'
import { parseScoresIndexHtml } from './scores-index'
import {
  capture,
  cleanText,
  extractTopLevelCells,
  extractTopLevelElements,
  normalizeNumber,
  normalizeNullableText,
  parseCell,
  stripTags,
} from './scores-utils'

export type ParsedScoresBox = {
  battingLines: StructuredBattingLine[]
  pitchingLines: StructuredPitchingLine[]
  linescore: StructuredLineScore
}

export function parseScoresBoxHtml(html: string): ParsedScoresBox {
  const sections = extractTopLevelElements(html, 'section')
  const sourceUrl =
    capture(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ?? null

  const battingLines = parseBattingTables(sections.slice(0, 2), sourceUrl)
  const pitchingLines = parsePitchingTables(sections.slice(0, 2), sourceUrl)

  return {
    battingLines,
    pitchingLines,
    linescore: parseScoresIndexHtml(html).linescore,
  }
}

function parseBattingTables(
  sections: string[],
  sourceUrl: string | null,
): StructuredBattingLine[] {
  const tables = [
    { sectionHtml: sections[0] ?? '', tableId: 'table_top_b', tableClass: 'table_batter' },
    { sectionHtml: sections[1] ?? '', tableId: 'table_bottom_b', tableClass: 'table_batter' },
  ]
  const lines: StructuredBattingLine[] = []

  for (const table of tables) {
    const team = normalizeNullableText(capture(table.sectionHtml, /<h4>([\s\S]*?)<\/h4>/i))
    const tableHtml = extractTableByIdOrClass(table.sectionHtml, table.tableId, table.tableClass)
    if (!tableHtml) {
      continue
    }
    const bodyHtml = extractTopLevelElements(tableHtml, 'tbody')[0] ?? ''
    const rows = extractTopLevelElements(bodyHtml, 'tr')
    for (const rowHtml of rows) {
      const cells = extractTopLevelCells(rowHtml).map((cell) => parseCell(cell))
      if (cells.length < 8) {
        continue
      }
      const playerName = cells[2]?.links[0]?.name ?? normalizeNullableText(cells[2]?.text) ?? null
      const inningResults = cells.slice(8).map((cell) => cell.text)
      lines.push({
        game_id: null,
        team,
        player_name: playerName,
        batting_order: normalizeNumber(cells[0]?.text),
        position: normalizeNullableText(cells[1]?.text),
        at_bats: normalizeNumber(cells[3]?.text),
        runs: normalizeNumber(cells[4]?.text),
        hits: normalizeNumber(cells[5]?.text),
        rbis: normalizeNumber(cells[6]?.text),
        strikeouts: countInningResults(inningResults, /(三\s*振|空振り三振|見逃し三振)/),
        walks: countInningResults(inningResults, /(四\s*球|敬遠)/),
        hit_by_pitch: countInningResults(inningResults, /死\s*球/),
        sacrifice_hits: countInningResults(inningResults, /(犠\s*打|投犠打|一犠打|二犠打|三犠打)/),
        sacrifice_flies: countInningResults(inningResults, /犠\s*飛/),
        stolen_bases: normalizeNumber(cells[7]?.text),
        errors: countInningResults(inningResults, /失策/),
        raw_text: cleanText(stripTags(rowHtml)),
        source_url: sourceUrl,
      })
    }
  }

  return lines
}

function parsePitchingTables(
  sections: string[],
  sourceUrl: string | null,
): StructuredPitchingLine[] {
  const tables = [
    { sectionHtml: sections[0] ?? '', tableId: 'table_top_p', tableClass: 'table_pitcher' },
    { sectionHtml: sections[1] ?? '', tableId: 'table_bottom_p', tableClass: 'table_pitcher' },
  ]
  const lines: StructuredPitchingLine[] = []

  for (const table of tables) {
    const team = normalizeNullableText(capture(table.sectionHtml, /<h4>([\s\S]*?)<\/h4>/i))
    const tableHtml = extractTableByIdOrClass(table.sectionHtml, table.tableId, table.tableClass)
    if (!tableHtml) {
      continue
    }
    const bodyHtml = extractTopLevelElements(tableHtml, 'tbody')[0] ?? ''
    const rows = extractTopLevelElements(bodyHtml, 'tr')
    rows.forEach((rowHtml, index) => {
      const cells = extractTopLevelCells(rowHtml).map((cell) => parseCell(cell))
      if (cells.length < 14) {
        return
      }
      lines.push({
        game_id: null,
        team,
        pitcher_name:
          cells[1]?.links[0]?.name ?? normalizeNullableText(cells[1]?.text) ?? null,
        sequence: index,
        innings_pitched: parsePitchingInnings(cells[4]?.rawHtml ?? ''),
        batters_faced: normalizeNumber(cells[3]?.text),
        pitches: normalizeNumber(cells[2]?.text),
        hits_allowed: normalizeNumber(cells[5]?.text),
        home_runs_allowed: normalizeNumber(cells[6]?.text),
        strikeouts: normalizeNumber(cells[9]?.text),
        walks: normalizeNumber(cells[7]?.text),
        hit_by_pitch: normalizeNumber(cells[8]?.text),
        runs_allowed: normalizeNumber(cells[12]?.text),
        earned_runs: normalizeNumber(cells[13]?.text),
        win_loss_save_hold: normalizeNullableText(cells[0]?.text),
        raw_text: cleanText(stripTags(rowHtml)),
        source_url: sourceUrl,
      })
    })
  }

  return lines
}

function extractTableByIdOrClass(html: string, id: string, className: string): string {
  const divHtml = extractElementById(html, 'div', id)
  if (divHtml) {
    return extractTopLevelElements(divHtml, 'table')[0] ?? ''
  }
  const classDivHtml = extractElementByClass(html, 'div', className)
  return classDivHtml ? extractTopLevelElements(classDivHtml, 'table')[0] ?? '' : ''
}

function parsePitchingInnings(html: string): string | null {
  const full = cleanText(capture(html, /<th>([\s\S]*?)<\/th>/i))
  const partial = cleanText(capture(html, /<td>([\s\S]*?)<\/td>/i))
  const value = `${full}${partial}`.trim()
  return value || normalizeNullableText(stripTags(html))
}

function extractElementById(html: string, tagName: string, id: string): string | null {
  const matcher = new RegExp(`<(/?)${tagName}\\b([^>]*)>`, 'gi')
  let start = -1
  let depth = 0
  let found = false
  let match: RegExpExecArray | null

  while ((match = matcher.exec(html)) !== null) {
    const isClosing = match[1] === '/'
    if (!isClosing) {
      const attributes = match[2] ?? ''
      if (depth === 0 && new RegExp(`\\bid=["']${id}["']`, 'i').test(attributes)) {
        start = match.index
        found = true
      }
      if (found) {
        depth += 1
      }
      continue
    }

    if (found) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        return html.slice(start, matcher.lastIndex)
      }
    }
  }

  return null
}

function extractElementByClass(html: string, tagName: string, className: string): string | null {
  const matcher = new RegExp(`<(/?)${tagName}\\b([^>]*)>`, 'gi')
  let start = -1
  let depth = 0
  let found = false
  let match: RegExpExecArray | null

  while ((match = matcher.exec(html)) !== null) {
    const isClosing = match[1] === '/'
    if (!isClosing) {
      const attributes = match[2] ?? ''
      if (depth === 0 && hasClass(attributes, className)) {
        start = match.index
        found = true
      }
      if (found) {
        depth += 1
      }
      continue
    }

    if (found) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        return html.slice(start, matcher.lastIndex)
      }
    }
  }

  return null
}

function hasClass(attributes: string, className: string): boolean {
  const classAttr = attributes.match(/\bclass=["']([^"']+)["']/i)?.[1] ?? ''
  return classAttr.split(/\s+/).includes(className)
}

function countInningResults(values: string[], pattern: RegExp): number | null {
  const count = values.reduce((total, value) => (pattern.test(value) ? total + 1 : total), 0)
  return count > 0 ? count : 0
}
