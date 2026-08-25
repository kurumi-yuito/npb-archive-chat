import type { PlayerCandidate } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'

export type { PlayerCandidate }

export type SearchPlayerCandidatesFilters = {
  name: string
  aliases?: string[]
  year?: number
  year_from?: number
  year_to?: number
  latestOnly?: boolean
  includeEvents?: boolean
  searchDomain?: 'all' | 'batting' | 'pitching'
  limit?: number
}

async function fetchProfileNamesForIds(
  database: QueryDatabase,
  playerIds: string[],
): Promise<Map<string, string>> {
  if (playerIds.length === 0) return new Map()
  const placeholders = playerIds.map(() => '?').join(', ')
  try {
    const rows = await database
      .prepare(`SELECT player_id, full_name FROM player_profiles WHERE player_id IN (${placeholders})`)
      .all(...playerIds) as Array<{ player_id: string; full_name: string }>
    return new Map(rows.map((r) => [r.player_id, r.full_name]))
  } catch {
    return new Map()
  }
}

type ProfileMatch = {
  player_id: string
  fullName: string | null
  knownTeams: string[]
  years: number[]
  currentTeam: string | null
}

async function resolvePlayerIdsFromProfiles(
  database: QueryDatabase,
  aliases: string[],
): Promise<ProfileMatch[]> {
  if (aliases.length === 0) return []
  const values: string[] = []
  const clauses: string[] = []
  for (const alias of aliases) {
    const compact = normalizeIdentityKey(alias)
    values.push(compact, `${compact}%`, compact)
    clauses.push(
      `(${identityNameSql('COALESCE(player_profiles.canonical_name, player_profiles.full_name)')} = ? OR ${identityNameSql('COALESCE(player_profiles.canonical_name, player_profiles.full_name)')} LIKE ? OR (LENGTH(${identityNameSql('COALESCE(player_profiles.canonical_name, player_profiles.full_name)')}) >= 3 AND ? LIKE ${identityNameSql('COALESCE(player_profiles.canonical_name, player_profiles.full_name)')} || '%'))`,
    )
  }
  let profileRows: Array<{ player_id: string; full_name: string | null; team_name: string | null; year_teams_json: string | null }> = []
  try {
    profileRows = await database
      .prepare(`SELECT player_id, full_name, team_name, year_teams_json FROM player_profiles WHERE ${clauses.join(' OR ')} LIMIT 30`)
      .all(...values) as Array<{ player_id: string; full_name: string | null; team_name: string | null; year_teams_json: string | null }>
  } catch {
    // Identity sources are deployed independently. A missing or older profile
    // projection must not suppress the remaining Repository-backed ID sources.
  }

  const registeredFactRows = profileRows.length === 0
    ? await resolvePlayerRowsFromRegisteredFacts(database, aliases)
    : null
  const normalizedRows = profileRows.length === 0 && (!registeredFactRows || registeredFactRows.length === 0)
    ? await resolvePlayerRowsFromNormalizedFacts(database, aliases)
    : null
  let rows = profileRows.length > 0
    ? profileRows
    : registeredFactRows && registeredFactRows.length > 0
      ? registeredFactRows
    : normalizedRows && normalizedRows.length > 0
      ? normalizedRows
      : []
  if (rows.length === 0) {
    try {
      rows = await resolvePlayerRowsFromIdSources(database, aliases)
    } catch {
      rows = []
    }
  }

  try {
    let ids = [...new Set(rows.map((r) => r.player_id))]
    if (ids.length > 1) {
      const inputNames = new Set(aliases.map((alias) => normalizeIdentityKey(alias)))
      const exactFactIds = [...new Set(rows
        .filter((row) => row.full_name && inputNames.has(normalizeIdentityKey(row.full_name)))
        .map((row) => row.player_id))]
      if (exactFactIds.length === 1) {
        ids = exactFactIds
        rows = rows.filter((row) => row.player_id === ids[0])
      }
    }
    if (ids.length > 1) {
      const inputNames = aliases.map((alias) => normalizeIdentityKey(alias))
      const registeredPrefixes = rows.filter((row) => {
        if (!row.full_name) return false
        const factName = normalizeIdentityKey(row.full_name)
        return factName.length >= 3 && inputNames.some((inputName) => inputName.startsWith(factName))
      })
      if (registeredPrefixes.length > 0) {
        const longestLength = Math.max(...registeredPrefixes.map((row) => normalizeIdentityKey(row.full_name ?? '').length))
        const longestRows = registeredPrefixes.filter((row) => normalizeIdentityKey(row.full_name ?? '').length === longestLength)
        const longestIds = [...new Set(longestRows.map((row) => row.player_id))]
        if (longestIds.length === 1) {
          ids = longestIds
          rows = rows.filter((row) => row.player_id === ids[0])
        }
      }
    }
    if (ids.length > 1) {
      const profileNames = await fetchProfileNamesForIds(database, ids)
      const inputNames = new Set(aliases.map((alias) => normalizeIdentityKey(alias)))
      const exactProfileIds = ids.filter((id) => {
        const profileName = profileNames.get(id)
        return profileName ? inputNames.has(normalizeIdentityKey(profileName)) : false
      })
      if (exactProfileIds.length === 1) {
        ids = exactProfileIds
        rows = rows
          .filter((row) => row.player_id === ids[0])
          .map((row) => ({
            ...row,
            full_name: profileNames.get(row.player_id) ?? row.full_name,
          }))
      }
    }
    // Only filter when the profile lookup yields a unique player — multiple matches mean the input
    // is an ambiguous surname and filtering would incorrectly narrow to the first hit.
    if (ids.length !== 1) return []
    const inputNames = new Set(aliases.map((alias) => normalizeIdentityKey(alias)))
    const row = rows.find((r) =>
      r.player_id === ids[0] && r.full_name && inputNames.has(normalizeIdentityKey(r.full_name)),
    ) ?? rows
      .filter((r) => {
        if (r.player_id !== ids[0] || !r.full_name) return false
        const factName = normalizeIdentityKey(r.full_name)
        return factName.length >= 3 && [...inputNames].some((inputName) => inputName.startsWith(factName))
      })
      .sort((left, right) => normalizeIdentityKey(right.full_name ?? '').length - normalizeIdentityKey(left.full_name ?? '').length)[0]
      ?? rows.find((r) => r.player_id === ids[0])!
    let knownTeams: string[] = []
    let years: number[] = []
    try {
      const yearTeams = JSON.parse(row.year_teams_json ?? '{}') as Record<string, string>
      knownTeams = Object.values(yearTeams).filter(Boolean)
      years = Object.keys(yearTeams).map(Number).filter(Number.isFinite)
    } catch {
      // ignore parse errors
    }
    knownTeams = [...new Set([
      ...knownTeams,
      ...rows.filter((r) => r.player_id === ids[0]).map((r) => r.team_name).filter(Boolean) as string[],
    ])]
    const profileNames = row.full_name ? new Map<string, string>() : await fetchProfileNamesForIds(database, [ids[0]!])
    return [{
      player_id: ids[0]!,
      fullName: row.full_name ?? profileNames.get(ids[0]!) ?? null,
      knownTeams,
      years: [...new Set(years)].sort((a, b) => a - b),
      currentTeam: row.team_name ?? null,
    }]
  } catch {
    return []
  }
}

