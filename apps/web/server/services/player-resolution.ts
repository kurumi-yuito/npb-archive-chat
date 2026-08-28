import type { ChatStructuredQuery, PlayerCandidate } from '@npb/schemas'
import type { ChatQueryService } from '@npb/db'
import { normalizeFreeText } from './chat-query-normalizer'
import { buildAliases } from './player-alias'
import type { SearchPlayerCandidatesFilters } from '@npb/db'

export type PlayerResolution = {
  input: string
  player_id?: string | null
  name: string | null
  primary_team?: string | null
  status: 'resolved' | 'ambiguous' | 'not_found'
  candidates: PlayerCandidate[]
  yearShiftNote?: string
  teamCorrectionNote?: string
}

type InternalPlayerCandidate = PlayerCandidate & {
  match_kind?: 'profile'
}

type ResolutionTarget = {
  field: 'batter_name' | 'pitcher_name' | 'runner_name' | 'player_name'
  value: string
}

export async function resolveStructuredQueryPlayer(
  queryService: ChatQueryService,
  structuredQuery: ChatStructuredQuery,
): Promise<{ structuredQuery: ChatStructuredQuery; resolution: PlayerResolution | null }> {
  const target = findResolutionTarget(structuredQuery)
  if (!target) {
    return { structuredQuery, resolution: null }
  }

  const input = target.value
  const inputKey = normalizeLookupKey(input)
  const aliases = buildAliases(input)
  const hasTeamQualifier = teamQualifier(structuredQuery).length > 0
  const isUnqualifiedShortName = inputKey.length <= 2 && !hasTeamQualifier
  const searchDomain: SearchPlayerCandidatesFilters['searchDomain'] =
    isUnqualifiedShortName
      ? 'all'
      : target.field === 'batter_name'
      ? 'batting'
      : target.field === 'pitcher_name'
        ? 'pitching'
        : structuredQuery.intent === 'search_batting' || structuredQuery.intent === 'aggregate_batting'
    ? 'batting'
    : structuredQuery.intent === 'search_pitching' || structuredQuery.intent === 'aggregate_pitching'
      ? 'pitching'
      : 'all'
  const candidateFilters = {
    // A season narrows records, not identity. For an unqualified surname, inspect
    // every covered season so a single current-season row cannot silently choose
    // one person among historical namesakes.
    ...(isUnqualifiedShortName ? {} : yearFilters(structuredQuery)),
    name: input,
    aliases,
    includeEvents: target.field === 'runner_name' || structuredQuery.intent === 'search_events' || structuredQuery.intent === 'aggregate_events',
    searchDomain,
    latestOnly: structuredQuery.intent === 'player_affiliation' && !hasExplicitYearFilter(structuredQuery),
    limit: 50,
  }
  const rawCandidates = await queryService.searchPlayerCandidates(candidateFilters)
  const repositoryEntityCandidates = selectRepositoryEntitiesForInput(input, rawCandidates)
  const hasUniqueRepositoryEntity = repositoryEntityCandidates.length === 1 && Boolean(repositoryEntityCandidates[0]?.player_id)
  const periodScopedCandidates = isUnqualifiedShortName
    ? preserveShortNameCandidates(repositoryEntityCandidates)
    : repositoryEntityCandidates
  let candidates = selectCandidatesForInput(
    input,
    collapseSameEntityFallbacks(
      filterCandidates(periodScopedCandidates, teamQualifier(structuredQuery)),
    ),
  )
  if (hasUniqueRepositoryEntity && !isUnqualifiedShortName && !hasTeamQualifier) {
    candidates = selectCandidatesForInput(input, repositoryEntityCandidates)
  }
  if (candidates.length === 0 && hasExplicitYearFilter(structuredQuery)) {
    const fallbackCandidates = await queryService.searchPlayerCandidates({
      name: candidateFilters.name,
      aliases,
      includeEvents: candidateFilters.includeEvents,
      searchDomain,
      limit: 50,
    })
    candidates = selectCandidatesForInput(
      input,
      collapseSameEntityFallbacks(
        filterCandidates(fallbackCandidates, teamQualifier(structuredQuery)),
      ),
    )
  }

  if (candidates.length === 0 && candidateFilters.latestOnly && teamQualifier(structuredQuery).length > 0) {
    const fallbackCandidates = await queryService.searchPlayerCandidates({
      name: candidateFilters.name,
      aliases,
      includeEvents: candidateFilters.includeEvents,
      searchDomain,
      limit: 50,
    })
    candidates = selectCandidatesForInput(
      input,
      collapseSameEntityFallbacks(
        filterCandidates(fallbackCandidates, teamQualifier(structuredQuery)),
      ),
    )
  }

  if (candidates.length === 0) {
    return {
      structuredQuery,
      resolution: { input, name: null, status: 'not_found', candidates: [] },
    }
  }

  if (candidates.length > 1) {
    return {
      structuredQuery,
      resolution: { input, player_id: null, name: null, primary_team: null, status: 'ambiguous', candidates },
    }
  }

  const candidate = candidates[0]!
  if (!candidate.player_id) {
    return {
      structuredQuery,
      resolution: { input, name: null, status: 'not_found', candidates },
    }
  }
  const resolvedQuery = replacePlayerFilter(structuredQuery, target.field, candidate)
  const yearShift = detectYearShift(structuredQuery, candidate)
  return {
    structuredQuery: yearShift ? applyYearShift(resolvedQuery, yearShift.targetYear) : resolvedQuery,
    resolution: {
      input,
      player_id: candidate.player_id,
      name: candidate.name,
      primary_team: candidate.primary_team,
      status: 'resolved',
      candidates,
      ...(yearShift ? { yearShiftNote: yearShift.note } : {}),
    },
  }
}

