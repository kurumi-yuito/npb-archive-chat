import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { matchesAcceptanceSummary } from '../../../scripts/acceptance-summary.mjs'
import { calendarAcceptanceIssues } from '../../../scripts/acceptance-calendar.mjs'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ))
})

describe('Acceptance runner fail-fast contract', () => {
  it('stops on provider credit exhaustion even with continue-on-failure and preserves unexecuted turns (Q-201)', async () => {
    let chatRequests = 0
    const server = createServer((request, response) => {
      request.resume()
      response.setHeader('content-type', 'application/json')
      if (request.url === '/api/health') { response.end('{"ok":true}'); return }
      chatRequests++
      response.statusCode = 503
      response.end(JSON.stringify({ data: { code: 'chat_llm_unavailable', reason: 'upstream_quota_exhausted', retryable: false, upstream_status: 429 } }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('mock server did not bind')
    const output = await mkdtemp(path.join(tmpdir(), 'npb-quota-stop-'))
    temporaryDirectories.push(output)
    try {
      const run = spawn(process.execPath, [path.join(root, 'scripts/qa-acceptance.mjs'), '--cases=B01,B02', '--continue-on-failure'], {
        cwd: root, env: { ...process.env, NPB_ACCEPTANCE_BASE_URL: `http://127.0.0.1:${address.port}`, NPB_ACCEPTANCE_OUTPUT_DIR: output },
      })
      const code = await new Promise<number | null>((resolve, reject) => { run.once('error', reject); run.once('exit', resolve) })
      expect(code).toBe(1)
      expect(chatRequests).toBe(1)
      const files = await readdir(output)
      expect(files).toHaveLength(1)
      const log = JSON.parse(await readFile(path.join(output, files[0]!), 'utf8'))
      expect(log).toMatchObject({ status: 'stopped', stopReason: 'upstream_quota_exhausted', passCount: 0, failCount: 1,
        unexecutedCount: 1, resume: { nextCaseId: 'B02', remainingCaseIds: ['B02'] } })
    } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
  })
  it('checks the owner-confirmed current-season month without accepting wrong years, opponents or a bare score list', () => {
    const body = { structured_query: { intent: 'aggregate_games', filters: { date_from: '2026-08-01', date_to: '2026-08-31', team: 'オリックス', opponent: 'ロッテ' } },
      answer: { summary: '2026年8月のオリックス対ロッテは2勝1敗です。', source_urls: ['https://npb.jp/bis/2026/games/example.html'] },
      results: { aggregates: [{ kind: 'games', label: 'オリックス', stats: { wins: 2, losses: 1, draws: 0 } }] } }
    const oracle = { environment: 'independent_python_html_audit', scope: { year: 2026, month: 8 }, headToHead: { subjectTeam: 'b', opponentTeam: 'm', wins: 2, losses: 1, draws: 0 } }
    expect(calendarAcceptanceIssues('B29', body, 2026, oracle)).toEqual([])
    expect(calendarAcceptanceIssues('B29', body, 2026)).toContain('independent_numeric_oracle_missing')
    expect(calendarAcceptanceIssues('B29', body, 2026, { ...oracle, headToHead: { ...oracle.headToHead, wins: 1, losses: 2 } })).toContain('independent_head_to_head_total_mismatch')
    expect(calendarAcceptanceIssues('B29', body, 2025)).toContain('calendar_scope_mismatch')
    expect(calendarAcceptanceIssues('B29', { ...body, structured_query: { ...body.structured_query, filters: { ...body.structured_query.filters, opponent: '阪神' } } }, 2026)).toContain('head_to_head_plan_missing')
    expect(calendarAcceptanceIssues('B29', { ...body, results: { games: [] } }, 2026)).toContain('head_to_head_evidence_missing')
    expect(calendarAcceptanceIssues('B29', { ...body, answer: { ...body.answer, source_urls: [] } }, 2026)).toContain('official_source_missing')
    const leader = { structured_query: { intent: 'aggregate_batting', filters: { date_from: '2026-05-01', date_to: '2026-05-31', sort_by: 'homeRuns', limit: 1 } },
      answer: { summary: '2026年5月の本塁打11本', source_urls: ['https://npb.jp/scores/sample/box.html'] },
      results: { aggregates: [{ kind: 'batting', label: '検証選手', stats: { homeRuns: 11 } }] } }
    const leaderOracle = { environment: 'independent_python_html_audit', scope: { year: 2026, month: 5 }, leaderboard: [{ homeRuns: 11 }] }
    expect(calendarAcceptanceIssues('B22', leader, 2026, leaderOracle)).toEqual([])
    expect(calendarAcceptanceIssues('B22', { ...leader, results: { aggregates: [{ ...leader.results.aggregates[0], stats: { homeRuns: 6 } }] } }, 2026, leaderOracle)).toContain('independent_home_run_total_mismatch')
  })
  it('B09/B11 keep their subject and requested fact assertions across the allowed newline difference', () => {
    const condition = /佐々木朗希.*加藤貴/u
    expect(matchesAcceptanceSummary(condition, '佐々木朗希の登板です。\n相手先発は加藤貴です。')).toBe(true)
    expect(matchesAcceptanceSummary(condition, '増井の登板です。\n相手先発は加藤貴です。')).toBe(false)
    expect(matchesAcceptanceSummary(condition, '佐々木朗希の登板です。\n相手先発は未確認です。')).toBe(false)
  })
  it('allows punctuation between numeric record fields while retaining every requested fact', () => {
    const condition = /阪神.*79勝62敗/u
    expect(matchesAcceptanceSummary(condition, '阪神：79勝、62敗、2分')).toBe(true)
    expect(matchesAcceptanceSummary(condition, '阪神：79勝、63敗')).toBe(false)
    expect(matchesAcceptanceSummary(condition, '巨人：79勝、62敗')).toBe(false)
    expect(matchesAcceptanceSummary(condition, '阪神：79勝、敗北数は未確認')).toBe(false)
  })
  it('stops at B01 and saves a resumable partial log', async () => {
    const requestedMessages: string[] = []
    const requestedUserAgents: string[] = []
    const server = createServer((request, response) => {
      if (request.url === '/api/health') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ ok: true }))
        return
      }

      let body = ''
      request.setEncoding('utf8')
      request.on('data', (chunk) => { body += chunk })
      request.on('end', () => {
        requestedMessages.push(JSON.parse(body).message)
        requestedUserAgents.push(request.headers['user-agent'] ?? '')
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          structured_query: { intent: 'game_detail', filters: {} },
          answer: { summary: '意図的に期待値と一致しないB01回答' },
        }))
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('mock server did not bind to a TCP port')
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'qa-acceptance-runner-'))
    temporaryDirectories.push(outputDirectory)

    try {
      const run = spawn(process.execPath, [
        path.join(root, 'scripts/qa-acceptance.mjs'),
        `--cases=B01,B02,${Array.from({ length: 30 }, (_, index) => `unused-${index}`).join(',')}`,
      ], {
        cwd: root,
        env: {
          ...process.env,
          NPB_ACCEPTANCE_BASE_URL: `http://127.0.0.1:${address.port}`,
          NPB_ACCEPTANCE_OUTPUT_DIR: outputDirectory,
        },
      })
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        run.once('error', reject)
        run.once('exit', resolve)
      })

      expect(exitCode).toBe(1)
      expect(requestedMessages).toEqual(['昨日の巨人の試合結果を教えて'])
      expect(requestedUserAgents).toEqual(['npb-acceptance/B01'])

      const logFiles = await readdir(outputDirectory)
      expect(logFiles).toHaveLength(1)
      expect(logFiles[0]).toMatch(/^qa-acceptance-selected-cases-\d+\.json$/u)
      const log = JSON.parse(await readFile(path.join(outputDirectory, logFiles[0]!), 'utf8'))
      expect(log).toMatchObject({
        status: 'stopped',
        stopReason: 'fail_fast:B01',
        lastExecutedCase: 'B01',
        passCount: 0,
        failCount: 1,
        unexecutedCount: 1,
        resume: {
          nextCaseId: 'B02',
          remainingCaseIds: ['B02'],
        },
      })
      expect(log.results).toEqual([
        expect.objectContaining({
          id: 'B01',
          status: 200,
          summary: '意図的に期待値と一致しないB01回答',
          verdict: 'fail',
          failureReason: 'acceptance pattern mismatch',
        }),
      ])

      const multiTurnOutputDirectory = await mkdtemp(path.join(tmpdir(), 'qa-acceptance-runner-turn-'))
      temporaryDirectories.push(multiTurnOutputDirectory)
      const multiTurnRun = spawn(process.execPath, [
        path.join(root, 'scripts/qa-acceptance.mjs'),
        '--cases=MT01-Turn1',
      ], {
        cwd: root,
        env: {
          ...process.env,
          NPB_ACCEPTANCE_BASE_URL: `http://127.0.0.1:${address.port}`,
          NPB_ACCEPTANCE_OUTPUT_DIR: multiTurnOutputDirectory,
        },
      })
      const multiTurnExitCode = await new Promise<number | null>((resolve, reject) => {
        multiTurnRun.once('error', reject)
        multiTurnRun.once('exit', resolve)
      })
      expect(multiTurnExitCode).toBe(1)
      expect(requestedMessages).toEqual([
        '昨日の巨人の試合結果を教えて',
        '阪神は今シーズン何勝してますか？',
      ])
      const multiTurnLogFiles = await readdir(multiTurnOutputDirectory)
      const multiTurnLog = JSON.parse(await readFile(
        path.join(multiTurnOutputDirectory, multiTurnLogFiles[0]!),
        'utf8',
      ))
      expect(multiTurnLog).toMatchObject({
        lastExecutedCase: 'MT01-Turn1',
        unexecutedCount: 0,
        resume: { nextCaseId: null, remainingCaseIds: [] },
      })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