async function resolvePlayerRowsFromRegisteredFacts(
  database: QueryDatabase,
  aliases: string[],
): Promise<Array<{ player_id: string; full_name: string | null; team_name: string | null; year_teams_json: string | null }> | null> {
  const values: string[] = []
  const clauses = aliases.map((alias) => {
    values.push(normalizeIdentityKey(alias))
    return `(LENGTH(${identityNameSql('person_names.name')}) >= 3 AND ? LIKE ${identityNameSql('person_names.name')} || '%')`
  })
  if (clauses.length === 0) return []
  try {
    return await database.prepare(
      `SELECT player_id, full_name, team_name, NULL AS year_teams_json
         FROM (
           SELECT batting_line_facts.player_id, person_names.name AS full_name,
                  teams.team_name, game_facts.year
             FROM person_names
             INNER JOIN batting_line_facts INDEXED BY idx_batting_name_game ON batting_line_facts.player_name_id = person_names.name_id
             INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id
             INNER JOIN teams ON teams.team_id = batting_line_facts.team_id
            WHERE batting_line_facts.player_id IS NOT NULL AND (${clauses.join(' OR ')})
           UNION ALL
           SELECT pitching_line_facts.pitcher_id, person_names.name,
                  teams.team_name, game_facts.year
             FROM person_names
             INNER JOIN pitching_line_facts INDEXED BY idx_pitching_name_game ON pitching_line_facts.pitcher_name_id = person_names.name_id
             INNER JOIN game_facts ON game_facts.game_id = pitching_line_facts.game_id
             INNER JOIN teams ON teams.team_id = pitching_line_facts.team_id
            WHERE pitching_line_facts.pitcher_id IS NOT NULL AND (${clauses.join(' OR ')})
           UNION ALL
           SELECT roster_entry_facts.player_id, person_names.name,
                  teams.team_name, game_facts.year
             FROM person_names
             INNER JOIN roster_entry_facts INDEXED BY idx_roster_name_game ON roster_entry_facts.player_name_id = person_names.name_id
             INNER JOIN game_facts ON game_facts.game_id = roster_entry_facts.game_id
             INNER JOIN teams ON teams.team_id = roster_entry_facts.team_id
            WHERE roster_entry_facts.player_id IS NOT NULL AND (${clauses.join(' OR ')})
         )
        ORDER BY LENGTH(${identityNameSql('full_name')}) DESC, year DESC
        LIMIT 30`,
    ).all(...values, ...values, ...values) as Array<{ player_id: string; full_name: string | null; team_name: string | null; year_teams_json: string | null }>
  } catch (error) {
    console.warn('Registered player fact lookup failed', error)
    return null
  }
}

