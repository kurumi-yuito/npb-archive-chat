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

const verifiedRegisteredNameAliases: Record<string, { registeredName: string; teams: string[] }> = {
  村上宗隆: { registeredName: '村上', teams: ['東京ヤクルトスワローズ'] },
  大谷翔平: { registeredName: '大谷', teams: ['北海道日本ハムファイターズ'] },
  則本昂大: { registeredName: '則本', teams: ['読売ジャイアンツ', '東北楽天ゴールデンイーグルス'] },
  山川穂高: { registeredName: '山川', teams: ['福岡ソフトバンクホークス', '埼玉西武ライオンズ'] },
  近本光司: { registeredName: '近本', teams: ['阪神タイガース'] },
  坂倉将吾: { registeredName: '坂倉', teams: ['広島東洋カープ'] },
  山本由伸: { registeredName: '山本', teams: ['オリックス・バファローズ'] },
  佐々木朗希: { registeredName: '佐々木', teams: ['千葉ロッテマリーンズ'] },
  西川龍馬: { registeredName: '西川', teams: ['オリックス・バファローズ', '広島東洋カープ'] },
  田中将大: { registeredName: '田中将', teams: ['読売ジャイアンツ', '東北楽天ゴールデンイーグルス'] },
  丸佳浩: { registeredName: '丸', teams: ['読売ジャイアンツ', '広島東洋カープ'] },
  近藤健介: { registeredName: '近藤', teams: ['福岡ソフトバンクホークス', '北海道日本ハムファイターズ'] },
  藤浪晋太郎: { registeredName: '藤浪', teams: ['横浜DeNAベイスターズ', '阪神タイガース'] },
  石田裕太郎: { registeredName: '石田裕', teams: ['横浜DeNAベイスターズ'] },
  東克樹: { registeredName: '東', teams: ['横浜DeNAベイスターズ'] },
  山﨑伊織: { registeredName: '山﨑', teams: ['読売ジャイアンツ'] },
  山崎伊織: { registeredName: '山﨑', teams: ['読売ジャイアンツ'] },
  佐藤輝明: { registeredName: '佐藤', teams: ['阪神タイガース'] },
  牧秀悟: { registeredName: '牧', teams: ['横浜DeNAベイスターズ'] },
}

const teamAliasEntries = [
  ['ヤクルト', ['ヤクルト', '東京ヤクルトスワローズ']],
  ['東京ヤクルト', ['ヤクルト', '東京ヤクルトスワローズ']],
  ['swallows', ['ヤクルト', '東京ヤクルトスワローズ']],
  ['オリックス', ['オリックス', 'オリックス・バファローズ']],
  ['西武', ['西武', '埼玉西武ライオンズ']],
  ['巨人', ['巨人', '読売ジャイアンツ']],
  ['読売', ['巨人', '読売ジャイアンツ']],
  ['DeNA', ['DeNA', '横浜DeNAベイスターズ']],
  ['横浜', ['DeNA', '横浜DeNAベイスターズ']],
  ['横浜DeNA', ['DeNA', '横浜DeNAベイスターズ']],
  ['阪神', ['阪神', '阪神タイガース']],
  ['中日', ['中日', '中日ドラゴンズ']],
  ['広島', ['広島', '広島東洋カープ']],
  ['ロッテ', ['ロッテ', '千葉ロッテマリーンズ']],
  ['ソフトバンク', ['ソフトバンク', '福岡ソフトバンクホークス']],
  ['日本ハム', ['日本ハム', '北海道日本ハムファイターズ']],
  ['楽天', ['楽天', '東北楽天ゴールデンイーグルス']],
] as const

const teamAliasMap = new Map(
  teamAliasEntries.map(([alias, teams]) => [normalizeLookupKey(alias), teams]),
)

