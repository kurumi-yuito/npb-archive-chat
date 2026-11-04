import { readFile } from 'node:fs/promises'

export function isLocalEvaluationUrl(value) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)
}

/** A shared production DB is never a place to discover an unmeasured full scan. */
export async function createEvaluationD1Budget({ baseUrl, caseIds, env = process.env }) {
  const local = isLocalEvaluationUrl(baseUrl)
  const configured = env.NPB_EVAL_D1_READ_BUDGET
  const budget = configured === undefined ? null : Number(configured)
  let preflightIssue = null
  let estimatedRows = 0
  let measuredRows = 0
  let unknownCases = 0
  const estimates = new Map()
  if (budget !== null && (!Number.isSafeInteger(budget) || budget < 0)) preflightIssue = 'invalid_d1_read_budget'
  if (!local && budget === null) preflightIssue = 'remote_evaluation_requires_verified_account_read_budget'
  if (!local && !preflightIssue) {
    try {
      if (!env.NPB_EVAL_COST_BASELINE) throw new Error('missing_local_cost_baseline')
      const baseline = JSON.parse(await readFile(env.NPB_EVAL_COST_BASELINE, 'utf8'))
      if (!isLocalEvaluationUrl(baseline.baseUrl)) throw new Error('cost_baseline_must_use_isolated_local_worker')
      const rows = baseline.results ?? baseline.cases ?? []
      for (const id of caseIds) {
        const row = rows.find((entry) => entry.id === id)
        if (!row || (row.verdict ?? row.status) !== 'pass' || (row.httpStatus ?? row.status) !== 200 || !validAudit(row.d1ReadAudit)) throw new Error(`missing_successful_measured_local_case:${id}`)
        const estimate = Math.max(1000, Math.ceil(row.d1ReadAudit.total * 2))
        estimates.set(id, estimate)
        estimatedRows += estimate
      }
      if (estimatedRows > budget) preflightIssue = 'insufficient_d1_read_budget_for_selected_cases'
    } catch (error) { preflightIssue = String(error) }
  }
  if (budget === 0) preflightIssue = 'd1_read_budget_exhausted'
  return {
    preflightIssue,
    observe(id, audit) {
      if (!validAudit(audit)) {
        unknownCases++
        return !local || budget !== null ? `d1_read_measurement_unavailable:${id}` : null
      }
      measuredRows += audit.total
      if (estimates.has(id) && audit.total > estimates.get(id)) return `d1_case_read_estimate_exceeded:${id}`
      if (budget !== null && measuredRows > budget) return `d1_read_budget_exceeded:${id}`
      return null
    },
    snapshot: () => ({ local, budget, estimatedRows, measuredRows, unknownCases, preflightIssue }),
  }
}

function validAudit(value) {
  return value && Number.isSafeInteger(value.total) && value.total >= 0 && value.unknown === 0
}

export function parseD1ReadAudit(response) {
  try { return JSON.parse(response?.headers.get('x-npb-d1-read-audit') ?? 'null') } catch { return null }
}
