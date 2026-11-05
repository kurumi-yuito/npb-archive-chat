import type { SearchEventsFilters } from '@npb/schemas'
import type { ChatQueryService, EventRow } from '@npb/db'
import { matchesGameTeamFilter } from '@npb/db'

export class EventEvidenceError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Event evidence validation failed: ${issues.join(', ')}`)
    this.name = 'EventEvidenceError'
  }
}

export type EventCompletenessEvidence = {
  database_exhausted: true
  observed_count: number
  official_total: number | null
  official_total_status: 'verified' | 'unavailable' | 'not_applicable'
  source_urls: string[]
}

/** Compare a whole-season HR list with an independent BIS season row only. */
export async function verifyOfficialHomeRunTotal(
  service: Pick<ChatQueryService, 'searchBattingLines'>,
  filters: SearchEventsFilters,
  events: EventRow[],
): Promise<EventCompletenessEvidence> {
  const evidence: EventCompletenessEvidence = {
    database_exhausted: true, observed_count: events.length, official_total: null,
    official_total_status: 'not_applicable', source_urls: [],
  }
  const playerId = filters.batter_player_id
  const extraConstraints = filters.game_date || filters.date_from || filters.date_to || filters.game_id || filters.inning || filters.half ||
    filters.pitcher_name || filters.pitcher_player_id || filters.runner_name || filters.runner_player_id || filters.event_subtype
  if (!filters.year || !filters.team || !playerId || extraConstraints ||
    !['ホームラン', '本塁打'].includes(filters.result_text_contains ?? '')) return evidence
  evidence.official_total_status = 'unavailable'
  const rows = await service.searchBattingLines({ year: filters.year, player_id: playerId, team: filters.team, limit: 100 })
  const totals: number[] = []
  for (const row of rows) {
    if (row.sourceKind !== 'bis_batting' || row.playerId !== playerId ||
      Number(row.gameDate.slice(0, 4)) !== filters.year || !row.sourceUrl ||
      !row.sourceUrl.startsWith(`https://npb.jp/bis/${filters.year}/stats/idb1_`) ||
      (filters.team && !matchesGameTeamFilter(row.team, filters.team))) continue
    try {
      const stats: unknown = JSON.parse(row.statsJson ?? '{}')
      if (!stats || typeof stats !== 'object' || !('本塁打' in stats)) continue
      const raw = stats.本塁打
      if (typeof raw !== 'number' && (typeof raw !== 'string' || !/^\d+$/u.test(raw.trim()))) continue
      const total = Number(raw)
      if (!Number.isInteger(total) || total < 0) continue
      totals.push(total)
      evidence.source_urls.push(row.sourceUrl)
    } catch { /* Missing or malformed official row cannot certify completeness. */ }
  }
  if (totals.length === 0) return evidence
  const distinct = [...new Set(totals)]
  if (distinct.length !== 1) throw new EventEvidenceError(['official_totals_conflict'])
  if (distinct[0] !== events.length) throw new EventEvidenceError(['official_total_mismatch'])
  evidence.official_total = distinct[0]!
  evidence.official_total_status = 'verified'
  evidence.source_urls = [...new Set(evidence.source_urls)]
  return evidence
}

