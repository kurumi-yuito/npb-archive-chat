import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { richGameSchema, type RichGame } from '@npb/schemas'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const defaultWorkspaceRoot = path.resolve(moduleDir, '../../..')

type ParseContext = {
  year: number
  mmdd: string
  gameId: string
}

export type LoadedBisRawGame = {
  indexPath: string
  indexHtml: string
}

function toProjectRelative(absolutePath: string): string {
  const root = (process.env.INIT_CWD ?? defaultWorkspaceRoot).replace(/\\/g, '/').replace(/\/$/u, '')
  const normalizedPath = path.resolve(absolutePath).replace(/\\/g, '/')
  if (normalizedPath.startsWith(`${root}/`)) {
    return normalizedPath.slice(root.length + 1)
  }

  return normalizedPath
}

function normalizeHttpsUrl(url: string): string {
  const trimmed = url.trim()
  if (trimmed.startsWith('http://')) {
    return `https://${trimmed.slice('http://'.length)}`
  }

  return trimmed
}

function extractBisCanonicalUrl(html: string): string | null {
  const og = html.match(/property=["']og:url["']\s+content=["']([^"']+)["']/i)
  if (og?.[1]) {
    return normalizeHttpsUrl(og[1])
  }

  const link = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i)
  if (link?.[1]) {
    return normalizeHttpsUrl(link[1])
  }

  return null
}

function stripTags(html: string) {
  return decodeHtmlEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function cleanText(value: string) {
  return value.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

/** BIS 表では未打席イニングが空や `-` になる。`richGameSchema` の `z.string().min(1)` に合わせて正規化する。 */
function normalizeLinescoreInningCell(value: string): string {
  const t = cleanText(value)
  if (t === '' || t === '-') {
    return '0'
  }

  return t
}

function extractDateLabel(html: string): string {
  const titleMatch = html.match(/<title>([^<|]+)/i)
  if (titleMatch?.[1]) {
    return cleanText(titleMatch[1].replace(/\s*\|\s*NPB\.jp.*$/iu, ''))
  }

  const h1 = html.match(/<div[^>]*id="gmdivtitle"[^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1?.[1]) {
    return cleanText(stripTags(h1[1]))
  }

  return 'BIS game page'
}

function extractGmdivInfoRow(html: string): string | null {
  const block = html.match(/<div[^>]*id="gmdivinfo"[^>]*>([\s\S]*?)<\/div>/i)
  return block?.[1] ?? null
}

function parseVenueAndMeta(html: string): {
  venue: string
  attendance: number | null
  startTime: string | null
  endTime: string | null
  durationText: string | null
} {
  const row = extractGmdivInfoRow(html)
  if (!row) {
    return {
      venue: '—',
      attendance: null,
      startTime: null,
      endTime: null,
      durationText: null,
    }
  }

  const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cleanText(stripTags(m[1] ?? '')))
  const venue = cells[0] && cells[0].length > 0 ? cells[0] : '—'

  const tail = cells[1] ?? ''
  const attMatch = tail.match(/Att\.\s*-\s*([\d,]+)/i)
  const attendance = attMatch?.[1]
    ? Number.parseInt(attMatch[1].replaceAll(',', ''), 10)
    : null

  const timeMatch = tail.match(/\(\s*([0-9:]+)\s*-\s*([0-9:]+)\s*\)/)
  const durationMatch = tail.match(/T\s*-\s*([0-9:]+)/i)

  return {
    venue,
    attendance: Number.isFinite(attendance) ? attendance : null,
    startTime: timeMatch?.[1] ?? null,
    endTime: timeMatch?.[2] ?? null,
    durationText: durationMatch?.[1] ?? null,
  }
}

function extractGameNumber(html: string): number | null {
  const m = html.match(/<div[^>]*class="gmdivnumber"[^>]*>([\s\S]*?)<\/div>/i)
  const text = m?.[1] ? cleanText(stripTags(m[1])) : ''
  const gameMatch = text.match(/\bGame\s+(\d+)\b/i)
  if (!gameMatch?.[1]) {
    return null
  }

  const n = Number.parseInt(gameMatch[1], 10)
  return n > 0 ? n : null
}

function extractTopTeamNames(html: string): { away: string; home: string } | null {
  const scoreBlock = html.match(/<div[^>]*id="gmdivscore"[^>]*>([\s\S]*?)<\/div>/i)
  if (!scoreBlock?.[1]) {
    return null
  }

  const names = [...scoreBlock[1].matchAll(/class="contentshdname"[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
    cleanText(stripTags(m[1] ?? '')),
  )
  if (names.length < 2) {
    return null
  }

  return { away: names[0], home: names[1] }
}

function parseGmdivResultLinescore(html: string): {
  innings: string[]
  away: { team: string; innings: string[]; totals: { runs: number; hits: number; errors: number } }
  home: { team: string; innings: string[]; totals: { runs: number; hits: number; errors: number } }
} | null {
  const table = html.match(/<div[^>]*id="gmdivresult"[^>]*>[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i)
  if (!table?.[1]) {
    return null
  }

  const rows = [...table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1] ?? '')
  if (rows.length < 3) {
    return null
  }

  const headerCells = [...rows[0].matchAll(/<td[^>]*class="gmscorettl"[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
    cleanText(stripTags(m[1] ?? '')),
  )
  const innings = headerCells.filter((c) => /^\d+$/.test(c))

  const parseTeamRow = (rowHtml: string) => {
    const teamMatch = rowHtml.match(/<td[^>]*class="gmscoreteam"[^>]*>([\s\S]*?)<\/td>/i)
    const team = teamMatch?.[1] ? cleanText(stripTags(teamMatch[1])) : '—'
    const scores = [...rowHtml.matchAll(/<td[^>]*class="gmscore"[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      cleanText(stripTags(m[1] ?? '')),
    )
    const tail = scores.slice(-3)
    const inningValues = scores
      .slice(0, Math.max(0, scores.length - 3))
      .map((cell) => normalizeLinescoreInningCell(cell))
    return {
      team,
      innings: inningValues,
      totals: {
        runs: Number.parseInt(tail[0] ?? '0', 10) || 0,
        hits: Number.parseInt(tail[1] ?? '0', 10) || 0,
        errors: Number.parseInt(tail[2] ?? '0', 10) || 0,
      },
    }
  }

  const away = parseTeamRow(rows[1])
  const home = parseTeamRow(rows[2])
  return { innings, away, home }
}

function parseWinPitcherBlock(html: string): {
  winner: { label: string; player: { name: string; url: null }; record_text: string | null } | null
  loser: { label: string; player: { name: string; url: null }; record_text: string | null } | null
  save: { label: string; player: { name: string; url: null }; record_text: string | null } | null
} {
  const pit = html.match(/<div[^>]*id="gmdivpit"[^>]*>([\s\S]*?)<\/div>/i)
  const empty = {
    winner: null as {
      label: string
      player: { name: string; url: null }
      record_text: string | null
    } | null,
    loser: null as {
      label: string
      player: { name: string; url: null }
      record_text: string | null
    } | null,
    save: null as {
      label: string
      player: { name: string; url: null }
      record_text: string | null
    } | null,
  }
  if (!pit?.[1]) {
    return empty
  }

  const rows = [...pit[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
  const result = { ...empty }

  for (const row of rows) {
    const labelCell = row[1]?.match(/<td[^>]*class="gmresunm"[^>]*>([\s\S]*?)<\/td>/i)
    const valueCell = row[1]?.match(/<td[^>]*class="gmresults"[^>]*>([\s\S]*?)<\/td>/i)
    const label = labelCell?.[1] ? cleanText(stripTags(labelCell[1])) : ''
    const rawValue = valueCell?.[1] ? cleanText(stripTags(valueCell[1])) : ''
    const recordMatch = rawValue.match(/^(.+?)\s*\(\s*([^)]+)\s*\)\s*$/u)
    const name = recordMatch ? cleanText(recordMatch[1]) : rawValue
    const recordText = recordMatch ? cleanText(recordMatch[2]) : null
    const player = { name, url: null as null }

    if (/^WP\b/i.test(label)) {
      result.winner = { label: '勝投手', player, record_text: recordText }
    } else if (/^LP\b/i.test(label)) {
      result.loser = { label: '敗投手', player, record_text: recordText }
    } else if (/^SV\b/i.test(label)) {
      result.save = { label: 'セーブ', player, record_text: recordText }
    }
  }

  return result
}

function parseHomeRunsBlock(html: string): Array<{
  team: string
  raw_text: string
  items: Array<{ batter: null; pitcher: null; raw_text: string }>
}> {
  const hr = html.match(/<div[^>]*id="gmdivhr"[^>]*>([\s\S]*?)<\/div>/i)
  if (!hr?.[1]) {
    return []
  }

  const items: Array<{ batter: null; pitcher: null; raw_text: string }> = []
  for (const cell of hr[1].matchAll(/<td[^>]*class="gmresults"[^>]*>([\s\S]*?)<\/td>/gi)) {
    const raw = cleanText(stripTags(cell[1] ?? ''))
    if (!raw) {
      continue
    }

    items.push({
      batter: null,
      pitcher: null,
      raw_text: raw,
    })
  }

  if (items.length === 0) {
    return []
  }

  return [
    {
      team: '—',
      raw_text: items.map((i) => i.raw_text).join(' / '),
      items,
    },
  ]
}

/**
 * BIS index のみでは逐球 HTML が無い。DB の `events` に最低 1 行入るよう、説明用の `game_note` を 1 件だけ入れる。
 * （実際のプレー内容ではないことに注意）
 */
function buildBisOnlyPlaceholderPlayByPlay(awayTeam: string): RichGame['play_by_play'] {
  const note =
    'Play-by-play was not ingested from this source (BIS English index only; scores playbyplay.html not used).'
  return [
    {
      event_index: 0,
      inning: 1,
      half: 'top',
      inning_label: '1',
      offense_team: awayTeam,
      pitcher: null,
      event_type: 'game_note',
      event_subtype: 'other',
      outs: null,
      bases: null,
      batter: null,
      count: null,
      result: {
        text: note,
        runs_batted_in: null,
        links: [],
      },
      event_attributes: null,
      raw_row_html: '<!-- bis-only index: no play-by-play HTML -->',
    },
  ]
}

export function isBisEnglishGameHtml(html: string): boolean {
  if (html.includes('page_bis') && html.includes('id="gmdivmain"')) {
    return true
  }

  if (/\/bis\/eng\/\d{4}\/games\/(?:s|fs)\d+\.html/i.test(html) && html.includes('id="gmdivmain"')) {
    return true
  }

  return false
}

export function buildRichGameFromBisEngIndex(
  context: ParseContext,
  raw: LoadedBisRawGame,
  fetchedAtIso: string,
): RichGame {
  const html = raw.indexHtml
  const bisUrl =
    extractBisCanonicalUrl(html) ??
    `https://npb.jp/bis/eng/${context.year}/games/index-${context.gameId}.html`

  const dateIso = `${context.year}-${context.mmdd.slice(0, 2)}-${context.mmdd.slice(2, 4)}`
  const dateLabel = extractDateLabel(html)
  const venueMeta = parseVenueAndMeta(html)
  const topNames = extractTopTeamNames(html)
  const linescore = parseGmdivResultLinescore(html)
  const winPitch = parseWinPitcherBlock(html)
  const homeRuns = parseHomeRunsBlock(html)
  const gameNumber = extractGameNumber(html)

  const awayName = linescore?.away.team ?? topNames?.away ?? 'Away'
  const homeName = linescore?.home.team ?? topNames?.home ?? 'Home'

  const linescorePayload = linescore ?? {
    innings: [] as string[],
    away: {
      team: awayName,
      innings: [],
      totals: { runs: 0, hits: 0, errors: 0 },
    },
    home: {
      team: homeName,
      innings: [],
      totals: { runs: 0, hits: 0, errors: 0 },
    },
  }

  const relIndex = toProjectRelative(raw.indexPath)
  const sourceUrlWith = (hash: string) => `${bisUrl}#${hash}`

  const payload = {
    schemaVersion: 1 as const,
    game_meta: {
      year: context.year,
      mmdd: context.mmdd,
      game_id: context.gameId,
      canonical_url: bisUrl,
      date: dateIso,
      date_label: dateLabel,
      venue: venueMeta.venue,
      competition: null,
      matchup_text: `${awayName} vs ${homeName}`,
      game_number: gameNumber,
      status: null,
      start_time: venueMeta.startTime,
      end_time: venueMeta.endTime,
      duration_text: venueMeta.durationText,
      attendance: venueMeta.attendance,
      umpires: [] as Array<{ role: string; name: string }>,
      away_team: {
        name: awayName,
        short_name: null as string | null,
      },
      home_team: {
        name: homeName,
        short_name: null as string | null,
      },
    },
    top_summary: {
      linescore: linescorePayload,
      result_pitchers: {
        winner: winPitch.winner,
        loser: winPitch.loser,
        save: winPitch.save,
      },
      batteries: [] as Array<{
        team: string
        pitchers: Array<{ name: string; url: string | null }>
        catcher: { name: string; url: string | null } | null
        raw_text: string
      }>,
      home_runs: homeRuns,
      latest_order: [] as Array<{
        team: string
        entries: Array<{
          batting_order: number | null
          position: string
          player: { name: string; url: string | null }
          note: string | null
        }>
      }>,
    },
    play_by_play: buildBisOnlyPlaceholderPlayByPlay(awayName),
    batting_box: [] as RichGame['batting_box'],
    pitching_box: [] as RichGame['pitching_box'],
    roster: [] as RichGame['roster'],
    sources: {
      index: { url: bisUrl, path: relIndex },
      playbyplay: { url: sourceUrlWith('playbyplay-not-downloaded'), path: relIndex },
      box: { url: sourceUrlWith('box-not-downloaded'), path: relIndex },
      roster: { url: sourceUrlWith('roster-not-downloaded'), path: relIndex },
    },
    fetched_at: fetchedAtIso,
  }

  return richGameSchema.parse(payload)
}
