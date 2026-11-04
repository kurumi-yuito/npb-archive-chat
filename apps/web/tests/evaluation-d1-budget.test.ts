import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEvaluationD1Budget } from '../../../scripts/evaluation-d1-budget.mjs'

describe('shared D1 evaluation read budget', () => {
  it('blocks remote evaluation before a request when the account budget or measured local baseline is absent', async () => {
    const base = { baseUrl: 'https://example.test', caseIds: ['B31'] }
    expect((await createEvaluationD1Budget({ ...base, env: {} })).preflightIssue).toBe('remote_evaluation_requires_verified_account_read_budget')
    expect((await createEvaluationD1Budget({ ...base, env: { NPB_EVAL_D1_READ_BUDGET: '5000' } })).preflightIssue).toContain('missing_local_cost_baseline')
  })

  it('requires successful measured local cases, reserves headroom and stops an unexpectedly expensive case', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'npb-read-budget-'))
    try {
      const file = path.join(directory, 'baseline.json')
      await writeFile(file, JSON.stringify({ baseUrl: 'http://127.0.0.1:8789', results: [
        { id: 'B31', verdict: 'pass', status: 200, d1ReadAudit: { total: 1000, unknown: 0 } },
      ] }))
      const options = { baseUrl: 'https://example.test', caseIds: ['B31'], env: { NPB_EVAL_COST_BASELINE: file, NPB_EVAL_D1_READ_BUDGET: '5000' } }
      const budget = await createEvaluationD1Budget(options)
      expect(budget.preflightIssue).toBeNull()
      expect(budget.snapshot().estimatedRows).toBe(2000)
      expect(budget.observe('B31', { total: 2100, unknown: 0 })).toBe('d1_case_read_estimate_exceeded:B31')
      expect((await createEvaluationD1Budget({ ...options, env: { ...options.env, NPB_EVAL_D1_READ_BUDGET: '1999' } })).preflightIssue).toBe('insufficient_d1_read_budget_for_selected_cases')
      expect(budget.observe('B31', { total: null, unknown: 1 })).toBe('d1_read_measurement_unavailable:B31')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('allows broad evaluation only on the isolated local worker without consuming a remote budget', async () => {
    const budget = await createEvaluationD1Budget({ baseUrl: 'http://127.0.0.1:8789', caseIds: ['B31'], env: {} })
    expect(budget.preflightIssue).toBeNull()
    expect(budget.observe('B31', { total: 10000000, unknown: 0 })).toBeNull()
    expect(budget.snapshot().measuredRows).toBe(10000000)
  })
})
