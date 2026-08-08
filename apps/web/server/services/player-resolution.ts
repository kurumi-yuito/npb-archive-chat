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
): Promise<{ structuredQuery: ChatStructuredQuery; resolution: PlayerResolution | null }> {
  const target = findResolutionTarget(structuredQuery)
  if (!target) {
    return { structuredQuery, resolution: null }
  }

  const input = target.value
  const aliases = buildAliases(input)
  const inputKey = normalizeLookupKey(input)
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
  let candidates = selectCandidatesForInput(
    input,
    collapseSameEntityFallbacks(
      filterCandidates(rawCandidates, teamQualifier(structuredQuery)),
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
  if (exact.length > 0) {
    return collapseSameEntityFallbacks(exact)
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

function collapseSameEntityFallbacks(candidates: PlayerCandidate[]): PlayerCandidate[] {
  const entities = candidates.filter((candidate) => candidate.player_id)
  if (entities.length !== 1) {
    return candidates
  }

  const entity = { ...entities[0]!, roles: [...entities[0]!.roles], teams: [...entities[0]!.teams], years: [...entities[0]!.years] }
  const rest = candidates.filter((candidate) => candidate !== entities[0])
  const allFallbacksMatch = rest.every((candidate) =>
    candidate.player_id == null &&
    candidate.name === entity.name &&
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
