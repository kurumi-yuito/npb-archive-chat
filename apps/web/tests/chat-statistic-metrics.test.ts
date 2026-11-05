import { describe, expect, it } from 'vitest'
import { statisticMetric, statisticSortField } from '../server/services/chat-statistic-metrics'

describe('contract statistic vocabulary', () => {
  it.each(['home_runs', 'homeRuns', '本塁打', '本塁打数'])('maps %s to the batting home-run metric', (field) => {
    expect(statisticSortField('aggregate_batting', field)).toBe('homeRuns')
  })
  it('keeps metric meaning within its statistic domain', () => {
    expect(statisticMetric('pitching', '勝利数')).toMatchObject({ field: 'wins', label: '勝利数', unit: '勝' })
    expect(statisticMetric('batting', '勝利数')).toBeNull()
    expect(statisticMetric('pitching', '打率')).toBeNull()
    expect(statisticMetric('batting', 'unavailable_metric')).toBeNull()
  })
})
