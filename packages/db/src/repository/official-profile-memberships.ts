import { officialPlayerHistoryEvidenceSchema } from '@npb/schemas'

type Profile = { player_id: string; full_name: string; source_url: string; fetched_at: string; metadata: string | null; year_teams_json: string | null }

/** Membership keeps every team stint; annual statistical subtotals must never
 * replace a mid-season transfer's two team rows. */
export function officialProfileMemberships(profile: Profile): Array<{ year: number; team: string }> {
  try {
    const metadata = JSON.parse(profile.metadata ?? '{}') as { official_profile_evidence?: unknown }
    if (metadata.official_profile_evidence !== undefined) {
      const parsed = officialPlayerHistoryEvidenceSchema.safeParse(metadata.official_profile_evidence)
      if (!parsed.success) return []
      const evidence = parsed.data
      if (evidence.playerId !== profile.player_id || evidence.fullName !== profile.full_name || evidence.sourceUrl !== profile.source_url || evidence.fetchedAt !== profile.fetched_at) return []
      return [...new Map(evidence.rows.flatMap((row) => row.scope === 'team_season' && row.year !== null && row.team
        ? [[`${row.year}:${row.team}`, { year: row.year, team: row.team }] as const] : [])).values()]
    }
    const years: unknown = JSON.parse(profile.year_teams_json ?? '{}')
    if (!years || typeof years !== 'object' || Array.isArray(years)) return []
    return Object.entries(years).flatMap(([text, teams]) => {
      const year = Number(text)
      return Number.isInteger(year) && year >= 1936 ? (Array.isArray(teams) ? teams : [teams]).flatMap((team) => typeof team === 'string' && team ? [{ year, team }] : []) : []
    })
  } catch { return [] }
}

/** A compact SQL projection avoids transferring every career metric merely to
 * resolve a name. The returned proof is also validated in the JS reader. */
export function officialProfileMembershipsJsonSql(alias = 'player_profiles'): string {
  const metadata = `CASE WHEN json_valid(${alias}.metadata) THEN ${alias}.metadata ELSE '{}' END`
  const evidence = `(CASE WHEN json_type(${metadata},'$.official_profile_evidence')='object' THEN json_extract(${metadata},'$.official_profile_evidence') ELSE '{}' END)`
  return `(CASE WHEN json_type(${metadata},'$.official_profile_evidence') IS NOT NULL THEN
    CASE WHEN json_extract(${evidence},'$.version')=1
      AND json_extract(${evidence},'$.playerId')=${alias}.player_id
      AND json_extract(${evidence},'$.fullName')=${alias}.full_name
      AND json_extract(${evidence},'$.sourceUrl')=${alias}.source_url
      AND json_extract(${evidence},'$.fetchedAt')=${alias}.fetched_at
      AND json_type(${evidence},'$.rows')='array'
    THEN (SELECT json_group_array(json_object('year',json_extract(stint.value,'$.year'),'team',json_extract(stint.value,'$.team')))
      FROM json_each(${evidence},'$.rows') stint WHERE json_extract(stint.value,'$.scope')='team_season'
        AND json_type(stint.value,'$.year')='integer' AND json_extract(stint.value,'$.year')>=1936
        AND json_type(stint.value,'$.team')='text') ELSE '[]' END
    ELSE (SELECT json_group_array(json_object('year',CAST(season.key AS INTEGER),'team',membership.value))
      FROM json_each(CASE WHEN json_valid(${alias}.year_teams_json) THEN ${alias}.year_teams_json ELSE '{}' END) season,
      json_each(CASE WHEN season.type='array' THEN season.value ELSE json_array(season.value) END) membership
      WHERE CAST(season.key AS INTEGER)>=1936 AND membership.type='text') END)`
}
