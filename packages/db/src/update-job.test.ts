import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DiscoveryYear } from '@npb/schemas'
import { sqliteDatabaseToQuery } from './query-driver'
import { openDatabase } from './sqlite'
import { listLoadedGameIdsByYear } from './repository/index'
import { parseUpdateYearArgs, runIncrementalUpdate } from './update-job'

const bisIndexFixturePath = path.resolve(
  process.cwd(),
  '..',
  'parser',
  'src',
  '__fixtures__',
  'bis-eng-minimal-game.html',
)

async function loadFixturePages() {
  return {
    'https://example.test/b-l-17/index.html': await readFile(bisIndexFixturePath, 'utf8'),
  }
}

function createDiscoveryFixture(): DiscoveryYear {
  return {
    schemaVersion: 1,
    year: 2025,
    generatedAt: '2026-04-19T00:00:00.000Z',
    games: [
      {
        year: 2025,
        date: '2025-08-15',
        mmdd: '0815',
        gameId: 'r20250815b-l-17',
        gameNumber: 17,
        competition: 'regular',
        listingType: 'scores',
        listingStatus: 'listed',
        startsAt: '18:00',
        venue: 'ZOZOマリンスタジアム',
        homeTeam: {
          code: 'b',
          label: 'ORIX',
        },
        awayTeam: {
          code: 'l',
          label: 'Seibu',
        },
        source: {
          calendarPageUrl: 'https://example.test/calendar',
          dailyPageUrl: 'https://example.test/daily',
        },
        downloader: {
          scoreBaseUrl: 'https://example.test/b-l-17',
          pages: {
            index: 'https://example.test/b-l-17/index.html',
            playByPlay: 'https://example.test/b-l-17/playbyplay.html',
            box: 'https://example.test/b-l-17/box.html',
            roster: 'https://example.test/b-l-17/roster.html',
          },
        },
      },
    ],
  }
}

function createDiscoveryFixtureWithTwoGames(): DiscoveryYear {
  return {
    schemaVersion: 1,
    year: 2025,
    generatedAt: '2026-04-19T00:00:00.000Z',
    games: [
      createDiscoveryFixture().games[0]!,
      {
        year: 2025,
        date: '2025-08-16',
        mmdd: '0816',
        gameId: 'r20250816b-l-18',
        gameNumber: 18,
        competition: 'regular',
        listingType: 'scores',
        listingStatus: 'listed',
        startsAt: '18:00',
        venue: 'ZOZOマリンスタジアム',
        homeTeam: {
          code: 'b',
          label: 'ORIX',
        },
        awayTeam: {
          code: 'l',
          label: 'Seibu',
        },
        source: {
          calendarPageUrl: 'https://example.test/calendar',
          dailyPageUrl: 'https://example.test/daily',
        },
        downloader: {
          scoreBaseUrl: 'https://example.test/b-l-18',
          pages: {
            index: 'https://example.test/b-l-18/index.html',
            playByPlay: 'https://example.test/b-l-18/playbyplay.html',
            box: 'https://example.test/b-l-18/box.html',
            roster: 'https://example.test/b-l-18/roster.html',
          },
        },
      },
    ],
  }
}

function createMockFetch(fixtures: Record<string, string>, seen: string[]) {
  return async (input: string | URL) => {
    const url = String(input)
    seen.push(url)
    const body = fixtures[url]

    if (!body) {
      return new Response('not found', { status: 404 })
    }

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    })
  }
}