function selectRepositoryEntitiesForInput(input: string, candidates: PlayerCandidate[]): PlayerCandidate[] {
  const inputKey = normalizeLookupKey(input)
  const matching = candidates.filter((candidate) => {
    const candidateKey = normalizeCandidateName(candidate.name)
    return candidateKey === inputKey || candidateKey.startsWith(inputKey) || inputKey.startsWith(candidateKey)
  })
  const entityIds = [...new Set(matching.map((candidate) => candidate.player_id).filter(Boolean))]
  if (entityIds.length !== 1) return matching
  const entity = matching.find((candidate) => candidate.player_id === entityIds[0])
  return entity ? [entity] : matching
}

function preserveShortNameCandidates(candidates: PlayerCandidate[]): PlayerCandidate[] {
  // A season constrains facts, not identity. Keep every exact short-name entity
  // visible so a current-year row cannot silently select one namesake.
  return candidates
}

function detectYearShift(
  structuredQuery: ChatStructuredQuery,
  candidate: PlayerCandidate,
): { targetYear: number; note: string } | null {
  const filters = structuredQuery.filters as { year?: number; year_from?: number; year_to?: number }
  const requestedYear = filters.year
  if (!requestedYear || candidate.years.length === 0) {
    return null
  }
  if (candidate.years.includes(requestedYear)) {
    return null
  }
  const coveredYears = candidate.years.filter((year) => year >= 2016)
  if (coveredYears.length === 0) {
    return null
  }
  const latestYear = Math.max(...coveredYears)
  const yearGap = requestedYear - latestYear
  // Requested-year data is expected to be complete for the covered period; if the
  // player only appears in older years, treat it as a non-roster year and shift.
  const note = yearGap >= 1
    ? `${requestedYear}年はNPBに在籍していないため、代わりに最終在籍年（${latestYear}年）のデータを表示します。`
    : `${requestedYear}年の記録は確認できないため、代わりに最終確認年（${latestYear}年）のデータを表示します。`
  return { targetYear: latestYear, note }
}

