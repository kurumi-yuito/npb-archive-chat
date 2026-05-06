import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseScoresBoxHtml } from './scores-box'
import { parseScoresCalendarHtml } from './scores-calendar'
import { parseScoresIndexHtml } from './scores-index'
import { NoPlayByPlayAvailableError, parseScoresPlayByPlayHtml } from './scores-playbyplay'
import { parseScoresRosterHtml } from './scores-roster'

const fixtureRoot = path.resolve(process.cwd(), 'src', '__fixtures__')
const rawGameRoot = path.join(fixtureRoot, 'raw', '2025', '0815', 'r20250815b-l-17')
const raw2017GameRoot = path.join(fixtureRoot, 'raw', '2017', '0722', 'r20170722h-m-14')
const richPlayByPlayRoot = path.join(fixtureRoot, 'raw', '2025', '0507', 'b-f-09')
const rainCancelledPlayByPlayPath = path.join(
  fixtureRoot,
  'raw',
  '2024',
  '0528',
  'r20240528c-b-02',
  'playbyplay.html',
)

describe('scores parser modules', () => {
  it('extracts multiple game urls from scores calendar html', async () => {
    const html = await readFile(path.join(fixtureRoot, 'scores-calendar-2025-0328.html'), 'utf8')
    const games = parseScoresCalendarHtml(html, 2025, '0328')
    expect(games.length).toBeGreaterThanOrEqual(2)
    expect(games.some((game) => game.scoresBaseUrl.includes('/scores/2025/0328/g-t-01/'))).toBe(true)
    expect(games.some((game) => game.scoresBaseUrl.includes('/scores/2025/0328/b-l-01/'))).toBe(true)
    expect(games.every((game) => 'slug' in game)).toBe(true)
  })

  it('parses scores playbyplay fixture into many events', async () => {
    const html = await readFile(path.join(richPlayByPlayRoot, 'playbyplay.html'), 'utf8')
    const events = parseScoresPlayByPlayHtml(html)
    expect(events.length).toBeGreaterThan(100)
    expect(events.every((event) => Object.hasOwn(event, 'game_id'))).toBe(true)
    expect(events.every((event) => Object.hasOwn(event, 'event_attributes_json'))).toBe(true)
    expect(events.some((event) => event.event_type === 'steal')).toBe(true)
    expect(events.some((event) => event.event_type === 'pitching_change')).toBe(true)
  })

  it('classifies rain-cancelled scores playbyplay pages as unavailable', async () => {
    const html = await readFile(rainCancelledPlayByPlayPath, 'utf8')
    expect(() => parseScoresPlayByPlayHtml(html)).toThrow(NoPlayByPlayAvailableError)
    try {
      parseScoresPlayByPlayHtml(html)
    } catch (error) {
      expect(error).toBeInstanceOf(NoPlayByPlayAvailableError)
      expect((error as NoPlayByPlayAvailableError).reasonCode).toBe('no_pbp_available:rain_cancelled')
    }
  })

  it('parses scores box fixture into batting and pitching lines', async () => {
    const html = await readFile(path.join(rawGameRoot, 'box.html'), 'utf8')
    const parsed = parseScoresBoxHtml(html)
    const battingLines = parsed.battingLines
    const pitchingLines = parsed.pitchingLines
    expect(battingLines.length).toBeGreaterThan(0)
    expect(pitchingLines.length).toBeGreaterThan(0)
    expect(parsed.linescore.away_team).toBeTruthy()
  })

  it('parses 2017 scores box tables without table ids', async () => {
    const html = await readFile(path.join(raw2017GameRoot, 'box.html'), 'utf8')
    const parsed = parseScoresBoxHtml(html)
    expect(parsed.battingLines.length).toBeGreaterThan(0)
    expect(parsed.pitchingLines.length).toBeGreaterThan(0)
    expect(parsed.battingLines.some((line) => line.player_name === '細谷')).toBe(true)
    expect(parsed.pitchingLines.some((line) => line.pitcher_name === '二木')).toBe(true)
  })

  it('parses scores roster fixture into roster entries', async () => {
    const html = await readFile(path.join(rawGameRoot, 'roster.html'), 'utf8')
    const entries = parseScoresRosterHtml(html)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((entry) => Object.hasOwn(entry, 'starter'))).toBe(true)
  })

  it('parses scores index fixture into metadata', async () => {
    const html = await readFile(path.join(rawGameRoot, 'index.html'), 'utf8')
    const parsed = parseScoresIndexHtml(html)
    expect(parsed.game.venue).toBeTruthy()
    expect(parsed.game.home_team).toBeTruthy()
    expect(parsed.game.away_team).toBeTruthy()
  })
})
