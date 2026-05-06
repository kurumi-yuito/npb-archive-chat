import type { StructuredGame, StructuredLineScore } from './scores-types'
import {
  capture,
  cleanText,
  extractTopLevelCells,
  extractTopLevelElements,
  normalizeNumber,
  normalizeNullableText,
  stripTags,
} from './scores-utils'

export type ParsedScoresIndex = {
  game: StructuredGame
  linescore: StructuredLineScore
}

export function parseScoresIndexHtml(html: string): ParsedScoresIndex {
  const canonicalUrl =
    capture(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ??
    'https://npb.jp/'
  const date = inferDateFromUrl(canonicalUrl)
  const dateLabel = cleanText(capture(html, /<time>([\s\S]*?)<\/time>/i))
  const venue = normalizeNullableText(capture(html, /<span class="place">([\s\S]*?)<\/span>/i))
  const title = cleanText(capture(html, /<h3>([\s\S]*?)<\/h3>/i))
  const gameInfoText = cleanText(capture(html, /<p class="game_info">([\s\S]*?)<\/p>/i))
  const titleParts = parseTitle(title)
  const startTime =
    capture(gameInfoText, /◇開始\s*([0-9:]+)/) ??
    capture(gameInfoText, /開始\s*([0-9:]+)/)

  const game: StructuredGame = {
    game_id: null,
    game_date: date,
    competition: titleParts.competition,
    venue,
    home_team: titleParts.homeTeamName,
    away_team: titleParts.awayTeamName,
    start_time: startTime ?? null,
    source_urls: [canonicalUrl],
  }

  return {
    game,
    linescore: parseLineScore(html, canonicalUrl, titleParts.awayTeamName, titleParts.homeTeamName, dateLabel),
  }
}

function parseLineScore(
  html: string,
  sourceUrl: string,
  awayTeamName: string | null,
  homeTeamName: string | null,
  dateLabel: string,
): StructuredLineScore {
  const tableHtml = capture(
    html,
    /<div id="table_linescore">([\s\S]*?)<\/table>[\s\S]*?<\/div>/i,
  )
  if (!tableHtml) {
    return emptyLineScore(sourceUrl, awayTeamName, homeTeamName, dateLabel)
  }

  const headerRow = capture(tableHtml, /<thead>[\s\S]*?<tr>([\s\S]*?)<\/tr>/i)
  const bodyHtml = capture(tableHtml, /<tbody>([\s\S]*?)<\/tbody>/i)
  if (!headerRow || !bodyHtml) {
    return emptyLineScore(sourceUrl, awayTeamName, homeTeamName, dateLabel)
  }

  const innings = extractTopLevelCells(headerRow)
    .slice(1)
    .map((cell) => cleanText(stripTags(cell)))
    .filter((text) => /^\d+$/.test(text))
  const rows = extractTopLevelElements(bodyHtml, 'tr')
  const away = parseLineScoreRow(rows[0] ?? '', innings.length)
  const home = parseLineScoreRow(rows[1] ?? '', innings.length)

  return {
    game_id: null,
    away_team: away.team ?? awayTeamName,
    home_team: home.team ?? homeTeamName,
    inning_scores: {
      innings,
      away: away.innings,
      home: home.innings,
    },
    runs: {
      away: away.runs,
      home: home.runs,
    },
    hits: {
      away: away.hits,
      home: home.hits,
    },
    errors: {
      away: away.errors,
      home: home.errors,
    },
    raw_text: cleanText(`${dateLabel} ${stripTags(tableHtml)}`),
    source_url: sourceUrl,
  }
}

function parseLineScoreRow(
  rowHtml: string,
  inningCount: number,
): {
  team: string | null
  innings: string[]
  runs: number | null
  hits: number | null
  errors: number | null
} {
  const cells = extractTopLevelCells(rowHtml).map((cell) => cleanText(stripTags(cell)))
  const team = normalizeNullableText(cells[0])
  const innings = cells.slice(1, 1 + inningCount).map((value) => value || '0')
  const totals = cells.slice(1 + inningCount)
  return {
    team,
    innings,
    runs: normalizeNumber(totals[0]),
    hits: normalizeNumber(totals[1]),
    errors: normalizeNumber(totals[2]),
  }
}

function parseTitle(rawTitle: string): {
  competition: string | null
  homeTeamName: string | null
  awayTeamName: string | null
} {
  const normalized = rawTitle
    .replace(/[Ｖｖ][Ｓｓ]/g, 'vs')
    .replace(/\s+/g, ' ')
    .trim()
  const match = normalized.match(/^【(.+?)】\s*(.+?)\s+vs\s+(.+?)\s+(?:第?\d+(?:戦|回戦))$/i)
  if (match) {
    return {
      competition: normalizeNullableText(match[1]),
      homeTeamName: normalizeNullableText(match[2]),
      awayTeamName: normalizeNullableText(match[3]),
    }
  }

  const fallback = normalized.match(/^【(.+?)】\s*(.+?)\s+vs\s+(.+)$/i)
  if (fallback) {
    return {
      competition: normalizeNullableText(fallback[1]),
      homeTeamName: normalizeNullableText(fallback[2]),
      awayTeamName: normalizeNullableText(fallback[3]),
    }
  }

  return {
    competition: null,
    homeTeamName: null,
    awayTeamName: null,
  }
}

function inferDateFromUrl(url: string): string {
  const match = url.match(/\/scores\/(\d{4})\/(\d{2})(\d{2})\//)
  if (!match) {
    return '1970-01-01'
  }
  return `${match[1]}-${match[2]}-${match[3]}`
}

function emptyLineScore(
  sourceUrl: string,
  awayTeamName: string | null,
  homeTeamName: string | null,
  rawText: string,
): StructuredLineScore {
  return {
    game_id: null,
    away_team: awayTeamName,
    home_team: homeTeamName,
    inning_scores: {
      innings: [],
      away: [],
      home: [],
    },
    runs: {
      away: null,
      home: null,
    },
    hits: {
      away: null,
      home: null,
    },
    errors: {
      away: null,
      home: null,
    },
    raw_text: rawText || null,
    source_url: sourceUrl,
  }
}