async function resolvePlayerRowsFromNormalizedFacts(
  database: QueryDatabase,
  aliases: string[],
): Promise<Array<{ player_id: string; full_name: string | null; team_name: string | null; year_teams_json: string | null }> | null> {
  const values: string[] = []
  const clauses = aliases.map((alias) => {
    const compact = normalizeIdentityKey(alias)
    values.push(compact, `${compact}%`, compact)
    return `(${identityNameSql('person_names.name')} = ? OR ${identityNameSql('person_names.name')} LIKE ? OR (LENGTH(${identityNameSql('person_names.name')}) >= 2 AND ? LIKE ${identityNameSql('person_names.name')} || '%'))`
  })
  if (clauses.length === 0) return []
  try {
    return await database.prepare(
      `SELECT player_id, full_name, team_name, NULL AS year_teams_json
         FROM (
           SELECT batting_line_facts.player_id AS player_id,
                  person_names.name AS full_name,
                  teams.team_name AS team_name,
                  game_facts.year AS year
             FROM person_names
             INNER JOIN batting_line_facts INDEXED BY idx_batting_name_game ON batting_line_facts.player_name_id = person_names.name_id
             INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id
             INNER JOIN teams ON teams.team_id = batting_line_facts.team_id
            WHERE batting_line_facts.player_id IS NOT NULL AND (${clauses.join(' OR ')})
           UNION ALL
           SELECT pitching_line_facts.pitcher_id AS player_id,
                  person_names.name AS full_name,
                  teams.team_name AS team_name,
                  game_facts.year AS year
             FROM person_names
             INNER JOIN pitching_line_facts INDEXED BY idx_pitching_name_game ON pitching_line_facts.pitcher_name_id = person_names.name_id
             INNER JOIN game_facts ON game_facts.game_id = pitching_line_facts.game_id
             INNER JOIN teams ON teams.team_id = pitching_line_facts.team_id
            WHERE pitching_line_facts.pitcher_id IS NOT NULL AND (${clauses.join(' OR ')})
           UNION ALL
           SELECT roster_entry_facts.player_id AS player_id,
                  person_names.name AS full_name,
                  teams.team_name AS team_name,
                  game_facts.year AS year
             FROM person_names
             INNER JOIN roster_entry_facts INDEXED BY idx_roster_name_game ON roster_entry_facts.player_name_id = person_names.name_id
             INNER JOIN game_facts ON game_facts.game_id = roster_entry_facts.game_id
             INNER JOIN teams ON teams.team_id = roster_entry_facts.team_id
            WHERE roster_entry_facts.player_id IS NOT NULL AND (${clauses.join(' OR ')})
         )
        ORDER BY LENGTH(${identityNameSql('full_name')}) DESC, year DESC
        LIMIT 30`,
    ).all(...values, ...values, ...values) as Array<{ player_id: string; full_name: string | null; team_name: string | null; year_teams_json: string | null }>
  } catch (error) {
    console.warn('Normalized player fact lookup failed', error)
    return null
  }
}

async function resolvePlayerIdsFromAliases(
  database: QueryDatabase,
  aliases: string[],
): Promise<ProfileMatch[]> {
  const normalizedAliases = uniqueStrings(aliases.map((alias) => normalizeIdentityKey(alias)))
  if (normalizedAliases.length === 0) {
    return []
  }
  const values = normalizedAliases.flatMap((alias) => [alias, alias])
  const clauses = normalizedAliases.map(() =>
    `(${identityNameSql('player_aliases.alias')} = ? OR ${identityNameSql('player_aliases.normalized_alias')} = ?)`,
  )
  try {
    const rows = await database
      .prepare(
        `SELECT
          player_profiles.player_id,
          COALESCE(player_profiles.canonical_name, player_profiles.full_name) AS full_name,
          player_profiles.team_name,
          player_profiles.year_teams_json,
          player_profiles.current_team,
          player_aliases.season_from,
          player_aliases.season_to
        FROM player_aliases
        INNER JOIN player_profiles ON player_profiles.player_id = player_aliases.player_id
        WHERE ${clauses.join(' OR ')}
        LIMIT 50`,
      )
      .all(...values) as Array<{
      player_id: string
      full_name: string | null
      team_name: string | null
      year_teams_json: string | null
      current_team: string | null
      season_from: number | null
      season_to: number | null
    }>
    return mergeProfileMatches(
      rows.map((row) => {
        const knownTeams = row.team_name ? [row.team_name] : []
        const years: number[] = []
        if (row.season_from && row.season_to && row.season_from <= row.season_to) {
          for (let year = row.season_from; year <= row.season_to; year += 1) {
            years.push(year)
          }
        }
        try {
          const yearTeams = JSON.parse(row.year_teams_json ?? '{}') as Record<string, string>
          for (const [year, team] of Object.entries(yearTeams)) {
            if (team) knownTeams.push(team)
            const parsedYear = Number(year)
            if (Number.isFinite(parsedYear)) {
              years.push(parsedYear)
            }
          }
        } catch {
          // ignore parse errors
        }
        return {
          player_id: row.player_id,
          fullName: row.full_name,
          knownTeams: [...new Set(knownTeams.filter(Boolean))],
          years: [...new Set(years)].sort((a, b) => a - b),
          currentTeam: row.current_team,
        }
      }),
      [],
    )
  } catch {
    return []
  }
}

