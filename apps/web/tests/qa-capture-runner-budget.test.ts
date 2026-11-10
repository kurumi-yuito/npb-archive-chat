import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../..', import.meta.url))

describe('regression capture admission and provider stop (Q-201)', () => {
  it.each(['budget', 'quota', 'interactive'] as const)('enforces %s admission without unnecessary model calls', async (mode) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'npb-capture-stop-'))
    let requests = 0, header: string | string[] | undefined, generated: { runDir: string } | undefined, outputPath: string | undefined
    const server = createServer((request, response) => {
      request.resume(); requests++; header = request.headers['x-npb-user-id']
      response.writeHead(503, { 'content-type': 'application/json', 'set-cookie': 'private-auth-cookie' })
      response.end(JSON.stringify({ data: { code: 'chat_llm_unavailable', reason: 'upstream_quota_exhausted', retryable: false } }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Mock server did not bind')
      const doc = path.join(directory, 'cases.md')
      await writeFile(doc, mode === 'interactive'
        ? 'Q-200: 候補を画面から選択する\nA: [未実行]\n\nQ-201: 障害処理を確認する\nA: [未実行]\n\n期待契約: 対話操作を質問文としてモデルへ送らない。\n'
        : 'Q-1: 検証用の質問\nA: [未実行]\n\nQ-2: 後続の質問\nA: [未実行]\n\n期待契約: この注記を質問として送らない。\n')
      const env: NodeJS.ProcessEnv = { ...process.env, QA_BASE_URL: `http://127.0.0.1:${address.port}`, QA_DELAY_MS: '0', QA_ALL: '1' }
      delete env.NPB_EVAL_D1_READ_BUDGET; delete env.NPB_EVAL_COST_BASELINE; delete env.QA_DISABLE_HTTP_RETRIES
      if (mode === 'budget') env.NPB_EVAL_D1_READ_BUDGET = '0'
      const child = spawn(process.execPath, [path.join(root, 'scripts/qa-prod-unanswered.mjs'), doc], { cwd: root, env, signal: AbortSignal.timeout(8000) })
      let stdout = ''
      child.stdout.on('data', (chunk) => { stdout += String(chunk) })
      const exit = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
      expect(exit).toBe(1)
      outputPath = path.resolve(root, stdout.trim().split('\n').at(-1)!)
      const text = await readFile(outputPath, 'utf8')
      const report = JSON.parse(text)
      generated = report
      expect(requests).toBe(mode === 'quota' ? 1 : 0)
      expect(header).toBeUndefined()
      expect(report).toMatchObject({ status: mode === 'interactive' ? 'captured_unreviewed' : 'stopped', passCount: 0, releaseReady: false,
        stopReason: mode === 'budget' ? 'd1_read_budget_exhausted' : mode === 'quota' ? 'upstream_quota_exhausted' : null,
        unexecutedCount: mode === 'quota' ? 1 : 2 })
      expect(report.results).toHaveLength(2)
      expect(report.results.at(-1).status).toBe('blocked')
      expect(text).not.toContain('private-auth-cookie')
      expect(await readFile(doc, 'utf8')).toContain('A: [未実行]')
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      if (outputPath) await rm(outputPath, { force: true })
      if (generated) await rm(path.resolve(root, generated.runDir), { recursive: true, force: true })
      await rm(directory, { recursive: true, force: true })
    }
  }, 15_000)
})
