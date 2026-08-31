import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ))
})

describe('Acceptance runner fail-fast contract', () => {
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
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
