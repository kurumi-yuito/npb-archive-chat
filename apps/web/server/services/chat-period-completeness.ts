import type { SearchEventsFilters } from '@npb/schemas'
import { matchesGameTeamFilter, type ChatQueryService, type EventRow } from '@npb/db'
import type { EventCompletenessEvidence } from './chat-event-evidence'

/** Reconcile regular-season events per year without removing other competition records. */
export async function verifyProfileHomeRunPeriod(service: Pick<ChatQueryService, 'searchPlayerInformation'>,
  filters: SearchEventsFilters, events: EventRow[]): Promise<EventCompletenessEvidence> {
  const evidence: EventCompletenessEvidence = { database_exhausted: true, observed_count: events.length, official_total: null,
    official_total_status: 'unavailable', source_urls: [], official_scope: 'first_regular_season' }
  const from = filters.year_from, to = filters.year_to, playerId = filters.batter_player_id
  if (!from || !to || to < from || to - from > 99 || !playerId) return evidence
  const profiles = await service.searchPlayerInformation({ player_id: playerId, player_name: filters.batter_name, includeCareer: true })
  if (profiles.length !== 1 || profiles[0]!.playerId !== playerId) return evidence
  const url = `https://npb.jp/bis/players/${playerId}.html`
  const annual = (profiles[0]!.annualStatistics ?? []).filter((row) => row.kind === 'batting' && row.sourceUrl === url && row.year >= from && row.year <= to)
  const totals = new Map<number, number>()
  for (let year = from; year <= to; year++) {
    const rows = annual.filter((row) => row.year === year)
    // An absent season or a combined transfer subtotal cannot prove a
    // team-specific number. Never substitute an arbitrary nearby season.
    if (!rows.length || (filters.team && rows.some((row) => !row.team))) return evidence
    let sum = 0
    for (const row of rows) {
      if (filters.team && !matchesGameTeamFilter(row.team!, filters.team)) continue
      const raw = row.metrics.本塁打
      if (!raw || !/^\d+$/u.test(raw)) return evidence
      sum += Number(raw)
    }
    totals.set(year, sum)
  }
  const observed = new Map<number, number>()
  let unclassified = 0, other = 0
  for (const event of events) {
    const competition = event.competition?.normalize('NFKC').replace(/\s+/gu, '') ?? ''
    if (/(?:セ|パ)・リーグ公式戦|セ・パ交流戦/u.test(competition)) {
      const year = Number(event.gameDate.slice(0, 4))
      observed.set(year, (observed.get(year) ?? 0) + 1)
    } else if (/日本シリーズ|クライマックス|プレーオフ|オープン戦|オールスター/u.test(competition)) other++
    else unclassified++
  }
  evidence.official_total = [...totals.values()].reduce((sum, value) => sum + value, 0)
  evidence.official_observed_count = [...observed.values()].reduce((sum, value) => sum + value, 0)
  evidence.other_competitions_count = other
  evidence.unclassified_count = unclassified
  evidence.source_urls = [url]
  if (unclassified) return evidence
  evidence.discrepancies = [...totals.entries()].flatMap(([year, total]) =>
    total === (observed.get(year) ?? 0) ? [] : [{ year, observed: observed.get(year) ?? 0, official_total: total }])
  evidence.official_total_status = evidence.discrepancies.length ? 'incomplete' : 'verified'
  return evidence
}
