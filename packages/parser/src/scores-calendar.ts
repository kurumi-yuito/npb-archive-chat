import type { ScoresCalendarGame } from './scores-types'
import { absoluteUrl, capture, cleanText, stripTags } from './scores-utils'

export function parseScoresCalendarHtml(
  html: string,
  year: number,
  mmdd: string,
): ScoresCalendarGame[] {
  const basePath = `/scores/${year}/${mmdd}/`
  const candidates = new Map<string, ScoresCalendarGame>()

  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    registerCandidate(candidates, match[1] ?? '', html, basePath)
  }

  for (const match of html.matchAll(/(?:https?:\/\/npb\.jp)?\/scores\/\d{4}\/\d{4}\/[^"'<> \t\r\n]+/gi)) {
    registerCandidate(candidates, match[0] ?? '', html, basePath)
  }

  return [...candidates.values()].filter((game) => game.scoresBaseUrl.includes(basePath))
}

function registerCandidate(
  candidates: Map<string, ScoresCalendarGame>,
  rawUrl: string,
  html: string,
  basePath: string,
) {
  const normalized = normalizeScoresBaseUrl(rawUrl)
  if (!normalized || !normalized.includes(basePath)) {
    return
  }

  const existing = candidates.get(normalized)
  if (existing) {
    return
  }

  const slug = normalized.replace(/\/+$/u, '').split('/').pop() ?? ''
  const metadata = extractMetadata(html, normalized)
  candidates.set(normalized, {
    scoresBaseUrl: normalized,
    slug,
    homeTeamName: metadata.homeTeamName,
    awayTeamName: metadata.awayTeamName,
    venue: metadata.venue,
    competition: metadata.competition,
    startTimeText: metadata.startTimeText,
  })
}

function normalizeScoresBaseUrl(candidate: string): string | null {
  const absolute = absoluteUrl(candidate.trim())
  const match = absolute
    .replace(/^http:\/\//i, 'https://')
    .match(/https:\/\/npb\.jp\/scores\/(\d{4})\/(\d{4})\/([^/?#]+)\/?/i)
  if (!match?.[3]) {
    return null
  }
  return `https://npb.jp/scores/${match[1]}/${match[2]}/${match[3]}/`
}

function extractMetadata(
  html: string,
  scoresBaseUrl: string,
): Pick<ScoresCalendarGame, 'homeTeamName' | 'awayTeamName' | 'venue' | 'competition' | 'startTimeText'> {
  const path = scoresBaseUrl.replace('https://npb.jp', '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const anchorHtml = capture(
    html,
    new RegExp(`<a[^>]+href=["'][^"']*${path}[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>`, 'i'),
  )
  const blockHtml = capture(
    html,
    new RegExp(`(<div[^>]+class=["'][^"']*score_box[^"']*["'][\\s\\S]*?<a[^>]+href=["'][^"']*${path}[^"']*["'][\\s\\S]*?<\\/div>\\s*<\\/div>)`, 'i'),
  )

  const anchorText = cleanText(stripTags(anchorHtml ?? ''))
  const blockText = cleanText(stripTags(blockHtml ?? ''))
  const teamMatch =
    blockHtml?.match(/alt="([^"]+)"[^>]+class="logo_left"[\s\S]*?alt="([^"]+)"[^>]+class="logo_right"/i) ??
    anchorText.match(/^(.+?)\s+vs\.?\s+(.+)$/i)
  const stateText = capture(blockHtml ?? '', /<div class="state">([\s\S]*?)<\/div>/i)
  const stateParts = cleanText(stripTags(stateText ?? ''))
    .split(' ')
    .map((value) => value.trim())
    .filter(Boolean)

  return {
    homeTeamName: teamMatch?.[1] ? cleanText(teamMatch[1]) : null,
    awayTeamName: teamMatch?.[2] ? cleanText(teamMatch[2]) : null,
    venue: stateParts[0]?.replace(/[()（）]/g, '') ?? null,
    competition: detectCompetition(blockText),
    startTimeText: detectStartTime(blockText),
  }
}

function detectCompetition(value: string): string | null {
  const normalized = cleanText(value)
  if (!normalized) {
    return null
  }
  if (normalized.includes('セ・リーグ')) {
    return 'セ・リーグ'
  }
  if (normalized.includes('パ・リーグ')) {
    return 'パ・リーグ'
  }
  if (normalized.includes('交流戦')) {
    return 'セ・パ交流戦'
  }
  return null
}

function detectStartTime(value: string): string | null {
  return capture(value, /([0-2]?\d:[0-5]\d)/) ?? null
}
