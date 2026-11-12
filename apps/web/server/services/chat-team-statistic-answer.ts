import type { ChatResponseCore, QueryContract } from '@npb/schemas'
import { canonicalTeamName, matchesGameTeamFilter } from '@npb/db'
import { QueryContractCompileError } from './chat-contract-compiler'
import { teamStatisticMetric } from './chat-statistic-metrics'
import { competitionLeague } from './chat-competition-scope'
import { resolveContractTeamMention } from './chat-team-resolution'

/** Venue-scoped records are a subset of captured games, never annual standings. */
export function formatRecordedVenueStatistics(contract: QueryContract, rows: ChatResponseCore['results']['aggregates'], effectiveYear?: number): string {
  const venue = contract.entities.find((entity) => entity.kind === 'venue')?.mention
  if (!venue) throw new QueryContractCompileError(['recorded_team_venue_required'])
  const time = contract.temporal_scope
  const period = time.date_from || time.date_to ? `${time.date_from ?? ''}〜${time.date_to ?? ''}`
    : time.years.length ? `${time.years.join('・')}年` : time.year_from || time.year_to ? `${time.year_from ?? ''}〜${time.year_to ?? ''}年` : effectiveYear ? `${effectiveYear}年` : '指定期間'
  const fields = contract.requested_output.flatMap((output) => output.fields)
  const metrics = (fields.length ? fields : ['wins', 'losses', 'draws', 'winRate', 'games']).map((field) => {
    const metric = teamStatisticMetric(field)
    if (!metric) throw new QueryContractCompileError([`unsupported_team_metric:${field}`])
    return metric
  })
  if (!rows.length) return `${period}・${venue}の指定球団の試合記録は、収録データから確認できませんでした。`
  const lines = rows.map((row) => {
    const clubs = contract.entities.filter((entity) => entity.kind === 'team' && entity.role === 'subject')
    if (clubs.length && !clubs.some((club) => matchesGameTeamFilter(row.label, resolveContractTeamMention(club.mention)))) throw new QueryContractCompileError(['team_statistic_subject_mismatch'])
    const wins = row.stats.wins, losses = row.stats.losses, draws = row.stats.draws, total = row.stats.total_games
    if (row.kind !== 'games' || ![wins, losses, draws, total].every((value) => typeof value === 'number' && Number.isInteger(value) && value >= 0)) throw new QueryContractCompileError(['invalid_recorded_team_counts'])
    const known = Number(wins) + Number(losses) + Number(draws)
    if (known > Number(total)) throw new QueryContractCompileError(['invalid_recorded_team_decisions'])
    const gameIds: unknown = JSON.parse(String(row.stats.evidenceGameIds ?? 'null'))
    if (!Array.isArray(gameIds) || gameIds.some((id) => typeof id !== 'string') || new Set(gameIds).size !== Number(total)) throw new QueryContractCompileError(['recorded_team_game_evidence_mismatch'])
    const stats: Record<string, number | null> = { wins: Number(wins), losses: Number(losses), draws: Number(draws), games: known,
      winRate: Number(wins) + Number(losses) > 0 ? Number(wins) / (Number(wins) + Number(losses)) : null }
    const values = metrics.map((metric) => {
      const value = stats[metric.field]
      if (value === undefined || value === null) return `${metric.label}は未確認`
      return `${metric.label}${metric.precision !== undefined ? value.toFixed(metric.precision) : value}${metric.unit ?? ''}`
    })
    return `${row.label}：${values.join('、')}。${Number(total) > known ? `スコア未確定${Number(total) - known}試合は勝敗から除外しました。` : ''}`
  })
  return `${period}・${venue}の収録済み試合に基づく成績です。\n${lines.join('\n')}\n未収録試合は集計に含まれていません。`
}

