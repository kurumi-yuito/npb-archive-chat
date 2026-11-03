import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('independent contract evaluator governance', () => {
  it.each([200, 503])('does not count HTTP %i alone as a passing answer', async (status) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'npb-contract-eval-'))
    const server = createServer((_request, response) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ answer: { summary: '空ではない回答' }, results: { events: [] } }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('No server port')
      const output = path.join(directory, 'report.json')
      const code = await new Promise<number>((resolve) => {
        execFile(process.execPath, ['scripts/eval-query-contracts.mjs'], {
          cwd: path.resolve(import.meta.dirname, '../../..'),
          env: { ...process.env, NPB_EVAL_BASE_URL: `http://127.0.0.1:${address.port}`, NPB_EVAL_OUTPUT: output },
        }, (error) => resolve(error ? Number(error.code) : 0))
      })
      const report = JSON.parse(await readFile(output, 'utf8'))
      expect(code).toBe(1)
      expect(report.counts.pass).toBe(0)
      expect(report.counts[status === 200 ? 'fail' : 'blocked']).toBe(1)
      expect(report.releaseReady).toBe(false)
      if (status === 200) {
        expect(report.cases[0].stages.meaning.status).toBe('fail')
        expect(report.cases[0].stages.aggregation.status).toBe('not_applicable')
      } else {
        expect(report.cases[0].stages).toEqual({})
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      await rm(directory, { recursive: true, force: true })
    }
  })
})