async function resolvePlayerRowsFromIdSources(
  database: QueryDatabase,
  aliases: string[],
): Promise<Array<{ player_id: string; full_name: string | null; team_name: string | null; year_teams_json: string | null }>> {
  const values: string[] = []
  const clauses = aliases.map((alias) => {
    const compact = alias.replace(/[ \u3000]/gu, '')
    values.push(compact, `${compact}%`, compact)
    return `(compact_name = ? OR compact_name LIKE ? OR (LENGTH(compact_name) >= 3 AND ? LIKE compact_name || '%'))`
  })
  if (clauses.length === 0) {
    return []
  }
  const rows: Array<{ player_id: string; full_name: string | null; team_name: string | null; year_teams_json: string | null; year: number }> = []
  for (const table of ['current_team_roster', 'player_batting_stats', 'player_pitching_stats', 'player_fielding_stats']) {
    try {
      rows.push(...await database.prepare(
        `SELECT player_id, player_name AS full_name, team_name,
                NULL AS year_teams_json, year
           FROM ${table}
          WHERE player_id IS NOT NULL AND player_id <> ''
            AND (${clauses.map((clause) => clause.replaceAll('compact_name', identityNameSql('player_name'))).join(' OR ')})
          ORDER BY year DESC
          LIMIT 30`,
      ).all(...values) as typeof rows)
    } catch {
      // A compatibility source can be absent during rolling schema upgrades.
      // Keep candidates from the other Repository sources.
    }
  }
  return rows.sort((left, right) => right.year - left.year).slice(0, 30)
}

