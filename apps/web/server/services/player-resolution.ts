import type { ChatStructuredQuery, PlayerCandidate } from '@npb/schemas'
import type { ChatQueryService } from '@npb/db'
import { normalizeFreeText } from './chat-query-normalizer'

export type PlayerResolution = {
  input: string
  player_id?: string | null
  name: string | null
  primary_team?: string | null
  status: 'resolved' | 'ambiguous' | 'not_found'
  candidates: PlayerCandidate[]
}

type ResolutionTarget = {
  field: 'batter_name' | 'pitcher_name' | 'runner_name' | 'player_name'
  value: string
}

const latinAliasEntries = [
  ['yamada', '山田'],
  ['tetsutoyamada', '山田'],
  ['yamadatetsuto', '山田'],
  ['takamatsu', '髙松'],
  ['takahashi', '高橋'],
  ['tanaka', '田中'],
  ['sato', '佐藤'],
  ['satoh', '佐藤'],
  ['saitoh', '齋藤'],
  ['saito', '齋藤'],
  ['suzuki', '鈴木'],
  ['nakamura', '中村'],
  ['kobayashi', '小林'],
  ['yoshida', '吉田'],
  ['yamamoto', '山本'],
  ['morishita', '森下'],
] as const

const playerAliasEntries = [
  ['高松', '髙松'],
  ['髙松', '髙松'],
] as const

const playerEntityAliasEntries = [
  ['山田哲人', { name: '山田', player_id: '91895133' }],
  ['山田哲', { name: '山田', player_id: '91895133' }],
  ['tetsutoyamada', { name: '山田', player_id: '91895133' }],
  ['yamadatetsuto', { name: '山田', player_id: '91895133' }],
] as const

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

const latinAliasMap = new Map<string, string>(latinAliasEntries)
const playerAliasMap = new Map(
  playerAliasEntries.map(([alias, canonical]) => [normalizeLookupKey(alias), canonical]),
)
const playerEntityAliasMap = new Map(
  playerEntityAliasEntries.map(([alias, entity]) => [normalizeLookupKey(alias), entity]),
)
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
  const entityAlias = entityAliasForPlayerInput(input)
  const aliases = aliasesForPlayerInput(input)
  const candidateFilters = {
    ...yearFilters(structuredQuery),
    name: entityAlias?.name ?? input,
    aliases,
    latestOnly: structuredQuery.intent === 'player_affiliation' && !hasExplicitYearFilter(structuredQuery),
    limit: 10,
  }
  const rawCandidates = await queryService.searchPlayerCandidates(candidateFilters)
  let candidates = selectCandidatesForInput(
    input,
    collapseSameEntityFallbacks(
      filterCandidates(rawCandidates, entityAlias, teamQualifier(structuredQuery)),
    ),
    entityAlias,
  )

  if (candidates.length === 0 && hasExplicitYearFilter(structuredQuery)) {
    const fallbackCandidates = await queryService.searchPlayerCandidates({
      name: candidateFilters.name,
      aliases,
      limit: 10,
    })
    candidates = selectCandidatesForInput(
      input,
      collapseSameEntityFallbacks(
        filterCandidates(fallbackCandidates, entityAlias, teamQualifier(structuredQuery)),
      ),
      entityAlias,
    )
  }

  if (candidates.length === 0) {
    return {
      structuredQuery,
      resolution: { input, name: null, status: 'not_found', candidates: [] },
    }
  }

  if (candidates.length > 1) {
    if (!hasExplicitYearFilter(structuredQuery)) {
      const mostRecent = pickMostRecentCandidate(candidates)
      if (mostRecent) {
        return {
          structuredQuery: replacePlayerFilter(structuredQuery, target.field, mostRecent),
          resolution: {
            input,
            player_id: mostRecent.player_id,
            name: mostRecent.name,
            primary_team: mostRecent.primary_team,
            status: 'resolved',
            candidates: [mostRecent],
          },
        }
      }
    }
    return {
      structuredQuery,
      resolution: { input, player_id: null, name: null, primary_team: null, status: 'ambiguous', candidates },
    }
  }

  const candidate = candidates[0]!
  return {
    structuredQuery: replacePlayerFilter(structuredQuery, target.field, candidate),
    resolution: {
      input,
      player_id: candidate.player_id,
      name: candidate.name,
      primary_team: candidate.primary_team,
      status: 'resolved',
      candidates,
    },
  }
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
      ...structuredQuery.filters,
      [field]: candidate.name,
      ...(candidate.player_id ? { [playerIdField]: candidate.player_id } : {}),
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

function aliasesForPlayerInput(input: string): string[] {
  const normalized = normalizeFreeText(input) ?? input
  const key = normalizeLookupKey(normalized)
  return [
    normalized,
    playerEntityAliasMap.get(key)?.name,
    playerAliasMap.get(key),
    latinAliasMap.get(key),
    ...displayNameFallbackAliases(normalized),
  ].filter(Boolean) as string[]
}

function displayNameFallbackAliases(input: string): string[] {
  const normalized = normalizeLookupKey(input)
  if (!/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+$/u.test(normalized)) {
    return []
  }
  if (normalized.length < 3) {
    return []
  }

  const aliases: string[] = []
  for (let length = normalized.length - 1; length >= 2; length -= 1) {
    aliases.push(normalized.slice(0, length))
  }
  return aliases
}

function entityAliasForPlayerInput(input: string): { name: string; player_id: string } | undefined {
  const normalized = normalizeFreeText(input) ?? input
  return playerEntityAliasMap.get(normalizeLookupKey(normalized))
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
  entityAlias: { name: string; player_id: string } | undefined,
  teamAliases: string[],
): PlayerCandidate[] {
  let filtered = candidates
  if (entityAlias) {
    filtered = filtered.filter((candidate) => candidate.player_id === entityAlias.player_id)
  }
  if (teamAliases.length > 0) {
    filtered = filtered.filter((candidate) =>
      candidate.teams.some((team) => teamAliases.includes(team)) ||
      (candidate.primary_team ? teamAliases.includes(candidate.primary_team) : false),
    )
  }
  return filtered
}

function selectCandidatesForInput(
  input: string,
  candidates: PlayerCandidate[],
  entityAlias: { name: string; player_id: string } | undefined,
): PlayerCandidate[] {
  if (entityAlias) {
    return candidates
  }

  const inputKey = normalizeLookupKey(normalizeFreeText(input) ?? input)
  const exact = candidates.filter((candidate) => normalizeLookupKey(candidate.name) === inputKey)
  if (exact.length > 0) {
    return collapseSameEntityFallbacks(exact)
  }

  const surnameMatches = candidates.filter((candidate) => {
    const nameKey = normalizeLookupKey(candidate.name)
    return nameKey.length >= 2 && inputKey.startsWith(nameKey)
  })
  if (surnameMatches.length > 0) {
    return collapseSameEntityFallbacks(surnameMatches)
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
      candidate.teams.length === 0 ||
      candidate.teams.every((team) => entity.teams.some((entityTeam) => sameTeamAlias(entityTeam, team)))
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

function pickMostRecentCandidate(candidates: PlayerCandidate[]): PlayerCandidate | null {
  const withMaxYear = candidates.map((c) => ({
    candidate: c,
    maxYear: c.years.length > 0 ? Math.max(...c.years) : 0,
  }))
  const topYear = Math.max(...withMaxYear.map((x) => x.maxYear))
  const topCandidates = withMaxYear.filter((x) => x.maxYear === topYear)
  return topCandidates.length === 1 ? topCandidates[0]!.candidate : null
}
