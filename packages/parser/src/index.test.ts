import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { richGameSchema } from '@npb/schemas'
import {
  parseNpbScoresIndexGameTitle,
  parserPackage,
  parseRawGameFromDir,
  upstreamCrawlerPackage,
} from './index.js'
import { parseScoresPlayByPlayHtml } from './scores-playbyplay.js'

const fixtureDir = path.resolve(
  process.cwd(),
  '..',
  '..',
  'data',
  'raw',
  '2026',
  '0327',
  'g-t-01',
)

const actualFixtureRoot = path.resolve(process.cwd(), 'src', '__fixtures__', 'raw', '2025')

const bisEngMinimalFixture = path.resolve(
  process.cwd(),
  'src',
  '__fixtures__',
  'bis-eng-minimal-game.html',
)
const scoresPlayByPlayFixture = path.resolve(
  process.cwd(),
  'src',
  '__fixtures__',
  'raw',
  '2025',
  '0507',
  'b-f-09',
  'playbyplay.html',
)

describe('@npb/parser', () => {
  it('parses npb scores h3 titles for regular season, CS, Japan Series, and finals', () => {
    expect(
      parseNpbScoresIndexGameTitle('【交流戦】　オリックス　vs　中日　１回戦'),
    ).toEqual({
      competition: '交流戦',
      homeTeamName: 'オリックス',
      awayTeamName: '中日',
      game_number: 1,
    })

    expect(
      parseNpbScoresIndexGameTitle(
        '【クライマックスシリーズ　セ】　阪神　VS　広島　第３戦',
      ),
    ).toEqual({
      competition: 'クライマックスシリーズ セ',
      homeTeamName: '阪神',
      awayTeamName: '広島',
      game_number: 3,
    })

    expect(
      parseNpbScoresIndexGameTitle('【日本シリーズ】　巨人　vs　ソフトバンク　第1戦'),
    ).toEqual({
      competition: '日本シリーズ',
      homeTeamName: '巨人',
      awayTeamName: 'ソフトバンク',
      game_number: 1,
    })

    expect(
      parseNpbScoresIndexGameTitle('【ファーム日本選手権】　ロッテ　vs　巨人　決勝'),
    ).toEqual({
      competition: 'ファーム日本選手権',
      homeTeamName: 'ロッテ',
      awayTeamName: '巨人',
      game_number: null,
    })

    expect(
      parseNpbScoresIndexGameTitle('【セパ交流戦】　ヤクルト　vs　日本ハム　3回戦'),
    ).toEqual({
      competition: 'セパ交流戦',
      homeTeamName: 'ヤクルト',
      awayTeamName: '日本ハム',
      game_number: 3,
    })
  })

  it('exports package marker', () => {
    expect(parserPackage()).toBe('@npb/parser')
  })

  it('resolves workspace dependency on crawler', () => {
    expect(upstreamCrawlerPackage()).toBe('@npb/crawler')
  })

  it('parses one raw game directory into rich json', async () => {
    const parsed = await parseRawGameFromDir(fixtureDir)
    const validated = richGameSchema.parse(parsed)

    expect(validated.game_meta.game_id).toBe('g-t-01')
    expect(validated.game_meta.venue).toBe('東京ドーム')
    expect(validated.top_summary.linescore.away.totals.runs).toBe(1)
    expect(validated.top_summary.linescore.home.totals.runs).toBe(3)
    expect(validated.play_by_play.length).toBeGreaterThan(40)
    expect(validated.play_by_play[0]).toMatchObject({
      inning: 1,
      half: 'top',
      event_type: 'game_note',
      event_subtype: 'starting_pitcher',
    })
    expect(
      validated.play_by_play.find(
        (event) =>
          event.event_type === 'substitution' &&
          event.event_subtype === 'pitching_change',
      ),
    ).toBeTruthy()
    expect(validated.batting_box).toHaveLength(2)
    expect(validated.pitching_box).toHaveLength(2)
    expect(validated.roster).toHaveLength(2)
    expect(validated.roster[0]?.groups[0]?.entries[0]?.player.name).toBe('岩崎')
  })

  it('parses an extra-innings fixture without assuming nine innings only', async () => {
    const parsed = await parseRawGameFromDir(
      path.join(actualFixtureRoot, '0711', 'db-g-11'),
    )

    expect(parsed.play_by_play.some((event) => event.inning === 10)).toBe(true)
    expect(Math.max(...parsed.play_by_play.map((event) => event.inning))).toBe(11)
    expect(
      parsed.play_by_play.filter(
        (event) => event.inning === 10 && event.event_type === 'plate_appearance',
      ).length,
    ).toBeGreaterThan(0)
  })

  it('parses a fixture with many pitching changes', async () => {
    const parsed = await parseRawGameFromDir(
      path.join(actualFixtureRoot, '0507', 'b-f-09'),
    )

    const substitutions = parsed.play_by_play.filter(
      (event) =>
        event.event_type === 'substitution' &&
        event.event_subtype === 'pitching_change',
    )

    expect(substitutions.length).toBeGreaterThanOrEqual(10)
  })

  it('parses a real substitution-heavy fixture and classifies pinch hitters distinctly', async () => {
    const parsed = await parseRawGameFromDir(
      path.join(actualFixtureRoot, '1001', 'g-d-25'),
    )

    const pinchHitters = parsed.play_by_play.filter(
      (event) =>
        event.event_type === 'plate_appearance' &&
        event.event_subtype === 'pinch_hitter',
    )
    const runnerEvents = parsed.play_by_play.filter(
      (event) => event.event_type === 'runner_event',
    )

    expect(pinchHitters.length).toBeGreaterThanOrEqual(4)
    expect(runnerEvents.length).toBeGreaterThanOrEqual(1)
  })

  it('keeps pinch hitters as plate appearances and infers pinch runners via attributes from a real fixture', async () => {
    const parsed = await parseRawGameFromDir(
      path.join(actualFixtureRoot, '0815', 'r20250815b-l-17'),
    )

    const pinchHit = parsed.play_by_play.find(
      (event) =>
        event.event_type === 'plate_appearance' &&
        event.event_subtype === 'pinch_hitter' &&
        event.batter?.player?.name === '山村',
    )
    const impliedPinchRunner = parsed.play_by_play.find(
      (event) =>
        event.event_type === 'runner_event' &&
        event.event_attributes?.implied_substitution_subtype === 'pinch_runner',
    )

    expect(pinchHit).toBeTruthy()
    expect(pinchHit?.event_type).toBe('plate_appearance')
    expect(impliedPinchRunner).toMatchObject({
      event_type: 'runner_event',
      event_subtype: 'stolen_base',
      event_attributes: {
        implied_substitution_subtype: 'pinch_runner',
        runner: {
          name: '髙松',
        },
      },
    })
  })

  it('parses BIS english index-only raw directory into rich game (no scores pages)', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'npb-parser-bis-'))
    const gameDir = path.join(root, '2025', '1001', 'r20251001b-l-02')
    await mkdir(gameDir, { recursive: true })
    await writeFile(path.join(gameDir, 'index.html'), await readFile(bisEngMinimalFixture, 'utf8'))

    const parsed = await parseRawGameFromDir(gameDir)
    const validated = richGameSchema.parse(parsed)

    expect(validated.game_meta.game_id).toBe('r20251001b-l-02')
    expect(validated.game_meta.canonical_url).toContain('/bis/eng/2025/games/')
    expect(validated.top_summary.linescore.home.totals.runs).toBe(10)
    expect(validated.top_summary.linescore.away.totals.runs).toBe(5)
    for (const side of ['away', 'home'] as const) {
      for (const cell of validated.top_summary.linescore[side].innings) {
        expect(cell.length).toBeGreaterThanOrEqual(1)
      }
    }

    expect(validated.top_summary.linescore.away.innings).not.toContain('-')
    expect(validated.top_summary.linescore.home.innings).not.toContain('')
    expect(validated.play_by_play).toHaveLength(1)
    expect(validated.play_by_play[0]).toMatchObject({
      event_type: 'game_note',
      event_subtype: 'other',
    })
    expect(validated.batting_box).toHaveLength(0)
    expect(validated.pitching_box).toHaveLength(0)
    expect(validated.roster).toHaveLength(0)
  })

  it('parses scores playbyplay fixture into a large event set', async () => {
    const html = await readFile(scoresPlayByPlayFixture, 'utf8')
    const events = parseScoresPlayByPlayHtml(html)

    expect(events.length).toBeGreaterThan(100)
    expect(events.some((event) => event.event_type === 'plate_appearance')).toBe(true)
    expect(events.some((event) => event.event_type === 'steal')).toBe(true)
  })
})