export async function searchPlayerCandidates(
  database: QueryDatabase,
  filters: SearchPlayerCandidatesFilters,
): Promise<PlayerCandidate[]> {
  const aliases = uniqueStrings([filters.name, ...(filters.aliases ?? [])])
  if (aliases.length === 0) {
    return []
  }

  const isShortIdentityInput = normalizeIdentityKey(filters.name).length <= 2
  const profileMatches = mergeProfileMatches(
    await resolvePlayerIdsFromProfiles(database, [filters.name]),
    await resolvePlayerIdsFromAliases(database, aliases),
  )
  const profilePlayerIds = profileMatches.map((m) => m.player_id)
  if (profileMatches.length > 1 && !filters.latestOnly && !isShortIdentityInput) {
    return profileMatches.map((profile) => ({
      player_id: profile.player_id,
      name: profile.fullName ?? filters.name,
      primary_team: profile.currentTeam,
      roles: ['profile'],
      teams: [...new Set([...profile.knownTeams, profile.currentTeam].filter(Boolean) as string[])],
      years: profile.years,
      match_kind: 'profile',
    } as PlayerCandidate & { match_kind: 'profile' }))
  }
  if (profileMatches.length === 1 && !filters.latestOnly && !isShortIdentityInput) {
    const profile = profileMatches[0]!
    const inferredRoles = await inferPlayerRoles(database, profile.player_id)
    return [{
      player_id: profile.player_id,
      name: profile.fullName ?? filters.name,
      primary_team: profile.currentTeam,
      roles: ['profile', ...inferredRoles],
      teams: [...new Set([...profile.knownTeams, profile.currentTeam].filter(Boolean) as string[])],
      years: profile.years,
      match_kind: 'profile',
    } as PlayerCandidate & { match_kind: 'profile' }]
  }

  const rows: RawPlayerMention[] = []
  const normalizedRows = await queryNormalizedPlayerMentions(database, aliases, filters)
  if (normalizedRows !== null) {
    rows.push(...normalizedRows)
  }
  if (normalizedRows === null && filters.searchDomain === 'all') {
    rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
      sql: 'SELECT current_team_roster.player_name AS name, current_team_roster.player_id AS player_url, ? AS role, current_team_roster.team_name AS team, current_team_roster.year AS year FROM current_team_roster',
      role: 'bis_roster',
      nameColumn: 'current_team_roster.player_name',
      yearColumn: 'current_team_roster.year',
    }))
  }
  if (normalizedRows === null && filters.searchDomain !== 'pitching') {
    rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
      sql: 'SELECT player_batting_stats.player_name AS name, player_batting_stats.player_id AS player_url, ? AS role, player_batting_stats.team_name AS team, player_batting_stats.year AS year FROM player_batting_stats',
      role: 'bis_batting',
      nameColumn: 'player_batting_stats.player_name',
      yearColumn: 'player_batting_stats.year',
    }))
  }
  if (normalizedRows === null && filters.searchDomain !== 'batting') {
    const bisRows = await queryRawPlayerMentions(database, aliases, filters, {
      sql: 'SELECT player_pitching_stats.player_name AS name, player_pitching_stats.player_id AS player_url, ? AS role, player_pitching_stats.team_name AS team, player_pitching_stats.year AS year FROM player_pitching_stats',
      role: 'bis_pitching',
      nameColumn: 'player_pitching_stats.player_name',
      yearColumn: 'player_pitching_stats.year',
    })
    rows.push(...bisRows)
  }
  if (normalizedRows === null && filters.includeEvents !== false) {
    if (filters.searchDomain !== 'pitching') {
      rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
        sql: `SELECT events.batter_name AS name, COALESCE(NULLIF(events.batter_url, ''), CASE WHEN json_valid(events.event_attributes_json) THEN json_extract(events.event_attributes_json, '$.batter_links[0].url') ELSE NULL END) AS player_url, ? AS role, events.offense_team AS team, games.year AS year FROM events INNER JOIN games ON games.game_id = events.game_id`,
        role: 'batter',
        nameColumn: 'events.batter_name',
        yearColumn: 'games.year',
      }))
    }
    if (filters.searchDomain !== 'batting') {
      rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
        sql: 'SELECT events.pitcher_name AS name, NULLIF(events.pitcher_url, \'\') AS player_url, ? AS role, NULL AS team, games.year AS year FROM events INNER JOIN games ON games.game_id = events.game_id',
        role: 'pitcher',
        nameColumn: 'events.pitcher_name',
        yearColumn: 'games.year',
      }))
    }
    rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
      sql: 'SELECT events.runner_name AS name, NULLIF(events.runner_url, \'\') AS player_url, ? AS role, events.offense_team AS team, games.year AS year FROM events INNER JOIN games ON games.game_id = events.game_id',
      role: 'runner',
      nameColumn: 'events.runner_name',
      yearColumn: 'games.year',
    }))
  }
  if (normalizedRows === null && filters.searchDomain !== 'pitching') {
    rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
      sql: 'SELECT batting_lines.player_name AS name, NULLIF(batting_lines.player_url, \'\') AS player_url, ? AS role, batting_lines.team AS team, games.year AS year FROM batting_lines INNER JOIN games ON games.game_id = batting_lines.game_id',
      role: 'batter',
      nameColumn: 'batting_lines.player_name',
      yearColumn: 'games.year',
    }))
  }
  if (normalizedRows === null && filters.searchDomain !== 'batting') {
    rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
      sql: 'SELECT pitching_lines.pitcher_name AS name, NULLIF(pitching_lines.pitcher_url, \'\') AS player_url, ? AS role, pitching_lines.team AS team, games.year AS year FROM pitching_lines INNER JOIN games ON games.game_id = pitching_lines.game_id',
      role: 'pitcher',
      nameColumn: 'pitching_lines.pitcher_name',
      yearColumn: 'games.year',
    }))
  }
  if (normalizedRows === null && filters.searchDomain === 'all') {
    rows.push(...await queryRawPlayerMentions(database, aliases, filters, {
      sql: 'SELECT roster_entries.player_name AS name, NULLIF(roster_entries.player_url, \'\') AS player_url, ? AS role, roster_entries.team AS team, games.year AS year FROM roster_entries INNER JOIN games ON games.game_id = roster_entries.game_id',
      role: 'roster',
      nameColumn: 'roster_entries.player_name',
      yearColumn: 'games.year',
    }))
  }

  const candidateRows = filters.latestOnly ? latestMentionRows(rows) : rows
  let candidates = mergeFallbackCandidates(groupPlayerMentions(candidateRows, aliases))

  if (profilePlayerIds.length > 0 && !isShortIdentityInput) {
    // When we know exactly which player the input refers to (unique profile match),
    // only keep candidates that are that player.
    const idFiltered = candidates
      .filter((c) => c.player_id && profilePlayerIds.includes(c.player_id))
      .map((c) => ({
        ...c,
        name: profileMatches.find((profile) => profile.player_id === c.player_id)?.fullName ?? c.name,
        match_kind: 'profile',
      }))
    if (idFiltered.length > 0) {
      candidates = idFiltered
    } else if (profilePlayerIds.length === 1) {
      // Historical batting/event rows often lack player_url links. Since the profile search
      // already uniquely identified one player, inject that player_id into name-only candidates
      // so downstream resolution (year-shift, team injection) can proceed correctly.
      // Guard: only inject if the candidate's team is compatible with the profile's known teams.
      // This prevents e.g. "大谷翔平" (日本ハム 2013-2017) from being injected onto a
      // different surname-only pitcher "大谷" at ロッテ who has no URL link.
      const knownPlayerId = profilePlayerIds[0]!
      const knownTeams = profileMatches[0]!.knownTeams
      // Compute canonical team aliases from the profile (e.g. "読 売" → "巨人") so that
      // downstream team filters in the resolution layer can match transferred players correctly.
      const canonicalTeams = [...new Set(knownTeams.map(teamAliasKey))]
      candidates = candidates
        .filter((c) => !c.player_id)
        .filter((c) => {
          if (knownTeams.length === 0 || c.teams.length === 0) return true
          return c.teams.some((t) => knownTeams.some((kt) => sameTeamAlias(kt, t)))
        })
        .map((c) => ({
          ...c,
          player_id: knownPlayerId,
          name: profileMatches[0]!.fullName ?? c.name,
          teams: [...new Set([...c.teams, ...canonicalTeams])],
          match_kind: 'profile',
        }))
    } else {
      candidates = idFiltered
    }

    // Override primary_team with player_profiles.team_name (the official current registration)
    // when a unique profile match exists. This takes precedence over the data-derived latestTeam
    // because the profile reflects the player's current NPB registration regardless of which
    // historical year's data dominates the search results.
    const profileCurrentTeam = profileMatches[0]?.currentTeam
    if (profileCurrentTeam && profilePlayerIds.length === 1) {
      candidates = candidates.map((c) =>
        c.player_id === profilePlayerIds[0] ? { ...c, primary_team: profileCurrentTeam } : c,
      )
    }
  } else {
    // No profile found for the input (player not in current NPB registry).
    // For full-name inputs (>2 compact chars), filter out all player_id candidates whose
    // profile name is incompatible with the input. This prevents "村上宗隆" from resolving
    // to "村上 頌樹" (13315153, 阪神) — a different player who happens to share the surname.
    const playerIdsToCheck = [...new Set(
      candidates.filter((c) => c.player_id).map((c) => c.player_id as string),
    )]
    if (playerIdsToCheck.length > 0) {
      const inputCompact = filters.name.replace(/[ \u3000]/gu, '')
      const profileNames = await fetchProfileNamesForIds(database, playerIdsToCheck)
      candidates = candidates.filter((c) => {
        if (!c.player_id) return true
        const profileFullName = profileNames.get(c.player_id)
        if (!profileFullName) return true
        const profileCompact = profileFullName.replace(/[ \u3000]/gu, '')
        return inputCompact.startsWith(profileCompact) || profileCompact.startsWith(inputCompact)
      })
    }
  }

  return candidates.slice(0, filters.limit ?? 10)
}