describe('update-job', () => {
  it('parses update-year CLI args', () => {
    expect(
      parseUpdateYearArgs([
        '--year=2025',
        '--sqlite-path=./data/npb.sqlite',
        '--workspace-root=/tmp/workspace',
        '--delay-ms=10',
        '--user-agent=test-agent',
      ]),
    ).toEqual({
      year: 2025,
      sqlitePath: './data/npb.sqlite',
      dateFrom: undefined,
      dateTo: undefined,
      workspaceRoot: '/tmp/workspace',
      delayMs: 10,
      userAgent: 'test-agent',
    })
  })

  it('strips leading -- tokens from update-year args (pnpm / shell passthrough)', () => {
    expect(
      parseUpdateYearArgs([
        '--',
        '--',
        '--year',
        '2025',
        '--sqlite-path',
        './data/npb.sqlite',
      ]),
    ).toEqual({
      year: 2025,
      sqlitePath: './data/npb.sqlite',
      dateFrom: undefined,
      dateTo: undefined,
      workspaceRoot: undefined,
      delayMs: undefined,
      userAgent: undefined,
    })
  })

  it('runs incremental update and skips already loaded games on the second run', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'npb-update-job-'))
    const sqliteRelativePath = 'data/npb.sqlite'
    const sqliteAbsolutePath = path.join(workspaceRoot, sqliteRelativePath)
    const fetchCalls: string[] = []
    const logs: string[] = []
    const fixtures = await loadFixturePages()
    const discoveryFixture = createDiscoveryFixture()

    const logger = {
      log: (message?: unknown) => {
        logs.push(String(message))
      },
      warn: (message?: unknown) => {
        logs.push(`WARN ${String(message)}`)
      },
      error: (message?: unknown) => {
        logs.push(`ERROR ${String(message)}`)
      },
    }

    const firstRun = await runIncrementalUpdate(
      {
        year: 2025,
        sqlitePath: sqliteRelativePath,
        workspaceRoot,
        fetchImpl: createMockFetch(fixtures, fetchCalls),
        sleepImpl: async () => {},
        delayMs: 0,
        logger,
      },
      {
        discoverGamesByYearImpl: async () => discoveryFixture,
      },
    )

    expect(firstRun.discoveredGames).toBe(1)
    expect(firstRun.pendingGames).toBe(1)
    expect(firstRun.loadedGames).toBe(1)
    expect(firstRun.games[0]).toMatchObject({
      gameId: 'r20250815b-l-17',
      downloadedPages: 1,
      skippedPages: 0,
    })
    expect(fetchCalls).toEqual(['https://example.test/b-l-17/index.html'])
    expect(
      await readFile(path.join(workspaceRoot, 'data', 'discovery', '2025.json'), 'utf8'),
    ).toContain('"gameId": "r20250815b-l-17"')
    await expect(stat(path.join(workspaceRoot, 'data', 'rich'))).rejects.toMatchObject({
      code: 'ENOENT',
    })

    const database = openDatabase(sqliteAbsolutePath)
    try {
      expect(await listLoadedGameIdsByYear(sqliteDatabaseToQuery(database), 2025)).toEqual([
        'r20250815b-l-17',
      ])
    } finally {
      database.close()
    }

    const secondRun = await runIncrementalUpdate(
      {
        year: 2025,
        sqlitePath: sqliteRelativePath,
        workspaceRoot,
        fetchImpl: createMockFetch(fixtures, fetchCalls),
        sleepImpl: async () => {},
        delayMs: 0,
        logger,
      },
      {
        discoverGamesByYearImpl: async () => discoveryFixture,
      },
    )

    expect(secondRun.pendingGames).toBe(0)
    expect(secondRun.loadedGames).toBe(0)
    expect(secondRun.skippedExistingGames).toBe(1)
    expect(secondRun.failedGames).toBe(0)
    expect(fetchCalls).toEqual(['https://example.test/b-l-17/index.html'])
    expect(
      logs.some((line) =>
        line.includes('[update:done] year=2025 loaded=1 failed=0 skippedExisting=0'),
      ),
    ).toBe(true)
    expect(logs.some((line) => line.includes('pending=0'))).toBe(true)
  })

  it('continues the yearly run when one game fails and records failure details', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'npb-update-job-fail-'))
    const sqliteRelativePath = 'data/npb.sqlite'
    const sqliteAbsolutePath = path.join(workspaceRoot, sqliteRelativePath)
    const logs: string[] = []
    const discoveryFixture = createDiscoveryFixtureWithTwoGames()

    const logger = {
      log: (message?: unknown) => {
        logs.push(String(message))
      },
      warn: (message?: unknown) => {
        logs.push(`WARN ${String(message)}`)
      },
      error: (message?: unknown) => {
        logs.push(`ERROR ${String(message)}`)
      },
    }

    const result = await runIncrementalUpdate(
      {
        year: 2025,
        sqlitePath: sqliteRelativePath,
        workspaceRoot,
        sleepImpl: async () => {},
        delayMs: 0,
        logger,
      },
      {
        discoverGamesByYearImpl: async () => discoveryFixture,
        downloadGamePagesImpl: async ({ game }) => {
          if (game.gameId === 'r20250816b-l-18') {
            throw new Error('Request failed: https://example.test/b-l-18/index.html (404)')
          }

          const directory = path.join(workspaceRoot, 'data', 'raw', '2025', game.mmdd, game.gameId)
          await mkdir(directory, { recursive: true })
          await writeFile(path.join(directory, 'index.html'), await readFile(bisIndexFixturePath, 'utf8'))

          return {
            year: game.year,
            mmdd: game.mmdd,
            gameId: game.gameId,
            directory,
            pages: [
              {
                page: 'index',
                url: 'https://example.test/b-l-17/index.html',
                path: path.join(directory, 'index.html'),
                status: 'downloaded' as const,
              },
            ],
          }
        },
      },
    )

    expect(result.discoveredGames).toBe(2)
    expect(result.pendingGames).toBe(2)
    expect(result.loadedGames).toBe(1)
    expect(result.skippedExistingGames).toBe(0)
    expect(result.failedGames).toBe(1)
    expect(result.failures).toEqual([
      {
        gameId: 'r20250816b-l-18',
        date: '2025-08-16',
        stage: 'download',
        message: 'Request failed: https://example.test/b-l-18/index.html (404)',
      },
    ])

    const database = openDatabase(sqliteAbsolutePath)
    try {
      expect(await listLoadedGameIdsByYear(sqliteDatabaseToQuery(database), 2025)).toEqual([
        'r20250815b-l-17',
      ])
    } finally {
      database.close()
    }

    expect(
      logs.some((line) =>
        line.includes(
          '[update:failed] game_id=r20250816b-l-18 date=2025-08-16 stage=download message=Request failed: https://example.test/b-l-18/index.html (404)',
        ),
      ),
    ).toBe(true)
    expect(
      logs.some((line) =>
        line.includes('[update:done] year=2025 loaded=1 failed=1 skippedExisting=0'),
      ),
    ).toBe(true)
  })
})
