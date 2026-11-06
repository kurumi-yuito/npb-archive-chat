import { officialInningsOuts, type AggregatePitchingFilters } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import type { AggregateRow } from './aggregate-repository'
import { readOfficialStatisticSeason } from './official-statistic-scope'

const counts = { games: '登板', wins: '勝利', losses: '敗北', saves: 'セーブ', strikeouts: '三振', hitsAllowed: '安打', homeRunsAllowed: '本塁打', walks: '四球', hitBatters: '死球', earnedRuns: '自責点', runsAllowed: '失点', battersFaced: '打者' } as const

export async function aggregateOfficialPitchingSeason(database: QueryDatabase, filters: AggregatePitchingFilters): Promise<AggregateRow[] | null> {
  // A named player's season has no league qualification ambiguity. League ERA
  // leaderboards require separately verified qualification rules/sources.
  const ids = new Set([...(filters.pitcher_player_ids ?? []), ...(filters.pitcher_player_id ? [filters.pitcher_player_id] : [])])
  if (!ids.size || filters.game_date || filters.date_from || filters.date_to || filters.game_id || filters.recent || filters.min_innings_per_start !== undefined || filters.max_earned_runs_per_start !== undefined || filters.max_runs_per_start !== undefined) return null
  const evidence = await readOfficialStatisticSeason(database, filters, 'pitching')
  if (!evidence) return null
  type Group = { name: string; playerId: string; teams: Set<string>; urls: Set<string>; outs: number; stats: Record<string, number | null> }
  const groups = new Map<string, Group>()
  for (const row of evidence.rows) {
    if (!row.player_id || !ids.has(row.player_id)) continue
    const source = evidence.byId.get(row.snapshot_id)!
    let group = groups.get(row.player_id)
    if (!group) { group = { name: row.player_name, playerId: row.player_id, teams: new Set(), urls: new Set(), outs: 0, stats: {} }; groups.set(row.player_id, group) }
    group.teams.add(source.team_name)
    group.urls.add(source.source_url)
    const metrics: unknown = JSON.parse(row.metrics_json)
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) throw new Error('Invalid official pitching metrics')
    const values = metrics as Record<string, unknown>
    if (typeof values.投球回 !== 'string') throw new Error('Missing official innings')
    group.outs += officialInningsOuts(values.投球回)
    for (const [field, label] of Object.entries(counts)) {
      const raw = values[label]
      const value = typeof raw === 'string' && /^\d+$/u.test(raw) ? Number(raw) : null
      if (value === null && ['games', 'wins', 'losses', 'earnedRuns'].includes(field)) throw new Error(`Missing official pitching count: ${label}`)
      group.stats[field] = value === null || group.stats[field] === null ? null : (group.stats[field] ?? 0) + value
    }
  }
  const result: AggregateRow[] = [...groups.values()].map((group) => ({ kind: 'pitching', label: group.name, total: group.stats.games!, stats: {
    ...group.stats, inningsPitched: group.outs / 3, era: group.outs > 0 ? group.stats.earnedRuns! * 27 / group.outs : null,
    whip: group.outs > 0 && typeof group.stats.hitsAllowed === 'number' && typeof group.stats.walks === 'number' ? (group.stats.hitsAllowed + group.stats.walks) * 3 / group.outs : null,
    playerId: group.playerId, playerName: group.name, team: [...group.teams].join('・'), sourceUrls: JSON.stringify([...group.urls]),
    evidenceStatus: evidence.rows.every((row) => row.player_id !== null) ? 'official_complete_scope' : 'official_identity_incomplete', year: evidence.year, level: evidence.level,
  } }))
  const field = filters.sort_by ?? 'inningsPitched'
  const direction = ['era', 'whip'].includes(field) ? 1 : -1
  result.sort((a, b) => {
    const left = a.stats[field], right = b.stats[field]
    if (typeof left !== 'number') return typeof right === 'number' ? 1 : a.label.localeCompare(b.label, 'ja')
    if (typeof right !== 'number') return -1
    return direction * (left - right) || a.label.localeCompare(b.label, 'ja')
  })
  return filters.limit === undefined ? result : result.slice(0, filters.limit)
}