type RawPlayerMention = {
  name: string | null
  player_url: string | null
  role: string
  team: string | null
  year: number
}

/**
 * The normalized database stores a name once in person_names and references its
 * numeric id from each fact table. Resolve the (small) name dimension first so
 * SQLite/D1 can use the existing *_name_game indexes. Querying the compatibility
 * views with REPLACE/LIKE applies the expression to every fact row and can exceed
 * the Worker request deadline on production-sized data.
 *
 * null means this is a legacy database without normalized physical tables; an
 * empty array is a successful normalized lookup with no matches.
 */
async function queryNormalizedPlayerMentions(
  database: QueryDatabase,
  aliases: string[],
  filters: SearchPlayerCandidatesFilters,
): Promise<RawPlayerMention[] | null> {
  // Event identity resolution also needs batter/pitcher/runner evidence and its
  // historical same-person collapsing. Keep that established path unchanged.
  if (filters.includeEvents !== false) return null
  const nameValues: string[] = []
  const nameClauses = aliases.map((alias) => {
    const compact = normalizeIdentityKey(alias)
    nameValues.push(compact, `%${compact}%`, compact)
    return `(${identityNameSql('person_names.name')} = ? OR ${identityNameSql('person_names.name')} LIKE ? OR (SUBSTR(?, 1, LENGTH(${identityNameSql('person_names.name')})) = ${identityNameSql('person_names.name')} AND LENGTH(${identityNameSql('person_names.name')}) >= 2))`
  })
  if (nameClauses.length === 0) return []

  const yearClauses: string[] = []
  const yearValues: number[] = []
  if (filters.year) {
    yearClauses.push('game_facts.year = ?')
    yearValues.push(filters.year)
  }
  if (filters.year_from) {
    yearClauses.push('game_facts.year >= ?')
    yearValues.push(filters.year_from)
  }
  if (filters.year_to) {
    yearClauses.push('game_facts.year <= ?')
    yearValues.push(filters.year_to)
  }
  const whereYear = yearClauses.length > 0 ? ` AND ${yearClauses.join(' AND ')}` : ''
  const sources: Array<{ sql: string, role: string }> = []
  if (filters.searchDomain !== 'pitching') {
    sources.push({
      role: 'batter',
      sql: `SELECT person_names.name AS name,
              CASE WHEN batting_line_facts.player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || batting_line_facts.player_id || '.html' ELSE NULL END AS player_url,
              ? AS role, teams.team_name AS team, game_facts.year AS year
            FROM person_names
            INNER JOIN batting_line_facts INDEXED BY idx_batting_name_game ON batting_line_facts.player_name_id = person_names.name_id
            INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id
            INNER JOIN teams ON teams.team_id = batting_line_facts.team_id
           WHERE (${nameClauses.join(' OR ')})${whereYear}`,
    })
  }
  if (filters.searchDomain !== 'batting') {
    sources.push({
      role: 'pitcher',
      sql: `SELECT person_names.name AS name,
              CASE WHEN pitching_line_facts.pitcher_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || pitching_line_facts.pitcher_id || '.html' ELSE NULL END AS player_url,
              ? AS role, teams.team_name AS team, game_facts.year AS year
            FROM person_names
            INNER JOIN pitching_line_facts INDEXED BY idx_pitching_name_game ON pitching_line_facts.pitcher_name_id = person_names.name_id
            INNER JOIN game_facts ON game_facts.game_id = pitching_line_facts.game_id
            INNER JOIN teams ON teams.team_id = pitching_line_facts.team_id
           WHERE (${nameClauses.join(' OR ')})${whereYear}`,
    })
  }
  if (filters.searchDomain === 'all') {
    sources.push({
      role: 'roster',
      sql: `SELECT person_names.name AS name,
              CASE WHEN roster_entry_facts.player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || roster_entry_facts.player_id || '.html' ELSE NULL END AS player_url,
              ? AS role, teams.team_name AS team, game_facts.year AS year
            FROM person_names
            INNER JOIN roster_entry_facts INDEXED BY idx_roster_name_game ON roster_entry_facts.player_name_id = person_names.name_id
            INNER JOIN game_facts ON game_facts.game_id = roster_entry_facts.game_id
            INNER JOIN teams ON teams.team_id = roster_entry_facts.team_id
           WHERE (${nameClauses.join(' OR ')})${whereYear}`,
    })
  }

  const rows: RawPlayerMention[] = []
  try {
    for (const source of sources) {
      rows.push(...await database
        .prepare(`${source.sql} LIMIT ?`)
        .all(source.role, ...nameValues, ...yearValues, Math.max((filters.limit ?? 10) * 50, 200)) as RawPlayerMention[])
    }
    return rows
  } catch {
    return null
  }
}