/** Club records retain the official year, source and published decision counts. */
export function formatContractTeamStatistics(contract: QueryContract, rows: ChatResponseCore['results']['aggregates']): string {
  const identity = new Set(['team', 'teamName', 'team_name', 'year', 'season', 'sourceUrl', 'source_url'])
  const requested = contract.requested_output.flatMap((output) => output.fields).filter((field) => !identity.has(field))
  const metrics = [...new Map((requested.length ? requested : ['wins', 'losses', 'draws', 'winRate', 'rank']).map((field) => {
    const metric = teamStatisticMetric(field)
    if (!metric) throw new QueryContractCompileError([`unsupported_team_metric:${field}`])
    return [metric.field, metric] as const
  })).values()]
  if (!rows.length) return '指定された球団・年度の公式年度成績を確認できませんでした。収録済みの一部試合を年度全体の勝敗・順位としては回答しません。'
  const namedClubs = contract.entities.filter((entity) => entity.kind === 'team' && !competitionLeague(entity.mention))
  const label = (row: typeof rows[number]) => {
    const club = namedClubs.find((entity) => matchesGameTeamFilter(row.label, resolveContractTeamMention(entity.mention)))
    return club && canonicalTeamName(club.mention) === resolveContractTeamMention(club.mention) ? club.mention : row.label
  }
  const league = [...contract.competition_scope.competitions, ...contract.entities.filter((entity) => entity.kind === 'team').map((entity) => entity.mention)]
    .map(competitionLeague).find((value) => value !== null)
  const time = contract.temporal_scope
  const seen = new Set<string>()
  const lines = rows.map((row) => {
    const year = row.stats.year, season = row.stats.seasonLabel
    if ((namedClubs.length && !namedClubs.some((club) => matchesGameTeamFilter(row.label, resolveContractTeamMention(club.mention)))) ||
      (league && !matchesGameTeamFilter(row.label, league))) throw new QueryContractCompileError(['team_statistic_subject_mismatch'])
    if (row.kind !== 'games' || row.stats.subjectType !== 'team' || row.stats.evidenceStatus !== 'official_complete_team_history' ||
      typeof year !== 'number' || !Number.isInteger(year) || typeof season !== 'string' || Number(season.slice(0, 4)) !== year ||
      (time.years.length && !time.years.includes(year)) || (time.year_from !== null && year < time.year_from) || (time.year_to !== null && year > time.year_to)) throw new QueryContractCompileError(['team_statistic_scope_mismatch'])
    const key = `${row.label}:${season}`
    if (seen.has(key)) throw new QueryContractCompileError(['duplicate_team_season'])
    seen.add(key)
    const values = metrics.map((metric) => {
      const value = row.stats[metric.field]
      if (value === null || value === undefined) return `${metric.label}は未確認`
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (metric.precision === undefined && !Number.isInteger(value))) throw new QueryContractCompileError([`invalid_team_metric:${metric.field}`])
      const formatted = metric.precision === undefined ? String(value) : value.toFixed(metric.precision)
      return metric.field === 'rank' ? `${metric.label}${formatted}位` : metric.unit ? `${formatted}${metric.unit}` : `${metric.label}${formatted}`
    })
    return `${season}年 ${label(row)}：${values.join('、')}。`
  })
  const basis = [...new Set(rows.flatMap((row) => typeof row.stats.basisText === 'string' && row.stats.basisText ? [row.stats.basisText] : []))]
  let conclusion = ''
  if (rows.length > 1 && namedClubs.length > 1 && metrics.length === 1) {
    const metric = metrics[0]!, values = rows.map((row) => row.stats[metric.field])
    if (values.every((value) => typeof value === 'number')) {
      const maximum = Math.max(...values as number[]), minimum = Math.min(...values as number[])
      const preferred = metric.field === 'rank' ? minimum : maximum
      conclusion = maximum === minimum ? `${metric.label}は同じ値です。` : `${metric.label}が${metric.field === 'rank' ? '上位な' : '最も高い'}のは${rows.filter((row) => row.stats[metric.field] === preferred).map((row) => `${row.stats.seasonLabel}年の${label(row)}`).join('・')}です。`
    }
  }
  if (rows.length === 2 && new Set(rows.map((row) => canonicalTeamName(row.label))).size === 1) {
    const ordered = [...rows].sort((a, b) => Number(a.stats.year) - Number(b.stats.year))
    const [previous, current] = ordered
    if (Number(current!.stats.year) === Number(previous!.stats.year) + 1) {
      const decisions = (row: typeof rows[number]) => `${row.stats.wins}勝${row.stats.losses}敗${row.stats.draws}分`
      const differences = metrics.flatMap((metric) => {
        const before = previous!.stats[metric.field], after = current!.stats[metric.field]
        if (typeof before !== 'number' || typeof after !== 'number') return []
        const difference = after - before
        if (difference === 0) return [`${metric.label}は同じ値です。`]
        const amount = metric.precision === undefined ? String(Math.abs(difference)) : Math.abs(difference).toFixed(metric.precision)
        return [`${metric.label}は${amount}${metric.unit ?? ''}${difference > 0 ? '増加' : '減少'}しています。`]
      })
      conclusion = `前年（${previous!.stats.year}年）は${decisions(previous!)}、${current!.stats.year}年は${decisions(current!)}です。${differences.join('')}`
    }
  }
  return ['球団の公式年度成績です。', ...lines, ...(conclusion ? [conclusion] : []), ...(basis.length ? [`出典の基準時点：${basis.join('／')}。`] : [])].join('\n')
}
