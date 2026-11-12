import { createHash } from 'node:crypto'
import { officialCalendarFactsSchema, type OfficialCalendarFacts } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import { hasRepositoryTable } from './schema-detection'
import { canonicalLeagueTeamNames, canonicalTeamName } from './team-name-utils'

type Observation = {
  observation_id: string; source_url: string; year: number; source_kind: string; content_hash: string;
  raw_key: string; fetched_at: string; fetched_at_ms: number; facts_json: string; facts_hash: string; structured_key: string
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export async function readOfficialCalendars(database: QueryDatabase, year: number, kind: 'season' | 'month') {
  if (!await hasRepositoryTable(database, 'official_calendar_observations')) return []
  const rows = await database.prepare(`SELECT source.* FROM official_calendar_observations source
    WHERE year=? AND source_kind=? AND NOT EXISTS (
      SELECT 1 FROM official_calendar_observations newer WHERE newer.source_url=source.source_url AND
      (newer.fetched_at_ms>source.fetched_at_ms OR
        (newer.fetched_at_ms=source.fetched_at_ms AND newer.observation_id>source.observation_id)))`).all(year, kind) as Observation[]
  return rows.map((row) => {
    const facts = officialCalendarFactsSchema.parse(JSON.parse(row.facts_json))
    const expectedUrl = facts.kind === 'season' ? `https://npb.jp/bis/${year}/stats/`
      : `https://npb.jp/bis/${year}/calendar/index_${String(facts.month).padStart(2, '0')}.html`
    if (row.source_url !== expectedUrl || facts.year !== year || facts.kind !== kind ||
      hash(row.facts_json) !== row.facts_hash || !/^[a-f0-9]{64}$/u.test(row.content_hash) ||
      row.raw_key !== `raw/bis-calendar/${row.content_hash}.html` ||
      Date.parse(row.fetched_at) !== row.fetched_at_ms || !Number.isFinite(row.fetched_at_ms) ||
      row.observation_id !== hash(JSON.stringify([row.source_url, row.content_hash, row.fetched_at_ms, row.facts_hash])) ||
      row.structured_key !== `structured/bis-calendar/${row.observation_id}.json` ||
      facts.calendarFrom > facts.calendarTo || !facts.calendarFrom.startsWith(`${year}-`) || !facts.calendarTo.startsWith(`${year}-`)) {
      throw new Error('Official calendar source integrity mismatch')
    }
    return { facts, sourceUrl: row.source_url, fetchedAt: row.fetched_at }
  })
}

/** A closed published calendar proves when an enclosing window covers the full season. */
export async function officialSeasonInWindow(database: QueryDatabase, year: number, from?: string, to?: string) {
  const sources = await readOfficialCalendars(database, year, 'season')
  if (sources.length !== 1) return null
  const source = sources[0]!
  if (source.facts.kind !== 'season' || (from && from > source.facts.calendarFrom) || (to && to < source.facts.calendarTo)) return null
  return { ...source, facts: source.facts as Extract<OfficialCalendarFacts, { kind: 'season' }> }
}

export type CalendarFixtureScope = {
  game_date?: string; date_from?: string; date_to?: string; team?: string; opponent?: string;
  game_id?: string; venue?: string; competition?: string; include_farm?: boolean; player_name?: string
}
export type OfficialCalendarAbsence = { date: string; team: string; opponent?: string; sourceUrl: string; fetchedAt: string }

/** Empty archive results become an absence claim only with complete official day coverage. */
export async function searchOfficialCalendarAbsence(database: QueryDatabase, filters: CalendarFixtureScope): Promise<OfficialCalendarAbsence | null> {
  const date = filters.game_date ?? (filters.date_from === filters.date_to ? filters.date_from : undefined)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || !filters.team || filters.game_id || filters.venue ||
    filters.include_farm || filters.player_name || (filters.competition && !['公式戦', 'セ・リーグ', 'パ・リーグ', '交流戦'].includes(filters.competition))) return null
  const team = canonicalTeamName(filters.team), opponent = filters.opponent ? canonicalTeamName(filters.opponent) : undefined
  if (canonicalLeagueTeamNames(team).length !== 1 || (opponent && canonicalLeagueTeamNames(opponent).length !== 1)) return null
  const sources = await readOfficialCalendars(database, Number(date.slice(0, 4)), 'month')
  const selected = sources.filter((source) => source.facts.kind === 'month' && source.facts.month === Number(date.slice(5, 7)))
  if (selected.length !== 1) return null
  const source = selected[0]!, facts = source.facts
  if (facts.kind !== 'month' || !facts.dates.includes(date)) return null
  const games = facts.games.filter((game) => game.date === date)
  const matches = games.some((game) => {
    const clubs = [canonicalTeamName(game.homeTeam), canonicalTeamName(game.awayTeam)]
    return clubs.includes(team) && (!opponent || clubs.includes(opponent))
  })
  // A cancelled scheduled fixture also prevents a claim that the fixture did not exist.
  return matches ? null : { date, team: filters.team, opponent: filters.opponent, sourceUrl: source.sourceUrl, fetchedAt: source.fetchedAt }
}
