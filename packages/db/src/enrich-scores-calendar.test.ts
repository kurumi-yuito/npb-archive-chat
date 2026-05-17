import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRawGameFromDir } from '../../parser/src/index'
import { loadRichGame } from './loader'
import { migrateDatabase } from './migrations'
import { openDatabase } from './sqlite'
import { runBackfillScoresCanonical } from './backfill-scores-canonical'
import { parseEnrichScoresCalendarArgs, runScoresCalendarEnrichment } from './enrich-scores-calendar'
import { buildScoresBaseUrl, buildScoresBaseUrlFromCanonicalUrl, buildScoresSlug } from './scores-fetcher'

const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const workspaceRoot = path.resolve(packageRoot, '..', '..')
const parserFixtureRoot = path.resolve(
  workspaceRoot,
  'packages',
  'parser',
  'src',
  '__fixtures__',
  'raw',
  '2025',
  '0815',
  'r20250815b-l-17',
)
const rainCancelledPlayByPlayFixture = path.resolve(
  workspaceRoot,
  'packages',
  'parser',
  'src',
  '__fixtures__',
  'raw',
  '2024',
  '0528',
  'r20240528c-b-02',
  'playbyplay.html',
)

describe('enrich-scores-calendar', () => {
  it('parses cli args', () => {
    expect(
      parseEnrichScoresCalendarArgs([
        '--year=2025',
        '--sqlite-path=./data/npb.sqlite',
        '--limit=2',
        '--league=regular',
        '--workspace-root=/tmp/workspace',
        '--delay-ms=10',
        '--user-agent=test-agent',
        '--progress-every=7',
      ]),
    ).toEqual({
      year: 2025,
      sqlitePath: './data/npb.sqlite',
      limit: 2,
      league: 'regular',
      dateFrom: undefined,
      dateTo: undefined,
      workspaceRoot: '/tmp/workspace',
      delayMs: 10,
      userAgent: 'test-agent',
      progressEvery: 7,
    })
  })

  it('derives scores slug/base url from game_id', () => {
    expect(buildScoresSlug('r20250328g-t-01')).toBe('g-t-01')
    expect(buildScoresSlug('r20250401s-d-03')).toBe('s-d-03')
    expect(buildScoresSlug('f20250314c-t-02')).toBe('fc-t-02')
    expect(buildScoresSlug('f20250315db-s-01')).toBe('fdb-s-01')
    expect(buildScoresSlug('f20250315a-l-02')).toBe('fa-l-02')
    expect(buildScoresSlug('f20250316h-b-01')).toBe('fh-b-01')
    expect(buildScoresSlug('g-t-01')).toBe('g-t-01')
    expect(buildScoresBaseUrl(2024, '0329', 'r20240329g-t-01')).toBe(
      'https://npb.jp/scores/2024/0329/g-t-01/',
    )
    expect(buildScoresBaseUrl(2025, '0314', 'f20250314c-t-02')).toBe(
      'https://npb.jp/scores/2025/0314/fc-t-02/',
    )
    expect(
      buildScoresBaseUrlFromCanonicalUrl('https://npb.jp/scores/2025/0328/c-t-01/index.html'),
    ).toBe('https://npb.jp/scores/2025/0328/c-t-01/')
    expect(
      buildScoresBaseUrlFromCanonicalUrl('https://npb.jp/bis/eng/2025/games/s2025032800479.html'),
    ).toBeNull()
  })

  it('loads structured scores data from games table enumeration and stays idempotent', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'npb-enrich-calendar-'))
    const sqliteRelativePath = 'data/npb.sqlite'
    const sqliteAbsolutePath = path.join(workspaceRoot, sqliteRelativePath)
    const gameId = 'r20250815b-l-17'

    const seeded = await parseRawGameFromDir(parserFixtureRoot)
    const database = openDatabase(sqliteAbsolutePath)
    migrateDatabase(database)
    loadRichGame(database, seeded)
    setCanonicalUrl(database, gameId, 'https://npb.jp/scores/2025/0815/b-l-17/index.html')
    for (const table of [
      'events',
      'batting_lines',
      'pitching_lines',
      'roster_entries',
      'source_snapshots',
    ] as const) {
      database.prepare(`DELETE FROM ${table}`).run()
    }
    database.close()

    const indexHtml = await readFile(path.join(parserFixtureRoot, 'index.html'), 'utf8')
    const playByPlayHtml = await readFile(path.join(parserFixtureRoot, 'playbyplay.html'), 'utf8')
    const boxHtml = await readFile(path.join(parserFixtureRoot, 'box.html'), 'utf8')
    const rosterHtml = await readFile(path.join(parserFixtureRoot, 'roster.html'), 'utf8')

    const fetchImpl = async (input: string | URL) => {
      const url = String(input)
      if (url === 'https://npb.jp/scores/2025/0815/b-l-17/index.html') {
        return new Response(indexHtml, { status: 200 })
      }
      if (url === 'https://npb.jp/scores/2025/0815/b-l-17/playbyplay.html') {
        return new Response(playByPlayHtml, { status: 200 })
      }
      if (url === 'https://npb.jp/scores/2025/0815/b-l-17/box.html') {
        return new Response(boxHtml, { status: 200 })
      }
      if (url === 'https://npb.jp/scores/2025/0815/b-l-17/roster.html') {
        return new Response(rosterHtml, { status: 200 })
      }
      return new Response('not found', { status: 404 })
    }

    const first = await runScoresCalendarEnrichment({
      year: 2025,
      sqlitePath: sqliteRelativePath,
      workspaceRoot,
      fetchImpl,
      sleepImpl: async () => {},
      delayMs: 0,
      progressEvery: 0,
    })

    expect(first.discoveredGames).toBeGreaterThan(0)
    expect(first.loadedGames).toBeGreaterThan(0)
    expect(first.failedGames).toBe(0)

    const dbAfterFirst = openDatabase(sqliteAbsolutePath)
    const firstCounts = {
      events: countTable(dbAfterFirst, 'events', gameId),
      batting: countTable(dbAfterFirst, 'batting_lines', gameId),
      pitching: countTable(dbAfterFirst, 'pitching_lines', gameId),
      roster: countTable(dbAfterFirst, 'roster_entries', gameId),
      sources: countTable(dbAfterFirst, 'source_snapshots', gameId),
    }
    dbAfterFirst.close()

    expect(firstCounts.events).toBeGreaterThan(0)
    expect(firstCounts.batting).toBeGreaterThan(0)
    expect(firstCounts.pitching).toBeGreaterThan(0)
    expect(firstCounts.roster).toBeGreaterThan(0)
    expect(firstCounts.sources).toBeGreaterThan(0)

    const second = await runScoresCalendarEnrichment({
      year: 2025,
      sqlitePath: sqliteRelativePath,
      workspaceRoot,
      fetchImpl,
      sleepImpl: async () => {},
      delayMs: 0,
      progressEvery: 0,
    })

    const dbAfterSecond = openDatabase(sqliteAbsolutePath)
    const secondCounts = {
      events: countTable(dbAfterSecond, 'events', gameId),
      batting: countTable(dbAfterSecond, 'batting_lines', gameId),
      pitching: countTable(dbAfterSecond, 'pitching_lines', gameId),
      roster: countTable(dbAfterSecond, 'roster_entries', gameId),
      sources: countTable(dbAfterSecond, 'source_snapshots', gameId),
    }
    dbAfterSecond.close()

    expect(second.discoveredGames).toBeGreaterThan(0)
    expect(second.loadedGames).toBeGreaterThan(0)
    expect(secondCounts).toEqual(firstCounts)

    const structuredGamePath = path.join(
      workspaceRoot,
      'data',
      'structured',
      '2025',
      '0815',
      gameId,
      'game.json',
    )
    await expect(stat(structuredGamePath)).resolves.toBeTruthy()
  })

  it('respects --limit and only processes the first N games', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'npb-enrich-calendar-limit-'))
    const sqliteRelativePath = 'data/npb.sqlite'
    const sqliteAbsolutePath = path.join(workspaceRoot, sqliteRelativePath)

    const seeded = await parseRawGameFromDir(parserFixtureRoot)
    const database = openDatabase(sqliteAbsolutePath)
    migrateDatabase(database)
    loadRichGame(database, seeded)
    setCanonicalUrl(database, 'r20250815b-l-17', 'https://npb.jp/scores/2025/0815/b-l-17/index.html')
    insertGameClone(database, {
      sourceGameId: 'r20250815b-l-17',
      gameId: 'f20250814c-t-02',
      date: '2025-08-14',
      year: 2025,
      mmdd: '0814',
      canonicalUrl: 'https://npb.jp/bis/eng/2025/games/fs2025081401508.html',
      homeTeamName: '阪神',
      awayTeamName: '広島',
      matchupText: '広島 vs 阪神',
    })
    insertGameClone(database, {
      sourceGameId: 'r20250815b-l-17',
      gameId: 'r20250816c-d-01',
      date: '2025-08-16',
      year: 2025,
      mmdd: '0816',
      canonicalUrl: 'https://npb.jp/scores/2025/0816/c-d-01/index.html',
      homeTeamName: '中日',
      awayTeamName: '広島',
      matchupText: '広島 vs 中日',
    })
    insertGameClone(database, {
      sourceGameId: 'r20250815b-l-17',
      gameId: 'r20250817e-f-01',
      date: '2025-08-17',
      year: 2025,
      mmdd: '0817',
      canonicalUrl: 'https://npb.jp/scores/2025/0817/e-f-01/index.html',
      homeTeamName: '楽天',
      awayTeamName: 'ソフトバンク',
      matchupText: 'ソフトバンク vs 楽天',
    })
    for (const table of [
      'events',
      'batting_lines',
      'pitching_lines',
      'roster_entries',
      'source_snapshots',
    ] as const) {
      database.prepare(`DELETE FROM ${table}`).run()
    }
    database.close()

    const indexHtml = await readFile(path.join(parserFixtureRoot, 'index.html'), 'utf8')
    const playByPlayHtml = await readFile(path.join(parserFixtureRoot, 'playbyplay.html'), 'utf8')
    const boxHtml = await readFile(path.join(parserFixtureRoot, 'box.html'), 'utf8')
    const rosterHtml = await readFile(path.join(parserFixtureRoot, 'roster.html'), 'utf8')
    const requestedUrls: string[] = []

    const fetchImpl = async (input: string | URL) => {
      const url = String(input)
      requestedUrls.push(url)
      if (url.startsWith('https://npb.jp/scores/2025/0815/b-l-17/')) {
        if (url.endsWith('/index.html')) {
          return new Response(indexHtml, { status: 200 })
        }
        if (url.endsWith('/playbyplay.html')) {
          return new Response(playByPlayHtml, { status: 200 })
        }
        if (url.endsWith('/box.html')) {
          return new Response(boxHtml, { status: 200 })
        }
        if (url.endsWith('/roster.html')) {
          return new Response(rosterHtml, { status: 200 })
        }
      }
      if (url.startsWith('https://npb.jp/scores/2025/0816/c-d-01/')) {
        if (url.endsWith('/index.html')) {
          return new Response(indexHtml, { status: 200 })
        }
        if (url.endsWith('/playbyplay.html')) {
          return new Response(playByPlayHtml, { status: 200 })
        }
        if (url.endsWith('/box.html')) {
          return new Response(boxHtml, { status: 200 })
        }
        if (url.endsWith('/roster.html')) {
          return new Response(rosterHtml, { status: 200 })
        }
      }
      return new Response('not found', { status: 404 })
    }

    const result = await runScoresCalendarEnrichment({
      year: 2025,
      sqlitePath: sqliteRelativePath,
      limit: 2,
      league: 'regular',
      workspaceRoot,
      fetchImpl,
      sleepImpl: async () => {},
      delayMs: 0,
      progressEvery: 0,
    })

    expect(result.discoveredGames).toBe(2)
    expect(result.loadedGames).toBe(2)
    expect(result.failedGames).toBe(0)
    expect(requestedUrls.some((url) => url.includes('/0814/fc-t-02/'))).toBe(false)
    expect(requestedUrls.some((url) => url.includes('/0817/e-f-01/'))).toBe(false)

    const dbAfter = openDatabase(sqliteAbsolutePath)
    expect(countTable(dbAfter, 'events', 'f20250814c-t-02')).toBe(0)
    expect(countTable(dbAfter, 'events', 'r20250815b-l-17')).toBeGreaterThan(0)
    expect(countTable(dbAfter, 'events', 'r20250816c-d-01')).toBeGreaterThan(0)
    expect(countTable(dbAfter, 'events', 'r20250817e-f-01')).toBe(0)
    dbAfter.close()
  })

  it('records non-scores canonical games as explicitly skipped', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'npb-enrich-calendar-farm-'))
    const sqliteRelativePath = 'data/npb.sqlite'
    const sqliteAbsolutePath = path.join(workspaceRoot, sqliteRelativePath)

    const seeded = await parseRawGameFromDir(parserFixtureRoot)
    const database = openDatabase(sqliteAbsolutePath)
    migrateDatabase(database)
    loadRichGame(database, seeded)
    insertGameClone(database, {
      sourceGameId: 'r20250815b-l-17',
      gameId: 'f20250814c-t-02',
      date: '2025-08-14',
      year: 2025,
      mmdd: '0814',
      canonicalUrl: 'https://npb.jp/bis/eng/2025/games/fs2025081401508.html',
      homeTeamName: '阪神',
      awayTeamName: '広島',
      matchupText: '広島 vs 阪神',
    })
    database.close()

    const requestedUrls: string[] = []
    const result = await runScoresCalendarEnrichment({
      year: 2025,
      sqlitePath: sqliteRelativePath,
      limit: 1,
      workspaceRoot,
      fetchImpl: async (input: string | URL) => {
        requestedUrls.push(String(input))
        return new Response('not found', { status: 404 })
      },
      sleepImpl: async () => {},
      delayMs: 0,
      progressEvery: 0,
    })

    expect(result.loadedGames).toBe(0)
    expect(result.failedGames).toBe(1)
    expect(result.failures).toEqual([
      {
        date: '2025-08-14',
        gameId: 'f20250814c-t-02',
        stage: 'skip',
        reason: 'scores_canonical_not_available',
      },
    ])
    expect(requestedUrls).toEqual([])
  })

  it('skips duplicate same-card rows when one row already has a scores canonical url', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'npb-enrich-calendar-duplicate-'))
    const sqliteRelativePath = 'data/npb.sqlite'
    const sqliteAbsolutePath = path.join(workspaceRoot, sqliteRelativePath)

    const seeded = await parseRawGameFromDir(parserFixtureRoot)
    const database = openDatabase(sqliteAbsolutePath)
    migrateDatabase(database)
    loadRichGame(database, seeded)
    setCanonicalUrl(database, 'r20250815b-l-17', 'https://npb.jp/scores/2025/0815/b-l-17/index.html')
    insertGameClone(database, {
      sourceGameId: 'r20250815b-l-17',
      gameId: 'r20250815b-l-99',
      date: '2025-08-15',
      year: 2025,
      mmdd: '0815',
      canonicalUrl: 'https://npb.jp/bis/eng/2025/games/s2025081500001.html',
      homeTeamName: 'ORIX',
      awayTeamName: 'Seibu',
      matchupText: 'Seibu vs ORIX',
    })
    for (const table of [
      'events',
      'batting_lines',
      'pitching_lines',
      'roster_entries',
      'source_snapshots',
    ] as const) {
      database.prepare(`DELETE FROM ${table}`).run()
    }
    database.close()

    const indexHtml = await readFile(path.join(parserFixtureRoot, 'index.html'), 'utf8')
    const playByPlayHtml = await readFile(path.join(parserFixtureRoot, 'playbyplay.html'), 'utf8')
    const boxHtml = await readFile(path.join(parserFixtureRoot, 'box.html'), 'utf8')
    const rosterHtml = await readFile(path.join(parserFixtureRoot, 'roster.html'), 'utf8')

    const result = await runScoresCalendarEnrichment({
      year: 2025,
      sqlitePath: sqliteRelativePath,
      limit: 2,
      league: 'regular',
      workspaceRoot,
      fetchImpl: async (input: string | URL) => {
        const url = String(input)
        if (url === 'https://npb.jp/scores/2025/0815/b-l-17/index.html') {
          return new Response(indexHtml, { status: 200 })
        }
        if (url === 'https://npb.jp/scores/2025/0815/b-l-17/playbyplay.html') {
          return new Response(playByPlayHtml, { status: 200 })
        }
        if (url === 'https://npb.jp/scores/2025/0815/b-l-17/box.html') {
          return new Response(boxHtml, { status: 200 })
        }
        if (url === 'https://npb.jp/scores/2025/0815/b-l-17/roster.html') {
          return new Response(rosterHtml, { status: 200 })
        }
        return new Response('', { status: 404 })
      },
      sleepImpl: async () => {},
      delayMs: 0,
      progressEvery: 0,
    })

    expect(result.loadedGames).toBe(1)
    expect(result.failures).toContainEqual({
      date: '2025-08-15',
      gameId: 'r20250815b-l-99',
      stage: 'skip',
      reason: 'duplicate_or_reversed_game',
    })
  })

  it('skips scores games with an explicitly unavailable play by play page', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'npb-enrich-calendar-no-pbp-'))
    const sqliteRelativePath = 'data/npb.sqlite'
    const sqliteAbsolutePath = path.join(workspaceRoot, sqliteRelativePath)

    const seeded = await parseRawGameFromDir(parserFixtureRoot)
    const database = openDatabase(sqliteAbsolutePath)
    migrateDatabase(database)
    loadRichGame(database, seeded)
    insertGameClone(database, {
      sourceGameId: 'r20250815b-l-17',
      gameId: 'r20240528c-b-02',
      date: '2024-05-28',
      year: 2024,
      mmdd: '0528',
      canonicalUrl: 'https://npb.jp/scores/2024/0528/t-f-01/index.html',
      homeTeamName: '阪神',
      awayTeamName: '日本ハム',
      matchupText: '日本ハム vs 阪神',
    })
    database.close()

    const indexHtml = await readFile(path.join(parserFixtureRoot, 'index.html'), 'utf8')
    const boxHtml = await readFile(path.join(parserFixtureRoot, 'box.html'), 'utf8')
    const rosterHtml = await readFile(path.join(parserFixtureRoot, 'roster.html'), 'utf8')
    const playByPlayHtml = await readFile(rainCancelledPlayByPlayFixture, 'utf8')

    const result = await runScoresCalendarEnrichment({
      year: 2024,
      sqlitePath: sqliteRelativePath,
      limit: 1,
      league: 'regular',
      workspaceRoot,
      fetchImpl: async (input: string | URL) => {
        const url = String(input)
        if (url.endsWith('/index.html')) {
          return new Response(indexHtml, { status: 200 })
        }
        if (url.endsWith('/playbyplay.html')) {
          return new Response(playByPlayHtml, { status: 200 })
        }
        if (url.endsWith('/box.html')) {
          return new Response(boxHtml, { status: 200 })
        }
        if (url.endsWith('/roster.html')) {
          return new Response(rosterHtml, { status: 200 })
        }
        return new Response('', { status: 404 })
      },
      sleepImpl: async () => {},
      delayMs: 0,
      progressEvery: 0,
    })

    expect(result.loadedGames).toBe(0)
    expect(result.failures).toContainEqual({
      date: '2024-05-28',
      gameId: 'r20240528c-b-02',
      slug: 't-f-01',
      stage: 'skip',
      reason: 'no_pbp_available:rain_cancelled',
    })
  })

  it('backfills scores canonical url from verified discovery candidate', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'npb-backfill-scores-canonical-'))
    const sqliteRelativePath = 'data/npb.sqlite'
    const sqliteAbsolutePath = path.join(workspaceRoot, sqliteRelativePath)
    const gameId = 'r20250815b-l-17'

    const seeded = await parseRawGameFromDir(parserFixtureRoot)
    const database = openDatabase(sqliteAbsolutePath)
    migrateDatabase(database)
    loadRichGame(database, seeded)
    setCanonicalUrl(database, gameId, 'https://npb.jp/bis/eng/2025/games/s2025081500001.html')
    database.close()

    const discoveryPath = path.join(workspaceRoot, 'data', 'discovery', '2025.json')
    await mkdir(path.dirname(discoveryPath), { recursive: true })
    await writeFile(
      discoveryPath,
      `${JSON.stringify({
        schemaVersion: 1,
        year: 2025,
        games: [
          {
            gameId,
            downloader: {
              scoreBaseUrl: 'https://npb.jp/scores/2025/0815/b-l-17',
            },
          },
        ],
      })}\n`,
      'utf8',
    )

    const result = await runBackfillScoresCanonical({
      year: 2025,
      sqlitePath: sqliteRelativePath,
      league: 'regular',
      workspaceRoot,
      fetchImpl: async (input: string | URL) => {
        if (String(input) === 'https://npb.jp/scores/2025/0815/b-l-17/index.html') {
          return new Response('', { status: 200 })
        }
        return new Response('', { status: 404 })
      },
    })

    expect(result.updatedGames).toBe(1)
    expect(result.failedGames).toBe(0)

    const after = openDatabase(sqliteAbsolutePath)
    expect(
      (
        after.prepare('SELECT canonical_url AS canonicalUrl FROM games WHERE game_id = ?').get(gameId) as {
          canonicalUrl: string
        }
      ).canonicalUrl,
    ).toBe('https://npb.jp/scores/2025/0815/b-l-17/index.html')
    after.close()
  })

  it('backfills one representative row from reachable same-card reversed slug candidates', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'npb-backfill-scores-reversed-'))
    const sqliteRelativePath = 'data/npb.sqlite'
    const sqliteAbsolutePath = path.join(workspaceRoot, sqliteRelativePath)

    const seeded = await parseRawGameFromDir(parserFixtureRoot)
    const database = openDatabase(sqliteAbsolutePath)
    migrateDatabase(database)
    loadRichGame(database, seeded)
    setCanonicalUrl(database, 'r20250815b-l-17', 'https://npb.jp/bis/eng/2025/games/s2025081500001.html')
    insertGameClone(database, {
      sourceGameId: 'r20250815b-l-17',
      gameId: 'r20250815f-m-01',
      date: '2025-08-15',
      year: 2025,
      mmdd: '0815',
      canonicalUrl: 'https://npb.jp/bis/eng/2025/games/s2025081500002.html',
      homeTeamName: 'Lotte',
      awayTeamName: 'Nippon-Ham',
      matchupText: 'Nippon-Ham vs Lotte',
    })
    insertGameClone(database, {
      sourceGameId: 'r20250815b-l-17',
      gameId: 'r20250815m-f-02',
      date: '2025-08-15',
      year: 2025,
      mmdd: '0815',
      canonicalUrl: 'https://npb.jp/bis/eng/2025/games/s2025081500003.html',
      homeTeamName: 'Lotte',
      awayTeamName: 'Nippon-Ham',
      matchupText: 'Nippon-Ham vs Lotte',
    })
    database.close()

    const result = await runBackfillScoresCanonical({
      year: 2025,
      sqlitePath: sqliteRelativePath,
      league: 'regular',
      workspaceRoot,
      fetchImpl: async (input: string | URL) => {
        return new Response('', {
          status: String(input) === 'https://npb.jp/scores/2025/0815/m-f-01/index.html' ? 200 : 404,
        })
      },
    })

    expect(result.updatedGames).toBe(1)
    expect(result.failures).toContainEqual({
      gameId: 'r20250815f-m-01',
      reason: 'duplicate_or_reversed_game',
      candidates: expect.arrayContaining(['https://npb.jp/scores/2025/0815/m-f-01/index.html']),
    })

    const after = openDatabase(sqliteAbsolutePath)
    expect(
      (
        after.prepare('SELECT canonical_url AS canonicalUrl FROM games WHERE game_id = ?').get('r20250815m-f-02') as {
          canonicalUrl: string
        }
      ).canonicalUrl,
    ).toBe('https://npb.jp/scores/2025/0815/m-f-01/index.html')
    expect(
      (
        after.prepare('SELECT canonical_url AS canonicalUrl FROM games WHERE game_id = ?').get('r20250815f-m-01') as {
          canonicalUrl: string
        }
      ).canonicalUrl,
    ).toBe('https://npb.jp/bis/eng/2025/games/s2025081500002.html')
    after.close()
  })

  it.each([
    { year: 2024, mmdd: '0815', date: '2024-08-15', gameId: 'r20240815b-l-01', insertClone: true },
    { year: 2025, mmdd: '0815', date: '2025-08-15', gameId: 'r20250815b-l-01', insertClone: true },
  ])(
    'backfills reachable high-number same-card slug candidates for $year without year-specific rules',
    async ({ year, mmdd, date, gameId }) => {
      const workspaceRoot = await mkdtemp(path.join(tmpdir(), `npb-backfill-scores-${year}-high-number-`))
      const sqliteRelativePath = 'data/npb.sqlite'
      const sqliteAbsolutePath = path.join(workspaceRoot, sqliteRelativePath)
      const expectedUrl = `https://npb.jp/scores/${year}/${mmdd}/b-l-17/index.html`

      const seeded = await parseRawGameFromDir(parserFixtureRoot)
      const database = openDatabase(sqliteAbsolutePath)
      migrateDatabase(database)
      loadRichGame(database, seeded)
      insertGameClone(database, {
        sourceGameId: 'r20250815b-l-17',
        gameId,
        date,
        year,
        mmdd,
        canonicalUrl: `https://npb.jp/bis/eng/${year}/games/s${year}${mmdd}000001.html`,
        homeTeamName: 'ORIX',
        awayTeamName: 'Seibu',
        matchupText: 'Seibu vs ORIX',
      })
      database.prepare('DELETE FROM games WHERE game_id = ?').run('r20250815b-l-17')
      database.close()

      const result = await runBackfillScoresCanonical({
        year,
        sqlitePath: sqliteRelativePath,
        league: 'regular',
        workspaceRoot,
        fetchImpl: async (input: string | URL) => {
          return new Response('', {
            status: String(input) === expectedUrl ? 200 : 404,
          })
        },
      })

      expect(result.updatedGames).toBe(1)
      expect(result.failedGames).toBe(0)

      const after = openDatabase(sqliteAbsolutePath)
      expect(
        (
          after.prepare('SELECT canonical_url AS canonicalUrl FROM games WHERE game_id = ?').get(gameId) as {
            canonicalUrl: string
          }
        ).canonicalUrl,
      ).toBe(expectedUrl)
      after.close()
    },
  )

  it('backfills historical ORIX scores slug aliases across 01..30 candidates', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'npb-backfill-scores-orix-alias-'))
    const sqliteRelativePath = 'data/npb.sqlite'
    const sqliteAbsolutePath = path.join(workspaceRoot, sqliteRelativePath)
    const gameId = 'r20180524e-b-12'
    const expectedUrl = 'https://npb.jp/scores/2018/0524/e-bs-12/index.html'
    const requestedUrls: string[] = []

    const seeded = await parseRawGameFromDir(parserFixtureRoot)
    const database = openDatabase(sqliteAbsolutePath)
    migrateDatabase(database)
    loadRichGame(database, seeded)
    insertGameClone(database, {
      sourceGameId: 'r20250815b-l-17',
      gameId,
      date: '2018-05-24',
      year: 2018,
      mmdd: '0524',
      canonicalUrl: 'https://npb.jp/bis/eng/2018/games/s2018052400611.html',
      homeTeamName: 'Rakuten',
      awayTeamName: 'ORIX',
      matchupText: 'ORIX vs Rakuten',
    })
    database.prepare('UPDATE games SET game_number = 12 WHERE game_id = ?').run(gameId)
    database.prepare('DELETE FROM games WHERE game_id = ?').run('r20250815b-l-17')
    database.close()

    const result = await runBackfillScoresCanonical({
      year: 2018,
      sqlitePath: sqliteRelativePath,
      league: 'regular',
      workspaceRoot,
      fetchImpl: async (input: string | URL) => {
        requestedUrls.push(String(input))
        return new Response('', {
          status: String(input) === expectedUrl ? 200 : 404,
        })
      },
    })

    expect(result.updatedGames).toBe(1)
    expect(result.failedGames).toBe(0)
    expect(requestedUrls).toEqual(expect.arrayContaining([
      'https://npb.jp/scores/2018/0524/b-e-30/index.html',
      'https://npb.jp/scores/2018/0524/e-b-30/index.html',
      expectedUrl,
    ]))

    const after = openDatabase(sqliteAbsolutePath)
    expect(
      (
        after.prepare('SELECT canonical_url AS canonicalUrl FROM games WHERE game_id = ?').get(gameId) as {
          canonicalUrl: string
        }
      ).canonicalUrl,
    ).toBe(expectedUrl)
    after.close()
  })

  it('backfills scores canonical url from raw scores calendar page', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'npb-backfill-scores-calendar-'))
    const sqliteRelativePath = 'data/npb.sqlite'
    const sqliteAbsolutePath = path.join(workspaceRoot, sqliteRelativePath)
    const gameId = 'r20250815b-l-99'

    const seeded = await parseRawGameFromDir(parserFixtureRoot)
    const database = openDatabase(sqliteAbsolutePath)
    migrateDatabase(database)
    loadRichGame(database, seeded)
    insertGameClone(database, {
      sourceGameId: 'r20250815b-l-17',
      gameId,
      date: '2025-08-15',
      year: 2025,
      mmdd: '0815',
      canonicalUrl: 'https://npb.jp/bis/eng/2025/games/s2025081500001.html',
      homeTeamName: 'ORIX',
      awayTeamName: 'Seibu',
      matchupText: 'Seibu vs ORIX',
    })
    database.close()

    const calendarPath = path.join(workspaceRoot, 'data', 'raw-scores-calendar', '2025', '0815', 'index.html')
    await mkdir(path.dirname(calendarPath), { recursive: true })
    await writeFile(
      calendarPath,
      '<html><body><div class="score_box"><a href="/scores/2025/0815/b-l-17/">ORIX vs Seibu</a></div></body></html>',
      'utf8',
    )

    const result = await runBackfillScoresCanonical({
      year: 2025,
      sqlitePath: sqliteRelativePath,
      source: 'calendar-raw',
      league: 'regular',
      workspaceRoot,
    })

    expect(result.updatedGames).toBeGreaterThanOrEqual(1)
    expect(result.calendarPages?.loaded).toBeGreaterThan(0)

    const after = openDatabase(sqliteAbsolutePath)
    expect(
      (
        after.prepare('SELECT canonical_url AS canonicalUrl FROM games WHERE game_id = ?').get(gameId) as {
          canonicalUrl: string
        }
      ).canonicalUrl,
    ).toBe('https://npb.jp/scores/2025/0815/b-l-17/index.html')
    after.close()
  })
})

