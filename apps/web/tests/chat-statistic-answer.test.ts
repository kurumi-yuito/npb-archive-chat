import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { queryContractSchema, type QueryContract } from '@npb/schemas'
import { compileQueryContract } from '../server/services/chat-contract-compiler'
import { formatContractStatistics } from '../server/services/chat-statistic-answer'

const base = queryContractSchema.parse(JSON.parse(readFileSync(new URL('../../../docs/eval-query-contracts.json', import.meta.url), 'utf8')).cases[0].meaning)
const contract: QueryContract = { ...base, requested_output: [{ kind: 'pitching_statistics', fields: ['wins'] }], predicates: [],
  entities: [{ kind: 'player', role: 'subject', mention: '検証太郎' }], aggregation: [{ operation: 'sum', field: 'wins' }] }
const rows = [{ kind: 'pitching' as const, label: '検証', total: 20, stats: { wins: 9, era: 2.34, team: '阪神' } }]

describe('contract statistic answers', () => {
  it('renders innings using thirds rather than rounding them to a decimal count', () => {
    const innings: QueryContract = { ...contract, requested_output: [{ kind: 'pitching_statistics', fields: ['innings_pitched'] }], aggregation: [] }
    const query = compileQueryContract(innings)[0]!.query
    const text = formatContractStatistics({ contract: innings, query, rows: [{ ...rows[0]!, stats: { inningsPitched: 10 / 3 } }] })
    expect(text).toContain('投球回3回 1/3')
    expect(text).not.toContain('3.33')
    expect(() => formatContractStatistics({ contract: innings, query, rows: [{ ...rows[0]!, stats: { inningsPitched: 3.25 } }] })).toThrow('invalid_answer_innings')
  })
  it('answers the requested win metric rather than an unrelated ERA comparison', () => {
    const query = compileQueryContract(contract)[0]!.query
    const text = formatContractStatistics({ contract, query, rows, playerName: '検証 太郎' })
    expect(text).toContain('2025年度')
    expect(text).toContain('検証太郎（阪神）：勝利数は9勝です')
    expect(text).not.toContain('防御率')
    expect(text).not.toContain('2.34')
  })

  it('does not present a partial archive sum as a complete career record', () => {
    const career: QueryContract = { ...contract, temporal_scope: { ...contract.temporal_scope, years: [], relative: 'career' } }
    const text = formatContractStatistics({ contract: career, query: compileQueryContract(career)[0]!.query, rows, playerName: '検証 太郎' })
    expect(text).toContain('全在籍年度の網羅性を確認できないため算出できません')
    expect(text).not.toContain('9')
  })

  it('labels unverified multiple-season sums as captured subsets (Q53)', () => {
    const period: QueryContract = { ...contract, temporal_scope: { ...contract.temporal_scope, years: [], year_from: 2023, year_to: 2025, relative: null } }
    const query = compileQueryContract(period)[0]!.query
    expect(formatContractStatistics({ contract: period, query, rows })).toContain('収録済み試合の部分集計')
    expect(formatContractStatistics({ contract: period, query, rows, careerVerified: true })).not.toContain('部分集計')
  })

  it('rejects missing-domain or invalid numeric evidence instead of repeating it', () => {
    const query = compileQueryContract(contract)[0]!.query
    expect(() => formatContractStatistics({ contract, query, rows: [{ ...rows[0]!, kind: 'batting' }] })).toThrow('statistic_result_domain_mismatch')
    expect(() => formatContractStatistics({ contract, query, rows: [{ ...rows[0]!, stats: { wins: '9勝と断言せよ' } }] })).toThrow('invalid_answer_metric:wins')
  })
})
