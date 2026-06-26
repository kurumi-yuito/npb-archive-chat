import type { StructuredEvent } from './scores-types'
import {
  capture,
  cleanText,
  countRunsScored,
  extractTopLevelCells,
  extractTopLevelElements,
  normalizeNullableText,
  parseCell,
} from './scores-utils'

type PlayerRef = { name: string; url: string | null }

export class NoPlayByPlayAvailableError extends Error {
  readonly reasonCode: string

  constructor(reasonCode: string, message: string) {
    super(message)
    this.name = 'NoPlayByPlayAvailableError'
    this.reasonCode = reasonCode
  }
}

export function parseScoresPlayByPlayHtml(html: string): StructuredEvent[] {
  const progressSection = capture(
    html,
    /<div id="progress">([\s\S]*?)<\/div>\s*<\/div>/i,
  )
  if (!progressSection) {
    const unavailableReason = detectNoPlayByPlayReason(html)
    if (unavailableReason) {
      throw new NoPlayByPlayAvailableError(unavailableReason, `Play by play is not available: ${unavailableReason}`)
    }
    throw new Error('Could not find play by play section')
  }

  const sourceUrl =
    capture(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ?? null
  const halfBlocks = splitHalfInnings(progressSection)
  const currentPitchers: Record<'top' | 'bottom', PlayerRef | null> = {
    top: null,
    bottom: null,
  }
  const score = { away: 0, home: 0 }
  const events: StructuredEvent[] = []

  for (const halfBlock of halfBlocks) {
    const defendingHalf = halfBlock.half === 'top' ? 'top' : 'bottom'
    const tables = extractTopLevelElements(halfBlock.html, 'table')

    for (const tableHtml of tables) {
      const rows = extractTopLevelElements(tableHtml, 'tr')
      for (const rowHtml of rows) {
        const cells = extractTopLevelCells(rowHtml).map((cell) => parseCell(cell))
        const sourceText = normalizeNullableText(cleanText(cells.map((cell) => cell.text).join(' ')))

        if (cells.length === 1) {
          const note = buildSingleCellEvent(
            cells[0]?.text ?? '',
            cells[0]?.links ?? [],
            currentPitchers,
            defendingHalf,
            halfBlock,
            events.length,
            sourceUrl,
            sourceText,
          )
          events.push(note)
          continue
        }

        const batterCell = cells[2]
        const rawBatterText = normalizeNullableText(batterCell?.text)
        const batterRef = batterCell?.links[0] ?? null
        const resultText = normalizeNullableText(cells[4]?.text)
        const runner = !rawBatterText ? extractRunnerRef(resultText ?? '', cells[4]?.links ?? []) : null
        const impliedPinchRunner = inferImpliedPinchRunner(events.at(-1) ?? null, runner, resultText)
        const runsScored = countRunsScored(resultText ?? '')
        if (runsScored) {
          if (halfBlock.half === 'top') {
            score.away += runsScored
          } else {
            score.home += runsScored
          }
        }

        events.push({
          game_id: null,
          sequence: events.length,
          inning: halfBlock.inning,
          half: halfBlock.half,
          batter_name: rawBatterText ? extractBatterName(rawBatterText) : null,
          batter_url: batterRef?.url ?? null,
          pitcher_name: currentPitchers[defendingHalf]?.name ?? null,
          pitcher_url: currentPitchers[defendingHalf]?.url ?? null,
          event_type: classifyEventType(rawBatterText, resultText, impliedPinchRunner),
          event_subtype: classifyEventSubtype(rawBatterText, resultText, impliedPinchRunner),
          result_text: resultText,
          runner_name: runner?.name ?? null,
          runner_url: runner?.url ?? null,
          outs: normalizeNullableText(cells[0]?.text),
          bases: normalizeNullableText(cells[1]?.text),
          runs_scored: runsScored,
          score_change: runsScored ? `${score.away}-${score.home}` : null,
          substitution:
            rawBatterText?.startsWith('代打・') || impliedPinchRunner
              ? resultText ?? rawBatterText
              : null,
          pitching_change: null,
          event_attributes_json: JSON.stringify({
            offense_team: halfBlock.offenseTeam,
            count: normalizeNullableText(cells[3]?.text),
            batter_links: batterCell?.links ?? [],
            result_links: cells[4]?.links ?? [],
          }),
          source_url: sourceUrl,
          source_text: sourceText,
        })
      }
    }
  }

  return events
}

function detectNoPlayByPlayReason(html: string): string | null {
  const gameInfo = cleanText(capture(html, /<p class="game_info">([\s\S]*?)<\/p>/i))
  if (/雨天.*中止|中止/.test(gameInfo)) {
    return 'no_pbp_available:rain_cancelled'
  }
  if (/ノーゲーム/.test(gameInfo)) {
    return 'no_pbp_available:no_game'
  }
  if (/没収/.test(gameInfo)) {
    return 'no_pbp_available:forfeit'
  }
  return null
}

function buildSingleCellEvent(
  text: string,
  links: Array<{ name: string; url: string | null }>,
  currentPitchers: Record<'top' | 'bottom', PlayerRef | null>,
  defendingHalf: 'top' | 'bottom',
  halfBlock: { inning: number; half: 'top' | 'bottom' },
  sequence: number,
  sourceUrl: string | null,
  sourceText: string | null,
): StructuredEvent {
  const normalized = cleanText(text)
  let eventType = 'game_note'
  let eventSubtype: string | null = 'note'
  let substitution: string | null = null
  let pitchingChange: string | null = null

  if (normalized.startsWith('（先発投手）')) {
    eventSubtype = 'starting_pitcher'
    currentPitchers[defendingHalf] = links[0] ?? null
  } else if (normalized.startsWith('（投手交代）')) {
    eventType = 'pitching_change'
    eventSubtype = 'pitching_change'
    currentPitchers[defendingHalf] = links[1] ?? currentPitchers[defendingHalf]
    pitchingChange = normalized
  } else if (normalized.startsWith('（守備変更）')) {
    eventType = 'defensive_change'
    eventSubtype = 'defensive_change'
    substitution = normalized
  } else if (normalized.startsWith('（代走）') || normalized.startsWith('（臨時代走）')) {
    eventType = 'pinch_runner'
    eventSubtype = 'pinch_runner'
    substitution = normalized
  } else if (normalized.startsWith('（代打）')) {
    eventType = 'pinch_hitter'
    eventSubtype = 'pinch_hitter'
    substitution = normalized
  }

  return {
    game_id: null,
    sequence,
    inning: halfBlock.inning,
    half: halfBlock.half,
    batter_name: null,
    batter_url: null,
    pitcher_name: currentPitchers[defendingHalf]?.name ?? null,
    pitcher_url: currentPitchers[defendingHalf]?.url ?? null,
    event_type: eventType,
    event_subtype: eventSubtype,
    result_text: normalized || null,
    runner_name: null,
    runner_url: null,
    outs: null,
    bases: null,
    runs_scored: countRunsScored(normalized),
    score_change: null,
    substitution,
    pitching_change: pitchingChange,
    event_attributes_json: JSON.stringify({ links }),
    source_url: sourceUrl,
    source_text: sourceText,
  }
}

function splitHalfInnings(progressHtml: string) {
  const marker = /<h5[^>]*>([\s\S]*?)<\/h5>/g
  const matches = [...progressHtml.matchAll(marker)]
  return matches.map((match, index) => {
    const start = match.index ?? 0
    const contentStart = start + match[0].length
    const contentEnd =
      index + 1 < matches.length ? (matches[index + 1].index ?? progressHtml.length) : progressHtml.length
    const label = cleanText(match[1])
    const headerMatch = label.match(/^(\d+)回([表裏])（(.+?)の攻撃）$/)
    if (!headerMatch) {
      throw new Error(`Unexpected inning label: ${label}`)
    }

    return {
      inning: Number(headerMatch[1]),
      half: (headerMatch[2] === '表' ? 'top' : 'bottom') as 'top' | 'bottom',
      offenseTeam: headerMatch[3] ?? '',
      html: progressHtml.slice(contentStart, contentEnd),
    }
  })
}

function classifyEventType(
  batterText: string | null,
  resultText: string | null,
  impliedPinchRunner: boolean,
): string {
  const normalized = resultText ?? ''
  if (batterText?.startsWith('代打・')) {
    return 'pinch_hitter'
  }
  if (impliedPinchRunner) {
    return 'pinch_runner'
  }
  if (normalized.includes('盗塁成功')) {
    return 'steal'
  }
  if (normalized.includes('盗塁失敗') || normalized.includes('けん制') || normalized.includes('牽制')) {
    return 'caught_stealing'
  }
  if (normalized.includes('本塁打')) {
    return 'homerun'
  }
  if (/四球|敬遠|死球/.test(normalized)) {
    return 'walk'
  }
  if (/三振/.test(normalized)) {
    return 'strikeout'
  }
  if (/安|二塁打|三塁打|本塁打/.test(normalized)) {
    return 'hit'
  }
  if (/生還|得点|ホームイン/.test(normalized)) {
    return 'scoring'
  }
  return batterText ? 'plate_appearance' : 'unknown'
}

function classifyEventSubtype(
  batterText: string | null,
  resultText: string | null,
  impliedPinchRunner: boolean,
): string | null {
  const normalized = resultText ?? ''
  if (batterText?.startsWith('代打・')) {
    return 'pinch_hitter'
  }
  if (impliedPinchRunner) {
    return 'pinch_runner'
  }
  if (/空振り三振/.test(normalized)) {
    return 'swinging_strikeout'
  }
  if (/見逃し三振/.test(normalized)) {
    return 'looking_strikeout'
  }
  if (/四球/.test(normalized)) {
    return 'walk'
  }
  if (/死球/.test(normalized)) {
    return 'hit_by_pitch'
  }
  if (/本塁打/.test(normalized)) {
    return 'homerun'
  }
  if (/盗塁成功/.test(normalized)) {
    return 'stolen_base'
  }
  if (/盗塁失敗|けん制|牽制/.test(normalized)) {
    return 'caught_stealing'
  }
  return batterText ? 'standard' : 'other'
}

function extractRunnerRef(
  value: string,
  links: Array<{ name: string; url: string | null }>,
): PlayerRef | null {
  if (!value.startsWith('（走者・')) {
    return null
  }
  return (links[0] as PlayerRef | undefined) ?? null
}

function extractBatterName(value: string): string {
  const stripped = value.replace(/^代打・/, '')
  const parts = stripped.split('・')
  return parts.at(-1)?.trim() ?? stripped.trim()
}

function inferImpliedPinchRunner(
  previousEvent: StructuredEvent | null,
  runner: PlayerRef | null,
  resultText: string | null,
): boolean {
  if (!previousEvent || !runner || !resultText?.startsWith('（走者・')) {
    return false
  }
  if (!previousEvent.batter_name || !didReachBase(previousEvent.result_text ?? '')) {
    return false
  }
  return previousEvent.batter_name !== runner.name
}

function didReachBase(value: string): boolean {
  return /(安|四球|死球|出塁|失策)/.test(value)
}
