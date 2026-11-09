import { annualPlayerHistoryRows, officialPlayerHistoryEvidenceSchema, verifiedPlayerCareerRows, type PlayerAffiliationFilters } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'
import { matchesGameTeamFilter } from './team-name-utils'
import { searchOfficialStatisticRows } from './official-statistics-repository'
import { searchRegistrationInformation } from './registration-information-repository'
import { officialProfileMemberships } from './official-profile-memberships'

export type PlayerInformationRow = {
  playerId: string; name: string; fetchedAt: string; sourceUrls: string[]
  profileAvailable?: boolean
  affiliations: Array<{ year: number; team: string }>
  registrations: Array<{ year: number; team: string; position: string | null; uniformNumber: string | null; bats: string | null; throws: string | null }>
  statistics?: Array<{ year: number; team: string; kind: 'batting' | 'pitching'; metrics: Record<string, string>; sourceUrl: string; fetchedAt: string }>
  careerStatistics?: Array<{ kind: 'batting' | 'pitching'; metrics: Record<string, string>; sourceUrl: string; fetchedAt: string; basisText: string | null; yearFrom: number; yearTo: number }>
  annualStatistics?: Array<{ kind: 'batting' | 'pitching'; year: number; team: string | null; metrics: Record<string, string>; sourceUrl: string; fetchedAt: string }>
}
export type PlayerInformationFilters = Omit<PlayerAffiliationFilters, 'player_name'> & { player_name?: string; includeCareer?: boolean }

/** A player introduction requires identity/registration facts, not every batting or pitching appearance. */
export async function searchPlayerInformation(database: QueryDatabase, filters: PlayerInformationFilters): Promise<PlayerInformationRow[]> {
  if (!filters.player_id) return []
  const historicalRegistrations = await searchRegistrationInformation(database, filters)
  const profile = await database.prepare('SELECT player_id,full_name,year_teams_json,source_url,fetched_at,metadata FROM player_profiles WHERE player_id=?')
    .get(filters.player_id) as { player_id: string; full_name: string; year_teams_json: string | null; source_url: string; fetched_at: string; metadata: string } | null
  if (!profile || profile.source_url !== `https://npb.jp/bis/players/${profile.player_id}.html`) {
    if (!historicalRegistrations.length) return []
    const latest = historicalRegistrations[0]!
    return [{ playerId: filters.player_id, name: latest.playerName, fetchedAt: latest.fetchedAt, profileAvailable: false,
      sourceUrls: [...new Set(historicalRegistrations.map((row) => row.sourceUrl))],
      affiliations: historicalRegistrations.map((row) => ({ year: row.year, team: row.team })),
      registrations: historicalRegistrations.map((row) => ({ year: row.year, team: row.team, position: row.position,
        uniformNumber: row.uniformNumber, bats: null, throws: null })) }]
  }
  const affiliations: PlayerInformationRow['affiliations'] = []
    for (const { year, team } of officialProfileMemberships(profile)) {
      if (!Number.isInteger(year) || year < 1936 || (filters.year && year !== filters.year) || (filters.year_from && year < filters.year_from) || (filters.year_to && year > filters.year_to)) continue
      if (!filters.team || matchesGameTeamFilter(team, filters.team)) affiliations.push({ year, team })
    }
  const registrations = await database.prepare(`SELECT year,team_name AS team,position,uniform_number AS uniformNumber,bats,throws,source_url AS sourceUrl
    FROM current_team_roster WHERE player_id=? ORDER BY year DESC,team_id LIMIT 50`).all(profile.player_id) as Array<PlayerInformationRow['registrations'][number] & { sourceUrl: string }>
  // An unversioned roster page supports the collection year's listing. It is
  // neither a historical roster archive nor proof of a current contract.
  const currentYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date()))
  const verified = registrations.filter((row) => row.year === currentYear && (!filters.year || row.year === filters.year) &&
    (!filters.year_from || row.year >= filters.year_from) && (!filters.year_to || row.year <= filters.year_to) &&
    (!filters.team || matchesGameTeamFilter(row.team, filters.team)) &&
    /^https:\/\/npb\.jp\/bis\/teams\/rst_[a-z]+\.html$/u.test(row.sourceUrl))
  const statistics: NonNullable<PlayerInformationRow['statistics']> = []
  for (const kind of ['batting', 'pitching'] as const) {
    const rows = await searchOfficialStatisticRows(database, { player_id: profile.player_id, year: filters.year,
      year_from: filters.year_from, year_to: filters.year_to, team: filters.team, kind, level: 'first', limit: 50 })
    const latestYear = Math.max(...rows.map((row) => row.year))
    for (const row of rows.filter((entry) => entry.year === latestYear)) {
      try {
        const metrics: unknown = JSON.parse(row.statsJson)
        if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics) || !Object.values(metrics).every((value) => typeof value === 'string')) continue
        statistics.push({ year: row.year, team: row.team, kind, metrics: metrics as Record<string, string>, sourceUrl: row.sourceUrl, fetchedAt: row.fetchedAt })
      } catch { /* Invalid metrics cannot support an introduction. */ }
    }
  }
  const careerStatistics: NonNullable<PlayerInformationRow['careerStatistics']> = []
  const annualStatistics: NonNullable<PlayerInformationRow['annualStatistics']> = []
  if (filters.includeCareer) {
    try {
      const metadata = JSON.parse(profile.metadata ?? '{}') as { official_profile_evidence?: unknown }
      const evidence = officialPlayerHistoryEvidenceSchema.parse(metadata.official_profile_evidence)
      if (evidence.playerId === profile.player_id && evidence.sourceUrl === profile.source_url && evidence.fetchedAt === profile.fetched_at && evidence.fullName === profile.full_name) {
        for (const row of verifiedPlayerCareerRows(evidence)) {
          for (const annual of annualPlayerHistoryRows(evidence.rows, row.kind)) annualStatistics.push({ kind: row.kind, year: annual.year!, team: annual.team,
            metrics: annual.metrics, sourceUrl: evidence.sourceUrl, fetchedAt: evidence.fetchedAt })
          const years = evidence.rows.filter((entry) => entry.kind === row.kind && entry.year !== null).map((entry) => entry.year!)
          careerStatistics.push({ kind: row.kind, metrics: row.metrics, sourceUrl: evidence.sourceUrl, fetchedAt: evidence.fetchedAt,
            basisText: evidence.basisText, yearFrom: Math.min(...years), yearTo: Math.max(...years) })
        }
      }
    } catch { /* A missing, inconsistent or stale evidence block cannot certify a career. */ }
  }
  return [{ playerId: profile.player_id, name: profile.full_name, fetchedAt: profile.fetched_at,
    sourceUrls: [...new Set([profile.source_url, ...historicalRegistrations.map((row) => row.sourceUrl), ...verified.map((row) => row.sourceUrl), ...statistics.map((row) => row.sourceUrl)])],
    affiliations: [...new Map([...affiliations, ...historicalRegistrations.map((row) => ({ year: row.year, team: row.team }))].map((row) => [`${row.year}:${row.team}`, row])).values()].sort((a, b) => b.year - a.year),
    registrations: [...verified, ...historicalRegistrations.map((row) => ({ ...row, bats: null, throws: null }))].map((row) => ({ year: row.year, team: row.team, position: row.position,
      uniformNumber: row.uniformNumber, bats: row.bats, throws: row.throws })),
    statistics,
    ...(filters.includeCareer ? { careerStatistics, annualStatistics } : {}),
  }]
}