/** Fetch all database matches independently of UI page sizes, with a hard cost cap. */
export async function searchCompleteEventEvidence(
  service: Pick<ChatQueryService, 'searchEvents'>,
  filters: SearchEventsFilters,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<EventRow[]> {
  const pageSize = options.pageSize ?? 500
  const maxPages = options.maxPages ?? 20
  const events: EventRow[] = []
  const seen = new Set<string>()
  let after: SearchEventsFilters['after']
  for (let page = 0; page < maxPages; page++) {
    const rows = await service.searchEvents({ ...filters, limit: pageSize, after })
    for (const row of rows) {
      const key = `${row.gameId}:${row.sequence}`
      if (seen.has(key)) throw new EventEvidenceError(['duplicate_event'])
      if (after && compareCursor(row, after) <= 0) throw new EventEvidenceError(['cursor_not_advanced'])
      const issues = validateEventEvidence(row, filters)
      if (issues.length > 0) throw new EventEvidenceError(issues)
      seen.add(key)
      events.push(row)
      after = { game_date: row.gameDate, game_id: row.gameId, sequence: row.sequence }
    }
    if (rows.length < pageSize) return events
  }
  throw new EventEvidenceError(['completeness_budget_exhausted'])
}

export function validateEventEvidence(row: EventRow, filters: SearchEventsFilters): string[] {
  const issues: string[] = []
  const year = Number(row.gameDate.slice(0, 4))
  if (filters.year && year !== filters.year) issues.push('year_mismatch')
  if (filters.year_from && year < filters.year_from) issues.push('year_from_mismatch')
  if (filters.year_to && year > filters.year_to) issues.push('year_to_mismatch')
  if (filters.game_date && row.gameDate !== filters.game_date) issues.push('date_mismatch')
  if (filters.date_from && row.gameDate < filters.date_from) issues.push('date_from_mismatch')
  if (filters.date_to && row.gameDate > filters.date_to) issues.push('date_to_mismatch')
  if (filters.game_id && row.gameId !== filters.game_id) issues.push('game_mismatch')
  if (filters.team && !matchesGameTeamFilter(row.offenseTeam, filters.team)) issues.push('team_mismatch')
  if (row.gameId.startsWith('f')) issues.push('competition_level_mismatch')
  if (filters.event_type && row.eventType !== filters.event_type) issues.push('event_type_mismatch')
  if (filters.event_subtype && row.eventSubtype !== filters.event_subtype) issues.push('event_subtype_mismatch')
  if (filters.inning && row.inning !== filters.inning) issues.push('inning_mismatch')
  if (filters.half && row.half !== filters.half) issues.push('half_mismatch')
  if (filters.result_text_contains) {
    const accepted = ['本塁打', 'ホームラン'].includes(filters.result_text_contains)
      ? ['本塁打', 'ホームラン'] : [filters.result_text_contains]
    if (!accepted.some((text) => row.resultText.includes(text))) issues.push('result_mismatch')
  }
  // IDs are checked against official links, rather than guessing from display names.
  let attributes: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(row.eventAttributesJson ?? '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) attributes = parsed as Record<string, unknown>
    else issues.push('invalid_event_attributes')
  } catch { issues.push('invalid_event_attributes') }
  for (const role of ['batter', 'pitcher', 'runner'] as const) {
    const id = filters[`${role}_player_id`]
    if (!id) continue
    const direct = attributes[`${role}_url`]
    const links = attributes[`${role}_links`]
    const urls = [row[`${role}Url`], direct, ...(Array.isArray(links) ? links.map((link) => link?.url) : [])]
    if (!urls.some((url) => typeof url === 'string' && url === `https://npb.jp/bis/players/${id}.html`)) issues.push(`${role}_id_mismatch`)
  }
  if (filters.player_id) {
    const expected = `https://npb.jp/bis/players/${filters.player_id}.html`
    const matched = ['batter', 'pitcher', 'runner'].some((role) => {
      if (row[`${role}Url` as 'batterUrl' | 'pitcherUrl' | 'runnerUrl'] === expected) return true
      if (attributes[`${role}_url`] === expected) return true
      const links = attributes[`${role}_links`]
      return Array.isArray(links) && links.some((link) => link?.url === expected)
    })
    if (!matched) issues.push('player_id_mismatch')
  }
  if (!row.sourceUrl || !isOfficialSource(row.sourceUrl, row.gameDate)) issues.push('unsupported_source')
  return issues
}

function compareCursor(row: EventRow, after: NonNullable<SearchEventsFilters['after']>): number {
  return row.gameDate.localeCompare(after.game_date) || row.gameId.localeCompare(after.game_id) || row.sequence - after.sequence
}

function isOfficialSource(value: string, gameDate: string): boolean {
  try {
    const url = new URL(value)
    const [year, month, day] = gameDate.split('-')
    return url.protocol === 'https:' && url.hostname === 'npb.jp' && url.pathname.startsWith(`/scores/${year}/${month}${day}/`)
  } catch { return false }
}