function countTable(database: ReturnType<typeof openDatabase>, table: string, gameId: string): number {
  return Number(
    (
      database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE game_id = ?`).get(gameId) as {
        count: number
      }
    ).count,
  )
}

function insertGameClone(
  database: ReturnType<typeof openDatabase>,
  input: {
    sourceGameId: string
    gameId: string
    date: string
    year: number
    mmdd: string
    canonicalUrl: string
    homeTeamName: string
    awayTeamName: string
    matchupText: string
  },
): void {
  database
    .prepare(
      `INSERT INTO games (
        schema_version,
        year,
        mmdd,
        game_id,
        canonical_url,
        date,
        date_label,
        venue,
        competition,
        matchup_text,
        game_number,
        status,
        start_time,
        end_time,
        duration_text,
        attendance,
        away_team_name,
        away_team_short_name,
        home_team_name,
        home_team_short_name,
        linescore_json,
        result_pitchers_json,
        batteries_json,
        home_runs_json,
        latest_order_json,
        fetched_at,
        loaded_at
      )
      SELECT
        schema_version,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        venue,
        competition,
        ?,
        game_number,
        status,
        start_time,
        end_time,
        duration_text,
        attendance,
        ?,
        away_team_short_name,
        ?,
        home_team_short_name,
        linescore_json,
        result_pitchers_json,
        batteries_json,
        home_runs_json,
        latest_order_json,
        fetched_at,
        loaded_at
      FROM games
      WHERE game_id = ?`,
    )
    .run(
      input.year,
      input.mmdd,
      input.gameId,
      input.canonicalUrl,
      input.date,
      input.date,
      input.matchupText,
      input.awayTeamName,
      input.homeTeamName,
      input.sourceGameId,
    )
}

function setCanonicalUrl(
  database: ReturnType<typeof openDatabase>,
  gameId: string,
  canonicalUrl: string,
): void {
  database.prepare('UPDATE games SET canonical_url = ? WHERE game_id = ?').run(canonicalUrl, gameId)
}
