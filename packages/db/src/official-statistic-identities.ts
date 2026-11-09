import { normalizePlayerNameKey, officialPlayerNameCandidateKeys, officialPlayerHistoryEvidenceSchema } from '@npb/schemas'
import type { SqliteDatabase } from './sqlite'
import { matchesGameTeamFilter } from './repository/team-name-utils'
import type { OfficialRosterIdentity } from './official-roster-identities'

/** A comparison key generates candidates; dated official membership decides uniqueness. */
export function officialStatisticIdentityIndex(database: SqliteDatabase, roster: OfficialRosterIdentity[] = []) {
  type Profile = { player_id: string; full_name: string; source_url: string; fetched_at: string; year_teams_json: string | null; metadata: string | null }
  const names = new Map<string, Array<{ playerId: string; years: Record<string, unknown> }>>()
  const identities = new Map<string, { playerId: string; years: Record<string, unknown> }>()
  const firstTeamSeasons = new Map<string, Array<{ year: number; team: string }>>()
  for (const profile of database.prepare('SELECT player_id,full_name,source_url,fetched_at,year_teams_json,metadata FROM player_profiles').all() as Profile[]) {
    if (profile.source_url !== `https://npb.jp/bis/players/${profile.player_id}.html`) continue
    try {
      const years: unknown = JSON.parse(profile.year_teams_json ?? '{}')
      if (!years || typeof years !== 'object' || Array.isArray(years)) continue
      const identity = { playerId: profile.player_id, years: years as Record<string, unknown> }
      const evidence = officialPlayerHistoryEvidenceSchema.safeParse(JSON.parse(profile.metadata ?? '{}')?.official_profile_evidence)
      if (evidence.success && evidence.data.playerId === profile.player_id && evidence.data.sourceUrl === profile.source_url
        && evidence.data.fullName === profile.full_name && evidence.data.fetchedAt === profile.fetched_at) {
        firstTeamSeasons.set(profile.player_id, evidence.data.rows.flatMap((row) => row.scope === 'team_season' && row.year !== null && row.team
          && Number(row.metrics[row.kind === 'pitching' ? '登板' : '試合']) > 0 ? [{ year: row.year, team: row.team }] : []))
        for (const row of evidence.data.rows) {
          if (row.scope !== 'team_season' || row.year === null || !row.team) continue
          const year = String(row.year), previous = identity.years[year]
          identity.years[year] = [...new Set([...(Array.isArray(previous) ? previous : typeof previous === 'string' ? [previous] : []), row.team])]
        }
      }
      identities.set(profile.player_id, identity)
      // Initials are optional in some official season tables. This generates
      // candidates only; season/team proof and unique IDs remain mandatory.
      for (const key of officialPlayerNameCandidateKeys(profile.full_name)) {
        const existing = names.get(key) ?? []
        existing.push(identity)
        names.set(key, existing)
      }
    } catch { /* Invalid metadata cannot prove membership. */ }
  }
  for (const entry of roster) {
    const identity = identities.get(entry.playerId) ?? { playerId: entry.playerId, years: {} }
    const year = String(entry.year)
    const previous = identity.years[year]
    identity.years[year] = [...new Set([...(Array.isArray(previous) ? previous : typeof previous === 'string' ? [previous] : []), entry.teamName])]
    identities.set(entry.playerId, identity)
    for (const key of officialPlayerNameCandidateKeys(entry.fullName)) {
      const existing = names.get(key) ?? []
      existing.push(identity)
      names.set(key, existing)
    }
  }
  return { resolve(name: string, scope: { year: number; teamName: string; level?: 'first' | 'farm' }): string | null {
    const eligible = (names.get(normalizePlayerNameKey(name)) ?? []).filter((profile) => {
      const membership = profile.years[String(scope.year)]
      return (Array.isArray(membership) ? membership : [membership]).some((team) => typeof team === 'string' && matchesGameTeamFilter(team, scope.teamName))
    })
    let ids = [...new Set(eligible.map((profile) => profile.playerId))]
    if (ids.length > 1 && scope.level === 'first') ids = ids.filter((id) => firstTeamSeasons.get(id)?.some((season) => season.year === scope.year && matchesGameTeamFilter(season.team, scope.teamName)))
    return ids.length === 1 ? ids[0]! : null
  } }
}
