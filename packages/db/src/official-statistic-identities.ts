import { normalizePlayerNameKey } from '@npb/schemas'
import type { SqliteDatabase } from './sqlite'
import { matchesGameTeamFilter } from './repository/team-name-utils'
import type { OfficialRosterIdentity } from './official-roster-identities'

/** A comparison key generates candidates; dated official membership decides uniqueness. */
export function officialStatisticIdentityIndex(database: SqliteDatabase, roster: OfficialRosterIdentity[] = []) {
  type Profile = { player_id: string; full_name: string; source_url: string; year_teams_json: string | null }
  const names = new Map<string, Array<{ playerId: string; years: Record<string, unknown> }>>()
  const identities = new Map<string, { playerId: string; years: Record<string, unknown> }>()
  for (const profile of database.prepare('SELECT player_id,full_name,source_url,year_teams_json FROM player_profiles').all() as Profile[]) {
    if (profile.source_url !== `https://npb.jp/bis/players/${profile.player_id}.html`) continue
    try {
      const years: unknown = JSON.parse(profile.year_teams_json ?? '{}')
      if (!years || typeof years !== 'object' || Array.isArray(years)) continue
      const key = normalizePlayerNameKey(profile.full_name)
      const existing = names.get(key) ?? []
      const identity = { playerId: profile.player_id, years: years as Record<string, unknown> }
      identities.set(profile.player_id, identity)
      existing.push(identity)
      names.set(key, existing)
    } catch { /* Invalid metadata cannot prove membership. */ }
  }
  for (const entry of roster) {
    const identity = identities.get(entry.playerId) ?? { playerId: entry.playerId, years: {} }
    const year = String(entry.year)
    const previous = identity.years[year]
    identity.years[year] = [...new Set([...(Array.isArray(previous) ? previous : typeof previous === 'string' ? [previous] : []), entry.teamName])]
    identities.set(entry.playerId, identity)
    const key = normalizePlayerNameKey(entry.fullName)
    const existing = names.get(key) ?? []
    existing.push(identity)
    names.set(key, existing)
  }
  return { resolve(name: string, scope: { year: number; teamName: string }): string | null {
    const eligible = (names.get(normalizePlayerNameKey(name)) ?? []).filter((profile) => {
      const membership = profile.years[String(scope.year)]
      return (Array.isArray(membership) ? membership : [membership]).some((team) => typeof team === 'string' && matchesGameTeamFilter(team, scope.teamName))
    })
    const ids = [...new Set(eligible.map((profile) => profile.playerId))]
    return ids.length === 1 ? ids[0]! : null
  } }
}