function applyYearShift(structuredQuery: ChatStructuredQuery, targetYear: number): ChatStructuredQuery {
  return {
    ...structuredQuery,
    filters: {
      ...structuredQuery.filters,
      year: targetYear,
      year_from: undefined,
      year_to: undefined,
    },
  } as ChatStructuredQuery
}

function findResolutionTarget(structuredQuery: ChatStructuredQuery): ResolutionTarget | null {
  const filters = structuredQuery.filters as Record<string, unknown>
  for (const field of ['batter_name', 'pitcher_name', 'runner_name', 'player_name'] as const) {
    const value = filters[field]
    if (typeof value === 'string' && value.trim()) {
      return { field, value }
    }
  }
  return null
}

function replacePlayerFilter(
  structuredQuery: ChatStructuredQuery,
  field: ResolutionTarget['field'],
  candidate: PlayerCandidate,
): ChatStructuredQuery {
  const playerIdField = playerIdFilterField(field)
  return {
    ...structuredQuery,
    filters: {
      ...Object.fromEntries(Object.entries(structuredQuery.filters).filter(([key]) => key !== field)),
      ...(structuredQuery.intent === 'player_affiliation' ? { [field]: candidate.name } : {}),
      [playerIdField]: candidate.player_id,
    },
  } as ChatStructuredQuery
}

function playerIdFilterField(field: ResolutionTarget['field']): string {
  if (field === 'batter_name') {
    return 'batter_player_id'
  }
  if (field === 'pitcher_name') {
    return 'pitcher_player_id'
  }
  if (field === 'runner_name') {
    return 'runner_player_id'
  }
  return 'player_id'
}

function yearFilters(structuredQuery: ChatStructuredQuery): {
  year?: number
  year_from?: number
  year_to?: number
} {
  const filters = structuredQuery.filters as {
    year?: number
    year_from?: number
    year_to?: number
  }
  return {
    year: filters.year,
    year_from: filters.year_from,
    year_to: filters.year_to,
  }
}

function hasExplicitYearFilter(structuredQuery: ChatStructuredQuery): boolean {
  const filters = structuredQuery.filters as {
    year?: number
    year_from?: number
    year_to?: number
  }
  return Boolean(filters.year || filters.year_from || filters.year_to)
}

function teamQualifier(structuredQuery: ChatStructuredQuery): string[] {
  const team = (structuredQuery.filters as { team?: unknown }).team
  if (typeof team !== 'string' || !team.trim()) {
    return []
  }
  return [team]
}

function filterCandidates(
  candidates: PlayerCandidate[],
  teamAliases: string[],
): PlayerCandidate[] {
  if (teamAliases.length === 0) return candidates
  return candidates.filter((candidate) => {
    if (candidate.primary_team && teamAliases.some((team) => sameTeamAlias(team, candidate.primary_team!))) {
      return true
    }
    return candidate.teams.some((candidateTeam) =>
      teamAliases.some((team) => sameTeamAlias(team, candidateTeam)),
    )
  })
}

function normalizeCandidateName(name: string): string {
  // Strip BIS annotation prefixes (* ＊ + ＋) before lookup-key normalization.
  return normalizeLookupKey(name.replace(/^[*＊+＋\s\u3000]+/u, ''))
}