async function queryRawPlayerMentions(
  database: QueryDatabase,
  aliases: string[],
  filters: SearchPlayerCandidatesFilters,
  source: {
    sql: string
    role: string
    nameColumn: string
    yearColumn: string
  },
): Promise<RawPlayerMention[]> {
  const values: Array<string | number> = [source.role]
  const clauses = [`${source.nameColumn} IS NOT NULL`, `${source.nameColumn} <> ''`]
  clauses.push(`(${
    aliases.map((alias) => {
      const compact = normalizeIdentityKey(alias)
      values.push(compact, `%${compact}%`, compact)
      return `(${identityNameSql(source.nameColumn)} = ? OR ${identityNameSql(source.nameColumn)} LIKE ? OR (SUBSTR(?, 1, LENGTH(${identityNameSql(source.nameColumn)})) = ${identityNameSql(source.nameColumn)} AND LENGTH(${identityNameSql(source.nameColumn)}) >= 2))`
    }).join(' OR ')
  })`)
  if (filters.year) {
    clauses.push(`${source.yearColumn} = ?`)
    values.push(filters.year)
  }
  if (filters.year_from) {
    clauses.push(`${source.yearColumn} >= ?`)
    values.push(filters.year_from)
  }
  if (filters.year_to) {
    clauses.push(`${source.yearColumn} <= ?`)
    values.push(filters.year_to)
  }

  return await database
    .prepare(`${source.sql} WHERE ${clauses.join(' AND ')} LIMIT ?`)
    .all(...values, Math.max((filters.limit ?? 10) * 50, 200)) as RawPlayerMention[]
}

function groupPlayerMentions(rows: RawPlayerMention[], aliases: string[]): PlayerCandidate[] {
  const groups = new Map<string, {
    player_id: string | null
    name: string
    roles: string[]
    teams: string[]
    teamYears: Array<{ team: string; year: number }>
    years: number[]
  }>()

  for (const row of rows) {
    const name = row.name?.trim()
    if (!name) {
      continue
    }
    const playerId = normalizePlayerId(row.player_url)
    const key = playerId ?? `${name}|${row.team ?? ''}`
    const group = groups.get(key) ?? {
      player_id: playerId,
      name,
      roles: [],
      teams: [],
      teamYears: [],
      years: [],
    }
    group.roles.push(row.role)
    if (row.team) {
      group.teams.push(row.team)
      if (Number.isFinite(row.year)) {
        group.teamYears.push({ team: row.team, year: Number(row.year) })
      }
    }
    if (Number.isFinite(row.year)) {
      group.years.push(Number(row.year))
    }
    groups.set(key, group)
  }

  return [...groups.values()]
    .map((group) => ({
      player_id: group.player_id,
      name: group.name,
      primary_team: latestTeam(group.teamYears),
      roles: unique(group.roles),
      teams: unique(group.teams),
      years: unique(group.years).sort((a, b) => a - b),
    }))
    .sort((left, right) => {
      const compactName = (s: string) => s.replace(/[ \u3000]/gu, '')
      const leftExact = aliases.some((a) => compactName(a) === compactName(left.name)) ? 0 : 1
      const rightExact = aliases.some((a) => compactName(a) === compactName(right.name)) ? 0 : 1
      if (leftExact !== rightExact) return leftExact - rightExact
      const leftId = left.player_id ? 0 : 1
      const rightId = right.player_id ? 0 : 1
      if (leftId !== rightId) return leftId - rightId
      return left.name.localeCompare(right.name, 'ja')
    })
}

function latestMentionRows(rows: RawPlayerMention[]): RawPlayerMention[] {
  const latestYear = Math.max(...rows.map((row) => Number(row.year)).filter(Number.isFinite))
  if (!Number.isFinite(latestYear)) {
    return rows
  }
  return rows.filter((row) => Number(row.year) === latestYear)
}

function normalizePlayerId(playerUrl: string | null): string | null {
  if (!playerUrl) {
    return null
  }
  const match = playerUrl.match(/\/players\/([^/]+)\.html/u)
  if (match?.[1]) {
    return match[1]
  }
  return playerUrl
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])]
}

function normalizeIdentityKey(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/﨑/gu, '崎')
    .replace(/髙/gu, '高')
    .replace(/濵/gu, '浜')
    .replace(/^[*＊+＋]+/u, '')
    .replace(/[・･.\-_\s\u3000]/gu, '')
    .toLowerCase()
}

function identityNameSql(column: string): string {
  return `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))`
}

function latestTeam(teamYears: Array<{ team: string; year: number }>): string | null {
  if (teamYears.length === 0) return null
  return teamYears.reduce((best, current) => current.year > best.year ? current : best).team
}

