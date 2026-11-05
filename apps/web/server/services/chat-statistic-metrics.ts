import type { ChatStructuredQuery } from '@npb/schemas'

type StatisticDomain = 'batting' | 'pitching'
export type StatisticMetric = { field: string; label: string; aliases: string[]; precision?: number; unit?: string; unitStyle?: 'suffix' }
const batting: StatisticMetric[] = [
  { field: 'games', label: '試合', aliases: ['games', '試合数'] },
  { field: 'hits', label: '安打', aliases: ['hits', '安打数'] },
  { field: 'atBats', label: '打数', aliases: ['at_bats'] },
  { field: 'homeRuns', label: '本塁打', aliases: ['home_runs', '本塁打数', 'ホームラン'], unit: '本', unitStyle: 'suffix' },
  { field: 'runsBattedIn', label: '打点', aliases: ['runs_batted_in', 'rbi'] },
  { field: 'stolenBases', label: '盗塁', aliases: ['stolen_bases'] },
  { field: 'walks', label: '四球', aliases: ['walks'] },
  { field: 'strikeouts', label: '三振', aliases: ['strikeouts'] },
  { field: 'battingAverage', label: '打率', aliases: ['batting_average', 'average', 'avg'], precision: 3 },
  { field: 'ops', label: 'OPS', aliases: ['ops'], precision: 3 },
  { field: 'isoP', label: 'IsoP', aliases: ['iso_p'], precision: 3 },
  { field: 'bbRate', label: '四球率', aliases: ['bb_rate'], precision: 3 },
]
const pitching: StatisticMetric[] = [
  { field: 'games', label: '登板', aliases: ['games', '登板数', '試合'] },
  { field: 'wins', label: '勝利数', aliases: ['wins', '勝利', '勝'], unit: '勝' },
  { field: 'losses', label: '敗戦', aliases: ['losses', '敗北', '敗'] },
  { field: 'saves', label: 'セーブ', aliases: ['saves', 'セーブ数'] },
  { field: 'strikeouts', label: '奪三振', aliases: ['strikeouts', '奪三振数', '三振'] },
  { field: 'inningsPitched', label: '投球回', aliases: ['innings_pitched'], precision: 2 },
  { field: 'hitsAllowed', label: '被安打', aliases: ['hits_allowed', '安打'] },
  { field: 'walks', label: '与四球', aliases: ['walks', '四球'] },
  { field: 'earnedRuns', label: '自責点', aliases: ['earned_runs'] },
  { field: 'era', label: '防御率', aliases: ['era', 'earned_run_average'], precision: 2 },
  { field: 'whip', label: 'WHIP', aliases: ['whip'], precision: 2 },
]
const key = (value: string) => value.normalize('NFKC').replace(/[\s_-]+/gu, '').toLowerCase()

/** Metric vocabulary is shared by planning and rendering; it never matches question text. */
export function statisticMetric(domain: StatisticDomain, value: string): StatisticMetric | null {
  const normalized = key(value)
  return (domain === 'batting' ? batting : pitching).find((metric) => [metric.field, metric.label, ...metric.aliases].some((alias) => key(alias) === normalized)) ?? null
}

export function allStatisticMetrics(domain: StatisticDomain): readonly StatisticMetric[] {
  return domain === 'batting' ? batting : pitching
}

export function statisticDomain(intent: ChatStructuredQuery['intent']): StatisticDomain | null {
  return intent === 'aggregate_batting' ? 'batting' : intent === 'aggregate_pitching' ? 'pitching' : null
}

export function statisticSortField(intent: ChatStructuredQuery['intent'], field: string): string {
  const domain = statisticDomain(intent)
  return domain ? statisticMetric(domain, field)?.field ?? field : field
}