function selectCandidatesForInput(
  input: string,
  candidates: PlayerCandidate[],
): PlayerCandidate[] {
  const inputKey = normalizeLookupKey(normalizeFreeText(input) ?? input)
  const exact = candidates.filter((candidate) => normalizeCandidateName(candidate.name) === inputKey)
  if (inputKey.length <= 2) {
    const surnameCandidates = candidates.filter((candidate) =>
      normalizeCandidateName(candidate.name).startsWith(inputKey),
    )
    const explicitSurnameProfiles = surnameCandidates.filter((candidate) => {
      if (!candidate.player_id) return false
      const normalizedName = candidate.name.normalize('NFKC').replace(/^[*+\s]+/u, '')
      return normalizedName.startsWith(`${input.normalize('NFKC')} `)
    })
    const explicitSurnameProfileIds = [
      ...new Set(explicitSurnameProfiles.map((candidate) => candidate.player_id).filter(Boolean)),
    ]
    if (inputKey.length === 1 && exact.length === 0 && explicitSurnameProfileIds.length === 1) {
      return collapseSameEntityFallbacks(
        surnameCandidates.filter((candidate) => candidate.player_id === explicitSurnameProfileIds[0]),
        inputKey,
      )
    }
    if (exact.length > 0) {
      const prefixProfiles = surnameCandidates.filter((candidate) => candidate.player_id)
      const prefixProfileIds = [...new Set(prefixProfiles.map((candidate) => candidate.player_id).filter(Boolean))]
      if (
        prefixProfileIds.length === 1 &&
        prefixProfiles.every((candidate) => normalizeCandidateName(candidate.name) !== inputKey)
      ) {
        const profile = prefixProfiles.find((candidate) => candidate.player_id === prefixProfileIds[0])!
        return [{
          ...profile,
          roles: [...new Set([...profile.roles, ...exact.flatMap((candidate) => candidate.roles)])],
          teams: [...new Set([...profile.teams, ...exact.flatMap((candidate) => candidate.teams)])],
          years: [...new Set([...profile.years, ...exact.flatMap((candidate) => candidate.years)])].sort((a, b) => a - b),
        }]
      }
      const exactTeamKeys = new Set(exact.flatMap((candidate) => candidate.teams.map(teamAliasKey)))
      const compatibleProfiles = surnameCandidates.filter((candidate) =>
        candidate.player_id &&
        candidate.teams.some((team) => exactTeamKeys.has(teamAliasKey(team))),
      )
      const compatibleIds = [...new Set(compatibleProfiles.map((candidate) => candidate.player_id).filter(Boolean))]
      if (compatibleIds.length === 1 && exactTeamKeys.size === 1) {
        const compatibleCandidates = surnameCandidates.filter((candidate) =>
          candidate.player_id === compatibleIds[0] ||
          candidate.teams.some((team) => compatibleProfiles.some((profile) =>
            profile.teams.some((profileTeam) => sameTeamAlias(team, profileTeam)),
          )),
        )
        const collapsed = collapseSameEntityFallbacks(compatibleCandidates, inputKey)
        if (collapsed.length === 1) return collapsed
      }
      const collapsedExact = collapseSameEntityFallbacks(exact, inputKey)
      if (collapsedExact.length > 0) return collapsedExact
    }
    if (surnameCandidates.length > 0) {
      return collapseSameEntityFallbacks(surnameCandidates, inputKey)
    }
  }
  if (exact.length > 0) {
    return collapseSameEntityFallbacks(exact)
  }

  // A full-name input must never be satisfied by a surname-only row. Those rows
  // can belong to a different player even when the current filters leave only
  // one candidate (for example 村上宗隆 vs 阪神の村上). A candidate explicitly
  // linked to the unique profile/alias match remains valid even if its fact row
  // stores only the surname.
  if (inputKey.length > 2) {
    const profileMatches = candidates.filter((candidate) => {
      if ((candidate as InternalPlayerCandidate).match_kind !== 'profile') return false
      const nameKey = normalizeCandidateName(candidate.name)
      return nameKey === inputKey || (nameKey.length >= 3 && inputKey.startsWith(nameKey))
    })
    const collapsedProfiles = collapseSameEntityFallbacks(profileMatches)
    if (collapsedProfiles.length === 1) return collapsedProfiles
    const registeredNamePrefixes = candidates.filter((candidate) => {
      const nameKey = normalizeCandidateName(candidate.name)
      return nameKey.length >= 3 && inputKey.startsWith(nameKey)
    })
    if (registeredNamePrefixes.length === 0) return []
    const maxLength = Math.max(...registeredNamePrefixes.map(
      (candidate) => normalizeCandidateName(candidate.name).length,
    ))
    const longestPrefixes = registeredNamePrefixes.filter(
      (candidate) => normalizeCandidateName(candidate.name).length === maxLength,
    )
    const collapsedPrefixes = collapseSameEntityFallbacks(longestPrefixes)
    return collapsedPrefixes.length === 1 ? collapsedPrefixes : []
  }

  const surnameMatches = candidates.filter((candidate) => {
    const nameKey = normalizeCandidateName(candidate.name)
    return nameKey.length >= 1 && inputKey.startsWith(nameKey)
  })
  if (surnameMatches.length > 0) {
    const maxNameLength = Math.max(...surnameMatches.map((candidate) => normalizeCandidateName(candidate.name).length))
    const longestSurnameMatches = surnameMatches.filter((candidate) =>
      normalizeCandidateName(candidate.name).length === maxNameLength,
    )
    const collapsed = collapseSameEntityFallbacks(longestSurnameMatches)
    const profileMatches = collapsed.filter((candidate) => (candidate as InternalPlayerCandidate).match_kind === 'profile')
    if (profileMatches.length > 0) {
      return collapseSameEntityFallbacks(profileMatches)
    }
    if (collapsed.length === 1 && !collapsed[0]!.player_id) {
      return collapsed
    }
    const entityIds = [...new Set(collapsed.map((candidate) => candidate.player_id).filter(Boolean))]
    if (entityIds.length === 1 && collapsed.every((candidate) => candidate.player_id === entityIds[0])) {
      return collapsed
    }
    return []
  }

  return candidates
}