function mergeFallbackCandidates(candidates: PlayerCandidate[]): PlayerCandidate[] {
  const merged: PlayerCandidate[] = []

  // First pass: populate merged with all player_id candidates so they can act as merge targets
  for (const candidate of candidates) {
    if (candidate.player_id) {
      merged.push(candidate)
    }
  }

  // Second pass: try to fold no-player_id candidates into an existing player_id candidate
  for (const candidate of candidates) {
    if (candidate.player_id) {
      continue
    }

    const target = merged.find((current) =>
      current.player_id &&
      samePlayerName(current.name, candidate.name) &&
      candidate.teams.length > 0 &&
      candidate.teams.every((team) => current.teams.some((currentTeam) => sameTeamAlias(currentTeam, team))),
    )

    if (!target) {
      // Also try to fold into an existing no-player_id candidate with the same name and compatible team.
      // This handles BIS stats tables that store abbreviated vs full team names (e.g. "オリックス" vs "オリックス・バファローズ").
      // No-team candidates (e.g. pitcher events, which record no offense team) may come from a
      // different player sharing the same surname — require year overlap before merging.
      const noIdTarget = merged.find((current) =>
        !current.player_id &&
        samePlayerName(current.name, candidate.name) &&
        (candidate.teams.length === 0
          ? current.years.length === 0 || candidate.years.some((y) => current.years.includes(y))
          : candidate.teams.every((team) => current.teams.some((currentTeam) => sameTeamAlias(currentTeam, team)))),
      )
      if (noIdTarget) {
        noIdTarget.roles = unique([...noIdTarget.roles, ...candidate.roles])
        noIdTarget.teams = unique([...noIdTarget.teams, ...candidate.teams])
        noIdTarget.years = unique([...noIdTarget.years, ...candidate.years]).sort((a, b) => a - b)
        noIdTarget.primary_team ??= candidate.primary_team
      } else {
        merged.push(candidate)
      }
      continue
    }

    target.roles = unique([...target.roles, ...candidate.roles])
    target.teams = unique([...target.teams, ...candidate.teams])
    target.years = unique([...target.years, ...candidate.years]).sort((a, b) => a - b)
    target.primary_team ??= candidate.primary_team
  }
  return merged
}

function mergeProfileMatches(matches: ProfileMatch[], additional: ProfileMatch[]): ProfileMatch[] {
  const merged = new Map<string, ProfileMatch>()
  for (const match of [...matches, ...additional]) {
    const existing = merged.get(match.player_id)
    if (!existing) {
      merged.set(match.player_id, {
        ...match,
        knownTeams: [...match.knownTeams],
        years: [...match.years],
      })
      continue
    }
    existing.fullName ??= match.fullName
    existing.currentTeam ??= match.currentTeam
    existing.knownTeams = unique([...existing.knownTeams, ...match.knownTeams])
    existing.years = unique([...existing.years, ...match.years]).sort((a, b) => a - b)
  }
  return [...merged.values()]
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

async function inferPlayerRoles(database: QueryDatabase, playerId: string): Promise<Array<'batter' | 'pitcher'>> {
  const [battingRows, pitchingRows] = await Promise.all([
    database.prepare('SELECT COUNT(*) AS count FROM player_batting_stats WHERE player_id = ?').get(playerId) as Promise<{ count?: number } | undefined>,
    database.prepare('SELECT COUNT(*) AS count FROM player_pitching_stats WHERE player_id = ?').get(playerId) as Promise<{ count?: number } | undefined>,
  ])
  const roles: Array<'batter' | 'pitcher'> = []
  if (Number(battingRows?.count ?? 0) > 0) {
    roles.push('batter')
  }
  if (Number(pitchingRows?.count ?? 0) > 0) {
    roles.push('pitcher')
  }
  return roles
}

function samePlayerName(a: string, b: string): boolean {
  if (a === b) return true
  // Strip BIS annotation prefixes (*, ＊, +, ＋) and whitespace before comparing
  const normalize = (s: string) => s.replace(/^[*＊+＋\s\u3000]+/u, '').replace(/[\s\u3000]/gu, '')
  const na = normalize(a)
  const nb = normalize(b)
  return na === nb
}

function sameTeamAlias(left: string, right: string): boolean {
  return teamAliasKey(left) === teamAliasKey(right)
}

function teamAliasKey(team: string): string {
  const normalized = team.replace(/[・･.\-_\s\u3000]/gu, '')
  const aliases: Record<string, string> = {
    東京ヤクルトスワローズ: 'ヤクルト',
    東京ヤクルト: 'ヤクルト',
    ヤクルト: 'ヤクルト',
    オリックスバファローズ: 'オリックス',
    オリックス: 'オリックス',
    埼玉西武ライオンズ: '西武',
    埼玉西武: '西武',
    西武: '西武',
    読売ジャイアンツ: '巨人',
    読売: '巨人',
    巨人: '巨人',
    千葉ロッテマリーンズ: 'ロッテ',
    千葉ロッテ: 'ロッテ',
    ロッテ: 'ロッテ',
    福岡ソフトバンクホークス: 'ソフトバンク',
    福岡ソフトバンク: 'ソフトバンク',
    ソフトバンク: 'ソフトバンク',
    北海道日本ハムファイターズ: '日本ハム',
    北海道日本ハム: '日本ハム',
    日本ハム: '日本ハム',
    東北楽天ゴールデンイーグルス: '楽天',
    東北楽天: '楽天',
    楽天: '楽天',
    阪神タイガース: '阪神',
    阪神: '阪神',
    広島東洋カープ: '広島',
    広島東洋: '広島',
    広島: '広島',
    横浜DeNAベイスターズ: 'DeNA',
    横浜DeNA: 'DeNA',
    横浜: 'DeNA',
    DeNA: 'DeNA',
    中日ドラゴンズ: '中日',
    中日: '中日',
  }
  return aliases[normalized] ?? normalized
}
