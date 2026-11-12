import type { AggregateGamesFilters } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import type { AggregateRow } from './aggregate-repository'
import { hasRepositoryTable } from './schema-detection'
import { canonicalLeagueTeamNames, canonicalTeamName } from './team-name-utils'
import { officialSeasonInWindow } from './official-calendar-repository'

type Snapshot = { snapshot_id: string; source_url: string; team_id: string; team_name: string; fetched_at: string; basis_text: string | null; content_hash: string; raw_key: string; row_count: number; stored_rows: number }
type Season = { snapshot_id: string; season_label: string; year: number; metrics_json: string }
const fields = { games: '試合', wins: '勝利', losses: '敗北', draws: '引分', winRate: '勝率', rank: '順位', battingAverage: '打率', homeRuns: '本塁打', era: '防御率' } as const

/** Read complete official club histories, never totals from a partial game archive. */
export async function searchOfficialTeamSeasons(database: QueryDatabase, filters: AggregateGamesFilters): Promise<AggregateRow[]> {
  if (filters.game_date || filters.opponent || filters.venue || filters.competition || filters.result_text_contains) return []
  if (!await hasRepositoryTable(database, 'official_team_history_snapshots')) return []
  const teams = canonicalLeagueTeamNames(filters.team)
  if (!teams.length) return []
  const snapshots = await database.prepare(`SELECT source.*,
    (SELECT COUNT(*) FROM official_team_seasons season WHERE season.snapshot_id=source.snapshot_id) AS stored_rows
    FROM official_team_history_snapshots source WHERE NOT EXISTS (
      SELECT 1 FROM official_team_history_snapshots newer WHERE newer.source_url=source.source_url AND
      (newer.fetched_at>source.fetched_at OR (newer.fetched_at=source.fetched_at AND newer.snapshot_id>source.snapshot_id)))`).all() as Snapshot[]
  const selected = snapshots.filter((source) => teams.includes(canonicalTeamName(source.team_name)))
  if (selected.length !== teams.length || new Set(selected.map((source) => canonicalTeamName(source.team_name))).size !== teams.length) return []
  for (const source of selected) {
    if (source.row_count !== source.stored_rows || source.source_url !== `https://npb.jp/bis/teams/yearly_${source.team_id}.html` ||
      !/^[a-f0-9]{64}$/u.test(source.content_hash) || source.raw_key !== `raw/bis-team-history/${source.team_id}/${source.content_hash}.html` || !Number.isFinite(Date.parse(source.fetched_at))) {
      throw new Error('Official team history source integrity mismatch')
    }
  }
  const from = filters.year ?? filters.year_from, to = filters.year ?? filters.year_to
  if (!from && !to) return []
  const clauses = [`snapshot_id IN (${selected.map(() => '?').join(',')})`], values: Array<string | number> = selected.map((source) => source.snapshot_id)
  if (from) { clauses.push('year>=?'); values.push(from) }
  if (to) { clauses.push('year<=?'); values.push(to) }
  const rows = await database.prepare(`SELECT snapshot_id,season_label,year,metrics_json FROM official_team_seasons WHERE ${clauses.join(' AND ')} ORDER BY year,season_label,snapshot_id`).all(...values) as Season[]
  const byId = new Map(selected.map((source) => [source.snapshot_id, source]))
  const result: AggregateRow[] = rows.map((row) => {
    const source = byId.get(row.snapshot_id)!
    const raw: unknown = JSON.parse(row.metrics_json)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.values(raw).every((value) => typeof value === 'string')) throw new Error('Invalid official team metrics')
    const metrics = raw as Record<string, string>
    if (metrics.年度 !== row.season_label || Number(row.season_label.slice(0, 4)) !== row.year) throw new Error('Official team season identity mismatch')
    const stats: AggregateRow['stats'] = { year: row.year, seasonLabel: row.season_label, team: source.team_name, subjectType: 'team',
      sourceUrls: JSON.stringify([source.source_url]), fetchedAt: source.fetched_at, basisText: source.basis_text,
      evidenceStatus: 'official_complete_team_history' }
    for (const [field, label] of Object.entries(fields)) {
      const text = metrics[label] ?? ''
      const value = /^(?:\d+(?:\.\d+)?|\.\d+)$/u.test(text) ? Number(text) : null
      if (['games', 'wins', 'losses', 'draws'].includes(field) && (value === null || !Number.isInteger(value))) throw new Error('Invalid official team count')
      stats[field] = value
    }
    if (Number(stats.games) !== Number(stats.wins) + Number(stats.losses) + Number(stats.draws)) throw new Error('Official team decisions disagree')
    if (row.year >= 2016 && Number(stats.wins) + Number(stats.losses) > 0 &&
      (typeof stats.winRate !== 'number' || Math.abs(stats.winRate - Number(stats.wins) / (Number(stats.wins) + Number(stats.losses))) > 0.00050001)) throw new Error('Official team winning percentage mismatch')
    return { kind: 'games', label: source.team_name, total: Number(stats.games), stats }
  })
  if (filters.date_from || filters.date_to) {
    for (const row of result) {
      const calendar = await officialSeasonInWindow(database, Number(row.stats.year), filters.date_from, filters.date_to)
      const standing = calendar?.facts.standings.find((team) => canonicalTeamName(team.team) === canonicalTeamName(row.label))
      if (!calendar || !standing) return []
      for (const field of ['games', 'wins', 'losses', 'draws', 'winRate'] as const) {
        if (row.stats[field] !== standing[field]) throw new Error('Official calendar and club season disagree')
      }
      row.stats.sourceUrls = JSON.stringify([...JSON.parse(String(row.stats.sourceUrls)), calendar.sourceUrl])
      row.stats.calendarFrom = calendar.facts.calendarFrom
      row.stats.calendarTo = calendar.facts.calendarTo
    }
  }
  if (filters.sort_by) {
    const field = filters.sort_by, direction = (filters.sort_direction ?? (field === 'rank' || field === 'era' ? 'asc' : 'desc')) === 'asc' ? 1 : -1
    result.sort((left, right) => {
      const a = left.stats[field], b = right.stats[field]
      return typeof a !== 'number' ? (typeof b === 'number' ? 1 : left.label.localeCompare(right.label, 'ja'))
        : typeof b !== 'number' ? -1 : direction * (a - b) || left.label.localeCompare(right.label, 'ja')
    })
  }
  return filters.limit ? result.slice(0, filters.limit) : result
}