function collapseSameEntityFallbacks(candidates: PlayerCandidate[], shortInputKey?: string): PlayerCandidate[] {
  const entities = candidates.filter((candidate) => candidate.player_id)
  if (entities.length !== 1) {
    return candidates
  }

  const entity = { ...entities[0]!, roles: [...entities[0]!.roles], teams: [...entities[0]!.teams], years: [...entities[0]!.years] }
  const rest = candidates.filter((candidate) => candidate !== entities[0])
  const allFallbacksMatch = rest.every((candidate) =>
    candidate.player_id == null &&
    (candidate.name === entity.name || Boolean(
      shortInputKey &&
      normalizeCandidateName(candidate.name).startsWith(shortInputKey) &&
      normalizeCandidateName(entity.name).startsWith(shortInputKey)
    )) &&
    (
      // No-team candidates (e.g. pitcher events that record no offense team) could be from a
      // different player. Only collapse when their years overlap with the entity's years.
      candidate.teams.length === 0
        ? entity.years.length === 0 || candidate.years.some((y) => entity.years.includes(y))
        : candidate.teams.every((team) => entity.teams.some((entityTeam) => sameTeamAlias(entityTeam, team)))
    ),
  )
  if (!allFallbacksMatch) {
    return candidates
  }

  for (const candidate of rest) {
    entity.roles = [...new Set([...entity.roles, ...candidate.roles])]
    entity.teams = [...new Set([...entity.teams, ...candidate.teams])]
    entity.years = [...new Set([...entity.years, ...candidate.years])].sort((a, b) => a - b)
  }
  return [entity]
}

function sameTeamAlias(left: string, right: string): boolean {
  const leftKey = teamAliasKey(left)
  const rightKey = teamAliasKey(right)
  return leftKey === rightKey || leftKey.includes(rightKey) || rightKey.includes(leftKey)
}

function teamAliasKey(team: string): string {
  return normalizeLookupKey(team)
}

function normalizeLookupKey(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/﨑/gu, '崎')
    .replace(/髙/gu, '高')
    .replace(/濵/gu, '浜')
    .replace(/[・･.\-_\s\u3000]/gu, '')
    .toLowerCase()
}