export async function resolveStructuredQueryPlayer(
  queryService: ChatQueryService,
  structuredQuery: ChatStructuredQuery,
  allowVerifiedAliasFallback = true,
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
  const periodScopedCandidates = isUnqualifiedShortName
    ? preserveShortNameCandidates(rawCandidates)
    : rawCandidates
  let candidates = selectCandidatesForInput(
    input,
    collapseSameEntityFallbacks(
      filterCandidates(periodScopedCandidates, teamQualifier(structuredQuery)),
    ),
  )
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
    const verifiedAlias = allowVerifiedAliasFallback
      ? verifiedRegisteredNameAliases[inputKey]
      : undefined
    if (verifiedAlias) {
      const explicitTeams = teamQualifier(structuredQuery)
      const hasCompatibleTeam = explicitTeams.length === 0 || explicitTeams.some((team) =>
        verifiedAlias.teams.some((knownTeam) => sameTeamAlias(team, knownTeam)),
      )
      if (hasCompatibleTeam) {
        const injectResolutionTeam = explicitTeams.length === 0
        const aliasQuery = {
          ...structuredQuery,
          filters: {
            ...structuredQuery.filters,
            [target.field]: verifiedAlias.registeredName,
            ...(injectResolutionTeam ? { team: verifiedAlias.teams[0] } : {}),
          },
        } as ChatStructuredQuery
        const aliasResolved = await resolveStructuredQueryPlayer(queryService, aliasQuery, false)
        const resolvedStructuredQuery = injectResolutionTeam &&
          (structuredQuery.intent === 'search_events' || structuredQuery.intent === 'aggregate_events')
          ? {
              ...aliasResolved.structuredQuery,
              filters: Object.fromEntries(
                Object.entries(aliasResolved.structuredQuery.filters).filter(([key]) => key !== 'team'),
              ),
            } as ChatStructuredQuery
          : aliasResolved.structuredQuery
        return {
          structuredQuery: resolvedStructuredQuery,
          resolution: aliasResolved.resolution
            ? { ...aliasResolved.resolution, input }
            : null,
        }
      }
    }
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
  const verifiedAlias = allowVerifiedAliasFallback
    ? verifiedRegisteredNameAliases[inputKey]
    : undefined
  if (!candidate.player_id && verifiedAlias && verifiedAlias.registeredName !== candidate.name) {
    const explicitTeams = teamQualifier(structuredQuery)
    const injectResolutionTeam = explicitTeams.length === 0
    const aliasQuery = {
      ...structuredQuery,
      filters: {
        ...structuredQuery.filters,
        [target.field]: verifiedAlias.registeredName,
        ...(injectResolutionTeam ? { team: verifiedAlias.teams[0] } : {}),
      },
    } as ChatStructuredQuery
    const aliasResolved = await resolveStructuredQueryPlayer(queryService, aliasQuery, false)
    if (aliasResolved.resolution?.status === 'resolved' && aliasResolved.resolution.player_id) {
      const resolvedStructuredQuery = injectResolutionTeam &&
        (structuredQuery.intent === 'search_events' || structuredQuery.intent === 'aggregate_events')
        ? {
            ...aliasResolved.structuredQuery,
            filters: Object.fromEntries(
              Object.entries(aliasResolved.structuredQuery.filters).filter(([key]) => key !== 'team'),
            ),
          } as ChatStructuredQuery
        : aliasResolved.structuredQuery
      return {
        structuredQuery: resolvedStructuredQuery,
        resolution: { ...aliasResolved.resolution, input },
      }
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
  const latestYear = Math.max(...candidate.years)
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
  const existingTeam = (structuredQuery.filters as Record<string, unknown>).team
  // Only inject primary_team when the player has appeared for a single canonical team throughout
  // their career. For multi-team careers (transfers, MLB stints), injecting the historical primary
  // would exclude records from other teams — the player name alone is the correct search key.
  const distinctTeamKeys = new Set(candidate.teams.map(teamAliasKey))
  const injectTeam = structuredQuery.intent !== 'player_affiliation' &&
    structuredQuery.intent !== 'search_events' &&
    structuredQuery.intent !== 'aggregate_events' &&
    candidate.primary_team &&
    !existingTeam &&
    distinctTeamKeys.size <= 1
    ? { team: candidate.primary_team }
    : {}
  return {
    ...structuredQuery,
    filters: {
      ...structuredQuery.filters,
      [field]: candidate.name,
      ...(candidate.player_id ? { [playerIdField]: candidate.player_id } : {}),
      ...injectTeam,
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
  const normalized = normalizeLookupKey(team)
  return [...(teamAliasMap.get(normalized) ?? [team])]
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
  return teamAliasKey(left) === teamAliasKey(right)
}

function teamAliasKey(team: string): string {
  const normalized = normalizeLookupKey(team)
  const aliases: Record<string, string> = {
    東京ヤクルトスワローズ: 'ヤクルト',
    ヤクルト: 'ヤクルト',
    オリックスバファローズ: 'オリックス',
    オリックス: 'オリックス',
    埼玉西武ライオンズ: '西武',
    西武: '西武',
    読売ジャイアンツ: '巨人',
    巨人: '巨人',
    横浜denaベイスターズ: 'dena',
    横浜dena: 'dena',
    dena: 'dena',
    横浜: 'dena',
    阪神タイガース: '阪神',
    阪神: '阪神',
    中日ドラゴンズ: '中日',
    中日: '中日',
    広島東洋カープ: '広島',
    広島: '広島',
    千葉ロッテマリーンズ: 'ロッテ',
    ロッテ: 'ロッテ',
    福岡ソフトバンクホークス: 'ソフトバンク',
    ソフトバンク: 'ソフトバンク',
    北海道日本ハムファイターズ: '日本ハム',
    日本ハム: '日本ハム',
    東北楽天ゴールデンイーグルス: '楽天',
    楽天: '楽天',
  }
  return aliases[normalized] ?? normalized
}

function normalizeLookupKey(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[・･.\-_\s\u3000]/gu, '')
    .toLowerCase()
}
