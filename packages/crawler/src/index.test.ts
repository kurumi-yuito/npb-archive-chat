import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  createDownloadLogger,
  crawlerPackage,
  discoverGamesByYear,
  downloadDiscoveredGames,
  findWorkspaceRoot,
  parseCalendarPage,
  parseDailyPage,
  parseDiscoverArgs,
  parseDownloadArgs,
} from './index.js'

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixturePath = (name: string) =>
  resolve(packageRoot, 'src', '__fixtures__', name)

async function loadFixture(name: string): Promise<string> {
  return readFile(fixturePath(name), 'utf8')
}

function createMockFetch(fixtures: Record<string, string>) {
  return async (input: string | URL) => {
    const url = String(input)
    const body = fixtures[url]

    if (!body) {
      return new Response('not found', {
        status: 404,
      })
    }

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    })
  }
}

async function writeDiscoveryFile(
  workspaceRoot: string,
  payload: {
    schemaVersion: 1
    year: number
    generatedAt: string
    games: Array<Record<string, unknown>>
  },
) {
  const path = join(workspaceRoot, 'data', 'discovery', `${payload.year}.json`)
  await mkdir(join(workspaceRoot, 'data', 'discovery'), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function installDiscoveryFixture(
  workspaceRoot: string,
  fixtureName: string,
  year: number,
) {
  const path = join(workspaceRoot, 'data', 'discovery', `${year}.json`)
  await mkdir(join(workspaceRoot, 'data', 'discovery'), { recursive: true })
  await writeFile(path, await loadFixture(fixtureName), 'utf8')
}

describe('@npb/crawler', () => {
  it('exports package marker', () => {
    expect(crawlerPackage()).toBe('@npb/crawler')
  })

  it('parses calendar pages into daily page URLs', async () => {
    const html = await loadFixture('calendar-regular-root.html')
    const parsed = parseCalendarPage(html, {
      year: 2026,
      competition: 'regular',
      calendarPageUrl: 'https://npb.jp/bis/eng/2026/calendar/',
    })

    expect(parsed.nextCalendarPageUrls).toEqual([
      'https://npb.jp/bis/eng/2026/calendar/index_05.html',
    ])
    expect(parsed.dailyPages).toEqual([
      {
        url: 'https://npb.jp/bis/eng/2026/games/gm20260327.html',
        date: '2026-03-27',
        competition: 'regular',
        calendarPageUrl: 'https://npb.jp/bis/eng/2026/calendar/',
      },
      {
        url: 'https://npb.jp/bis/eng/2026/games/gm20260415.html',
        date: '2026-04-15',
        competition: 'regular',
        calendarPageUrl: 'https://npb.jp/bis/eng/2026/calendar/',
      },
    ])
  })

  it('parses farm calendar with fs-style daily URLs', async () => {
    const html = await loadFixture('calendar-2025-farm-fs-link.html')
    const parsed = parseCalendarPage(html, {
      year: 2025,
      competition: 'farm',
      calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/index_farm_10.html',
    })

    expect(parsed.dailyPages).toEqual([
      {
        url: 'https://npb.jp/bis/eng/2025/games/fs2025100401984.html',
        date: '2025-10-04',
        competition: 'farm',
        calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/index_farm_10.html',
      },
      {
        url: 'https://npb.jp/bis/eng/2025/games/fgm20250501.html',
        date: '2025-05-01',
        competition: 'farm',
        calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/index_farm_10.html',
      },
    ])
  })

  it('parses calendar pages with s-style daily URLs (bis 2025+ layout)', async () => {
    const html = await loadFixture('calendar-2025-mixed-daily-links.html')
    const parsed = parseCalendarPage(html, {
      year: 2025,
      competition: 'regular',
      calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/index_04.html',
    })

    expect(parsed.dailyPages).toEqual([
      {
        url: 'https://npb.jp/bis/eng/2025/games/s2025032800105.html',
        date: '2025-03-28',
        competition: 'regular',
        calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/index_04.html',
      },
      {
        url: 'https://npb.jp/bis/eng/2025/games/gm20250329.html',
        date: '2025-03-29',
        competition: 'regular',
        calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/index_04.html',
      },
    ])
  })

  it('parses score and schedule daily pages', async () => {
    const scoreHtml = await loadFixture('daily-regular-scores-postponed.html')
    const scheduleHtml = await loadFixture('daily-farm-schedules.html')

    expect(
      parseDailyPage(scoreHtml, {
        url: 'https://npb.jp/bis/eng/2026/games/gm20260415.html',
        date: '2026-04-15',
        competition: 'regular',
        calendarPageUrl: 'https://npb.jp/bis/eng/2026/calendar/',
      }),
    ).toEqual([
      {
        competition: 'regular',
        listingType: 'scores',
        listingStatus: 'listed',
        date: '2026-04-15',
        homeLabel: 'Chunichi',
        awayLabel: 'Hiroshima',
        venue: 'Vantelin Dome',
        startsAt: null,
        gameNumber: 5,
        order: 0,
        bisGamePageUrl: 'https://npb.jp/bis/eng/2026/games/s2026041501160.html',
        source: {
          calendarPageUrl: 'https://npb.jp/bis/eng/2026/calendar/',
          dailyPageUrl: 'https://npb.jp/bis/eng/2026/games/gm20260415.html',
        },
      },
      {
        competition: 'regular',
        listingType: 'scores',
        listingStatus: 'postponed',
        date: '2026-04-15',
        homeLabel: 'Hanshin',
        awayLabel: 'Yomiuri',
        venue: 'Koshien',
        startsAt: null,
        gameNumber: null,
        order: 1,
        bisGamePageUrl: 'https://npb.jp/bis/eng/2026/games/s2026041501161.html',
        source: {
          calendarPageUrl: 'https://npb.jp/bis/eng/2026/calendar/',
          dailyPageUrl: 'https://npb.jp/bis/eng/2026/games/gm20260415.html',
        },
      },
    ])

    expect(
      parseDailyPage(scheduleHtml, {
        url: 'https://npb.jp/bis/eng/2026/games/fgm20260501.html',
        date: '2026-05-01',
        competition: 'farm',
        calendarPageUrl:
          'https://npb.jp/bis/eng/2026/calendar/index_farm_05.html',
      }),
    ).toEqual([
      {
        competition: 'farm',
        listingType: 'schedules',
        listingStatus: 'scheduled',
        date: '2026-05-01',
        homeLabel: 'Yomiuri',
        awayLabel: 'Hiroshima',
        venue: 'GIANTS TOWN',
        startsAt: '14:00',
        gameNumber: null,
        order: 0,
        bisGamePageUrl: null,
        source: {
          calendarPageUrl:
            'https://npb.jp/bis/eng/2026/calendar/index_farm_05.html',
          dailyPageUrl: 'https://npb.jp/bis/eng/2026/games/fgm20260501.html',
        },
      },
      {
        competition: 'farm',
        listingType: 'schedules',
        listingStatus: 'scheduled',
        date: '2026-05-01',
        homeLabel: 'HAYATE',
        awayLabel: 'Nippon-Ham',
        venue: 'Ashitaka',
        startsAt: '13:00',
        gameNumber: null,
        order: 1,
        bisGamePageUrl: null,
        source: {
          calendarPageUrl:
            'https://npb.jp/bis/eng/2026/calendar/index_farm_05.html',
          dailyPageUrl: 'https://npb.jp/bis/eng/2026/games/fgm20260501.html',
        },
      },
    ])
  })

  it('parses 2025 bis daily gm page: table rows without legacy anchor score line', async () => {
    const html = await loadFixture('daily-2025-gm-table-scores.html')
    const games = parseDailyPage(html, {
      url: 'https://npb.jp/bis/eng/2025/games/gm20250328.html',
      date: '2025-03-28',
      competition: 'regular',
      calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/index_04.html',
    })

    expect(games).toEqual([
      {
        competition: 'regular',
        listingType: 'scores',
        listingStatus: 'listed',
        date: '2025-03-28',
        homeLabel: 'Yomiuri',
        awayLabel: 'Yakult',
        venue: 'Tokyo Dome',
        startsAt: null,
        gameNumber: 1,
        order: 0,
        bisGamePageUrl: 'https://npb.jp/bis/eng/2025/games/s2025032800105.html',
        source: {
          calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/index_04.html',
          dailyPageUrl: 'https://npb.jp/bis/eng/2025/games/gm20250328.html',
        },
      },
    ])
  })

  it('parses 2025 bis single-game s page: team/score pairs without hyphen row', async () => {
    const html = await loadFixture('daily-2025-s-single-table-scores.html')
    const games = parseDailyPage(html, {
      url: 'https://npb.jp/bis/eng/2025/games/s2025032800105.html',
      date: '2025-03-28',
      competition: 'regular',
      calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/index_04.html',
    })

    expect(games).toEqual([
      {
        competition: 'regular',
        listingType: 'scores',
        listingStatus: 'listed',
        date: '2025-03-28',
        homeLabel: 'Yomiuri',
        awayLabel: 'Yakult',
        venue: 'Tokyo Dome',
        startsAt: null,
        gameNumber: null,
        order: 0,
        bisGamePageUrl: 'https://npb.jp/bis/eng/2025/games/s2025032800105.html',
        source: {
          calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/index_04.html',
          dailyPageUrl: 'https://npb.jp/bis/eng/2025/games/s2025032800105.html',
        },
      },
    ])
  })

  it('discovers yearly games and infers score game IDs', async () => {
    const fixtures: Record<string, string> = {
      'https://npb.jp/bis/eng/2026/calendar/': await loadFixture(
        'calendar-regular-root.html',
      ),
      'https://npb.jp/bis/eng/2026/calendar/index_05.html': await loadFixture(
        'calendar-regular-may.html',
      ),
      'https://npb.jp/bis/eng/2026/calendar/index_farm.html': await loadFixture(
        'calendar-farm-root.html',
      ),
      'https://npb.jp/bis/eng/2026/calendar/index_farm_05.html':
        await loadFixture('calendar-farm-may.html'),
      'https://npb.jp/bis/eng/2026/games/gm20260327.html': await loadFixture(
        'daily-regular-scores.html',
      ),
      'https://npb.jp/bis/eng/2026/games/gm20260415.html': await loadFixture(
        'daily-regular-scores-postponed.html',
      ),
      'https://npb.jp/bis/eng/2026/games/gm20260501.html': await loadFixture(
        'daily-regular-schedules.html',
      ),
      'https://npb.jp/bis/eng/2026/games/fgm20260327.html': await loadFixture(
        'daily-farm-scores.html',
      ),
      'https://npb.jp/bis/eng/2026/games/fgm20260501.html': await loadFixture(
        'daily-farm-schedules.html',
      ),
    }

    const discovery = await discoverGamesByYear({
      year: 2026,
      fetchImpl: createMockFetch(fixtures),
      generatedAt: new Date('2026-04-18T01:23:45.000Z'),
    })

    expect(discovery.year).toBe(2026)
    expect(discovery.games.map((game) => game.gameId)).toEqual([
      'r20260327g-t-01',
      'r20260327c-d-01',
      'f20260327m-a-01',
      'f20260327t-c-03',
      'r20260415d-c-05',
      'r20260415t-g-01',
      'r20260501s-g-01',
      'r20260501b-e-01',
      'f20260501g-c-01',
      'f20260501v-f-01',
    ])
    expect(discovery.games[0]?.downloader.bisGamePageUrl).toBe(
      'https://npb.jp/bis/eng/2026/games/s2026032701085.html',
    )
    expect(discovery.games[0]?.downloader.pages.index).toBe(
      'https://npb.jp/bis/eng/2026/games/s2026032701085.html',
    )
    expect(discovery.games[5]?.listingStatus).toBe('postponed')
    expect(discovery.games[5]?.downloader.scoreBaseUrl).toBe(
      'https://npb.jp/scores/2026/0415/t-g-01',
    )
    expect(discovery.games[8]?.startsAt).toBe('14:00')
  })

  it('resolves relative daily game hrefs under /games/ when parsing calendar pages', () => {
    const html = `
      <html>
        <body>
          <a href="gm20250328.html">regular</a>
          <a href="s2025032800105.html">regular schedule</a>
          <a href="fgm20250328.html">farm</a>
          <a href="fs2025032800105.html">farm schedule</a>
        </body>
      </html>
    `

    expect(
      parseCalendarPage(html, {
        year: 2025,
        competition: 'regular',
        calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/',
      }).dailyPages,
    ).toEqual([
      {
        url: 'https://npb.jp/bis/eng/2025/games/gm20250328.html',
        date: '2025-03-28',
        competition: 'regular',
        calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/',
      },
      {
        url: 'https://npb.jp/bis/eng/2025/games/s2025032800105.html',
        date: '2025-03-28',
        competition: 'regular',
        calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/',
      },
    ])

    expect(
      parseCalendarPage(html, {
        year: 2025,
        competition: 'farm',
        calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/index_farm.html',
      }).dailyPages,
    ).toEqual([
      {
        url: 'https://npb.jp/bis/eng/2025/games/fgm20250328.html',
        date: '2025-03-28',
        competition: 'farm',
        calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/index_farm.html',
      },
      {
        url: 'https://npb.jp/bis/eng/2025/games/fs2025032800105.html',
        date: '2025-03-28',
        competition: 'farm',
        calendarPageUrl: 'https://npb.jp/bis/eng/2025/calendar/index_farm.html',
      },
    ])
  })

  it('parses CLI args', () => {
    expect(parseDiscoverArgs(['--year', '2026'])).toEqual({ year: 2026 })
    expect(parseDiscoverArgs(['--year=2026'])).toEqual({ year: 2026 })
    expect(parseDownloadArgs(['--year', '2026'])).toEqual({
      year: 2026,
      gameId: null,
      delayMs: 1000,
      userAgent: 'npb-archive-chat/0.0.0 (+https://github.com/)',
    })
    expect(
      parseDownloadArgs([
        '--year=2026',
        '--game-id=g-t-01',
        '--delay-ms=25',
        '--user-agent=test-agent',
      ]),
    ).toEqual({
      year: 2026,
      gameId: 'g-t-01',
      delayMs: 25,
      userAgent: 'test-agent',
    })
  })

  it('can write discovery JSON to disk', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'npb-crawler-test-'))
    const discovery = await discoverGamesByYear({
      year: 2026,
      fetchImpl: createMockFetch({
        'https://npb.jp/bis/eng/2026/calendar/': await loadFixture(
          'calendar-regular-root.html',
        ),
        'https://npb.jp/bis/eng/2026/calendar/index_05.html':
          await loadFixture('calendar-regular-may.html'),
        'https://npb.jp/bis/eng/2026/calendar/index_farm.html':
          await loadFixture('calendar-farm-root.html'),
        'https://npb.jp/bis/eng/2026/calendar/index_farm_05.html':
          await loadFixture('calendar-farm-may.html'),
        'https://npb.jp/bis/eng/2026/games/gm20260327.html': await loadFixture(
          'daily-regular-scores.html',
        ),
        'https://npb.jp/bis/eng/2026/games/gm20260415.html': await loadFixture(
          'daily-regular-scores-postponed.html',
        ),
        'https://npb.jp/bis/eng/2026/games/gm20260501.html': await loadFixture(
          'daily-regular-schedules.html',
        ),
        'https://npb.jp/bis/eng/2026/games/fgm20260327.html':
          await loadFixture('daily-farm-scores.html'),
        'https://npb.jp/bis/eng/2026/games/fgm20260501.html':
          await loadFixture('daily-farm-schedules.html'),
      }),
      generatedAt: new Date('2026-04-18T01:23:45.000Z'),
    })

    const outputPath = join(tempDir, '2026.json')
    await writeFile(outputPath, `${JSON.stringify(discovery, null, 2)}\n`, 'utf8')

    const written = await readFile(outputPath, 'utf8')
    expect(JSON.parse(written)).toMatchObject({
      schemaVersion: 1,
      year: 2026,
    })
  })

  it('downloads fixture game 2026-03-27 r20260327g-t-01 and skips already saved files', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'npb-crawler-download-'))
    await writeFile(join(tempDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await installDiscoveryFixture(tempDir, 'discovery-2026-g-t-01.json', 2026)

    const fetchUrls: string[] = []
    const sleepCalls: number[] = []
    const fixtures = {
      'https://example.test/g-t-01/index.html': await loadFixture('bis-download-index.html'),
    }

    const firstRun = await downloadDiscoveredGames({
      year: 2026,
      gameId: 'r20260327g-t-01',
      workspaceRoot: tempDir,
      delayMs: 5,
      userAgent: 'test-agent',
      sleepImpl: async (ms) => {
        sleepCalls.push(ms)
      },
      fetchImpl: async (input, init) => {
        const url = String(input)
        fetchUrls.push(url)
        expect(init?.headers).toEqual({
          'user-agent': 'test-agent',
        })
        return new Response(fixtures[url as keyof typeof fixtures], { status: 200 })
      },
      logger: {
        log: () => {},
        warn: () => {},
        error: () => {},
      },
    })

    expect(firstRun.games).toHaveLength(1)
    expect(firstRun.games[0]?.pages.map((page) => page.status)).toEqual(['downloaded'])
    expect(fetchUrls).toEqual(['https://example.test/g-t-01/index.html'])
    expect(sleepCalls).toEqual([5])
    const savedIndex = await readFile(
      join(tempDir, 'data', 'raw', '2026', '0327', 'r20260327g-t-01', 'index.html'),
      'utf8',
    )
    expect(savedIndex).toContain('page_bis')
    expect(savedIndex).toContain('id="gmdivmain"')
    expect(savedIndex).toContain('/bis/eng/')

    const secondRun = await downloadDiscoveredGames({
      year: 2026,
      gameId: 'r20260327g-t-01',
      workspaceRoot: tempDir,
      fetchImpl: async () => {
        throw new Error('should not fetch existing files')
      },
      sleepImpl: async () => {},
      logger: {
        log: () => {},
        warn: () => {},
        error: () => {},
      },
    })

    expect(secondRun.games[0]?.pages.map((page) => page.status)).toEqual(['skipped'])
    expect(await findWorkspaceRoot(join(tempDir, 'data', 'raw'))).toBe(tempDir)
  })

  it('downloads every game in a discovery year', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'npb-crawler-download-year-'))
    await writeFile(join(tempDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await writeDiscoveryFile(tempDir, {
      schemaVersion: 1,
      year: 2026,
      generatedAt: '2026-04-18T01:23:45.000Z',
      games: [
        {
          year: 2026,
          date: '2026-03-27',
          mmdd: '0327',
          gameId: 'r20260327g-t-01',
          gameNumber: 1,
          competition: 'regular',
          listingType: 'scores',
          listingStatus: 'listed',
          startsAt: null,
          venue: 'Tokyo Dome',
          homeTeam: { code: 'g', label: 'Yomiuri' },
          awayTeam: { code: 't', label: 'Hanshin' },
          source: {
            calendarPageUrl: 'https://npb.jp/bis/eng/2026/calendar/',
            dailyPageUrl: 'https://npb.jp/bis/eng/2026/games/gm20260327.html',
          },
          downloader: {
            scoreBaseUrl: 'https://npb.jp/scores/2026/0327/g-t-01',
            pages: {
              index: 'https://example.test/g-t-01/index.html',
              playByPlay: 'https://example.test/g-t-01/playbyplay.html',
              box: 'https://example.test/g-t-01/box.html',
              roster: 'https://example.test/g-t-01/roster.html',
            },
          },
        },
        {
          year: 2026,
          date: '2026-03-27',
          mmdd: '0327',
          gameId: 'r20260327c-d-01',
          gameNumber: 1,
          competition: 'regular',
          listingType: 'scores',
          listingStatus: 'listed',
          startsAt: null,
          venue: 'Mazda Stadium',
          homeTeam: { code: 'c', label: 'Hiroshima' },
          awayTeam: { code: 'd', label: 'Chunichi' },
          source: {
            calendarPageUrl: 'https://npb.jp/bis/eng/2026/calendar/',
            dailyPageUrl: 'https://npb.jp/bis/eng/2026/games/gm20260327.html',
          },
          downloader: {
            scoreBaseUrl: 'https://npb.jp/scores/2026/0327/c-d-01',
            pages: {
              index: 'https://example.test/c-d-01/index.html',
              playByPlay: 'https://example.test/c-d-01/playbyplay.html',
              box: 'https://example.test/c-d-01/box.html',
              roster: 'https://example.test/c-d-01/roster.html',
            },
          },
        },
      ],
    })

    const fixtures: Record<string, string> = {}
    for (const gameId of ['g-t-01', 'c-d-01'] as const) {
      fixtures[`https://example.test/${gameId}/index.html`] =
        await loadFixture('bis-download-index.html')
    }

    const result = await downloadDiscoveredGames({
      year: 2026,
      workspaceRoot: tempDir,
      delayMs: 0,
      fetchImpl: createMockFetch(fixtures),
      sleepImpl: async () => {},
      logger: {
        log: () => {},
        warn: () => {},
        error: () => {},
      },
    })

    expect(result.games).toHaveLength(2)
    expect(result.games.every((g) => g.pages.length === 1 && g.pages[0]?.page === 'index')).toBe(
      true,
    )
    const secondIndex = await readFile(
      join(tempDir, 'data', 'raw', '2026', '0327', 'r20260327c-d-01', 'index.html'),
      'utf8',
    )
    expect(secondIndex).toContain('page_bis')
    expect(secondIndex).toContain('gmdivmain')
  })

  it('downloads only the bis index url (no scores playbyplay/box/roster)', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'npb-crawler-bis-index-only-'))
    await writeFile(join(tempDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await writeDiscoveryFile(tempDir, {
      schemaVersion: 1,
      year: 2026,
      generatedAt: '2026-04-18T01:23:45.000Z',
      games: [
        {
          year: 2026,
          date: '2026-03-27',
          mmdd: '0327',
          gameId: 'r20260327g-t-01',
          gameNumber: 1,
          competition: 'regular',
          listingType: 'scores',
          listingStatus: 'listed',
          startsAt: null,
          venue: 'Tokyo Dome',
          homeTeam: { code: 'g', label: 'Yomiuri' },
          awayTeam: { code: 't', label: 'Hanshin' },
          source: {
            calendarPageUrl: 'https://npb.jp/bis/eng/2026/calendar/',
            dailyPageUrl: 'https://npb.jp/bis/eng/2026/games/gm20260327.html',
          },
          downloader: {
            scoreBaseUrl: 'https://npb.jp/scores/2026/0327/g-t-01',
            pages: {
              index: 'https://npb.jp/bis/eng/2026/games/s2026032701085.html',
              playByPlay: 'https://npb.jp/scores/2026/0327/g-t-01/playbyplay.html',
              box: 'https://npb.jp/scores/2026/0327/g-t-01/box.html',
              roster: 'https://npb.jp/scores/2026/0327/g-t-01/roster.html',
            },
          },
        },
      ],
    })

    const bisBody = '<html><body class="page_bis"><div id="gmdivmain">ok</div></body></html>'
    const fetchUrls: string[] = []

    await downloadDiscoveredGames({
      year: 2026,
      gameId: 'r20260327g-t-01',
      workspaceRoot: tempDir,
      delayMs: 0,
      fetchImpl: async (input) => {
        const url = String(input)
        fetchUrls.push(url)
        return new Response(bisBody, { status: 200 })
      },
      sleepImpl: async () => {},
      logger: {
        log: () => {},
        warn: () => {},
        error: () => {},
      },
    })

    expect(fetchUrls).toEqual(['https://npb.jp/bis/eng/2026/games/s2026032701085.html'])
    expect(
      await readFile(
        join(tempDir, 'data', 'raw', '2026', '0327', 'r20260327g-t-01', 'index.html'),
        'utf8',
      ),
    ).toContain('gmdivmain')
  })

  it('writes download logs to data/logs/download.log', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'npb-crawler-logs-'))
    const logPath = join(tempDir, 'data', 'logs', 'download.log')
    const logger = await createDownloadLogger(logPath)

    logger.log('[download] year=2026 games=1')
    logger.warn('[skip] existing file')
    logger.error('[error] failed request')

    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 10)
    })

    const written = await readFile(logPath, 'utf8')
    expect(written).toContain('INFO [download] year=2026 games=1')
    expect(written).toContain('WARN [skip] existing file')
    expect(written).toContain('ERROR [error] failed request')
  })
})
