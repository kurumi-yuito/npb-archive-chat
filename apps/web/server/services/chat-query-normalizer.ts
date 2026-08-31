import {
  chatStructuredQuerySchema,
  type ChatStructuredQuery,
  type SearchEventsFilters,
} from '@npb/schemas'

const positionAliasEntries = [
  ['ショート', '遊'], ['遊撃', '遊'], ['遊撃手', '遊'], ['ss', '遊'],
  ['セカンド', '二'], ['二塁', '二'], ['二塁手', '二'], ['2b', '二'],
  ['サード', '三'], ['三塁', '三'], ['三塁手', '三'], ['3b', '三'],
  ['ファースト', '一'], ['一塁', '一'], ['一塁手', '一'], ['1b', '一'],
  ['キャッチャー', '捕'], ['捕手', '捕'], ['c', '捕'],
  ['ピッチャー', '投'], ['投手', '投'], ['p', '投'],
  ['レフト', '左'], ['左翼', '左'], ['左翼手', '左'], ['lf', '左'],
  ['センター', '中'], ['中堅', '中'], ['中堅手', '中'], ['cf', '中'],
  ['ライト', '右'], ['右翼', '右'], ['右翼手', '右'], ['rf', '右'],
  ['指名打者', '指'], ['dh', '指'],
] as const

const positionAliasMap = new Map(
  positionAliasEntries.map(([alias, canonical]) => [normalizeLookupKey(alias), canonical]),
)

export function normalizeChatStructuredQuery(
  structuredQuery: ChatStructuredQuery,
): ChatStructuredQuery {
  if (structuredQuery.intent === 'search_games') {
    return chatStructuredQuerySchema.parse({
      intent: 'search_games',
      filters: {
        ...structuredQuery.filters,
        team: normalizeTeamName(structuredQuery.filters.team),
        opponent: normalizeTeamName(structuredQuery.filters.opponent),
      },
    })
  }

  if (structuredQuery.intent === 'search_batting') {
    return chatStructuredQuerySchema.parse({
      intent: 'search_batting',
      filters: {
        ...structuredQuery.filters,
        team: normalizeTeamName(structuredQuery.filters.team),
        player_name: normalizePlayerName(structuredQuery.filters.player_name),
        player_names: normalizePlayerNames((structuredQuery.filters as { player_names?: string[] }).player_names),
        position: normalizePosition((structuredQuery.filters as { position?: string }).position),
      },
    })
  }

  if (structuredQuery.intent === 'search_pitching') {
    return chatStructuredQuerySchema.parse({
      intent: 'search_pitching',
      filters: {
        ...structuredQuery.filters,
        team: normalizeTeamName(structuredQuery.filters.team),
        pitcher_name: normalizePlayerName(structuredQuery.filters.pitcher_name),
        pitcher_names: normalizePlayerNames((structuredQuery.filters as { pitcher_names?: string[] }).pitcher_names),
      },
    })
  }

  if (structuredQuery.intent === 'search_roster') {
    return chatStructuredQuerySchema.parse({
      intent: 'search_roster',
      filters: {
        ...structuredQuery.filters,
        team: normalizeTeamName(structuredQuery.filters.team),
        player_name: normalizePlayerName(structuredQuery.filters.player_name),
        position: normalizePosition((structuredQuery.filters as { position?: string }).position),
      },
    })
  }

  if (structuredQuery.intent === 'player_affiliation') {
    return chatStructuredQuerySchema.parse({
      intent: 'player_affiliation',
      filters: {
        ...structuredQuery.filters,
        team: normalizeTeamName(structuredQuery.filters.team),
        player_name: normalizePlayerName(structuredQuery.filters.player_name),
        player_names: normalizePlayerNames((structuredQuery.filters as { player_names?: string[] }).player_names),
      },
    })
  }

  if (structuredQuery.intent === 'game_detail') {
    return chatStructuredQuerySchema.parse({
      intent: 'game_detail',
      filters: {
        ...structuredQuery.filters,
        team: normalizeTeamName(structuredQuery.filters.team),
        opponent: normalizeTeamName(structuredQuery.filters.opponent),
        player_name: normalizePlayerName(structuredQuery.filters.player_name),
      },
    })
  }

  if (structuredQuery.intent === 'aggregate_batting') {
    const normalizedTeam = normalizeTeamName(structuredQuery.filters.team)
    const normalizedPlayerName = normalizePlayerName(structuredQuery.filters.player_name)
    const normalizedPlayerNames = normalizePlayerNames((structuredQuery.filters as { player_names?: string[] }).player_names)
    const normalizedPlayerNamesCount = normalizedPlayerNames?.length ?? 0
    const filters = {
      ...structuredQuery.filters,
      ...(normalizedTeam ? { team: normalizedTeam } : {}),
      ...(normalizedPlayerName ? { player_name: normalizedPlayerName } : {}),
      ...(normalizedPlayerNamesCount > 0 ? { player_names: normalizedPlayerNames } : {}),
      ...(structuredQuery.filters.limit === undefined && (normalizedPlayerName || normalizedPlayerNamesCount > 0)
        ? { limit: 10 }
        : {}),
    }
    return chatStructuredQuerySchema.parse({
      intent: 'aggregate_batting',
      filters,
    })
  }

  if (structuredQuery.intent === 'aggregate_pitching') {
    return chatStructuredQuerySchema.parse({
      intent: 'aggregate_pitching',
      filters: {
        ...structuredQuery.filters,
        team: normalizeTeamName(structuredQuery.filters.team),
        pitcher_name: normalizePlayerName(structuredQuery.filters.pitcher_name),
        pitcher_names: normalizePlayerNames((structuredQuery.filters as { pitcher_names?: string[] }).pitcher_names),
      },
    })
  }

  if (structuredQuery.intent === 'off_topic') {
    return structuredQuery
  }

  if (structuredQuery.intent === 'aggregate_events') {
    return chatStructuredQuerySchema.parse({
      intent: 'aggregate_events',
      filters: {
        ...structuredQuery.filters,
        team: normalizeTeamName(structuredQuery.filters.team),
        batter_name: normalizePlayerName(structuredQuery.filters.batter_name),
        pitcher_name: normalizePlayerName(structuredQuery.filters.pitcher_name),
        runner_name: normalizePlayerName(structuredQuery.filters.runner_name),
        player_name: normalizePlayerName(structuredQuery.filters.player_name),
        result_text_contains: normalizeResultTextContains(structuredQuery.filters.result_text_contains),
        event_type: normalizeHomeRunEventType(structuredQuery.filters),
      },
    })
  }

  if (structuredQuery.intent === 'aggregate_games') {
    return chatStructuredQuerySchema.parse({
      intent: 'aggregate_games',
      filters: {
        ...structuredQuery.filters,
        team: normalizeTeamName(structuredQuery.filters.team),
        opponent: normalizeTeamName(structuredQuery.filters.opponent),
      },
    })
  }

  if (structuredQuery.intent === 'award_winners') {
    return chatStructuredQuerySchema.parse({
      intent: 'award_winners',
      filters: {
        ...structuredQuery.filters,
      },
    })
  }

  return chatStructuredQuerySchema.parse({
    intent: 'search_events',
    filters: {
      ...structuredQuery.filters,
      team: normalizeTeamName(structuredQuery.filters.team),
      batter_name: normalizePlayerName(structuredQuery.filters.batter_name),
      pitcher_name: normalizePlayerName(structuredQuery.filters.pitcher_name),
      runner_name: normalizePlayerName(structuredQuery.filters.runner_name),
      player_name: normalizePlayerName(structuredQuery.filters.player_name),
      result_text_contains: normalizeResultTextContains(structuredQuery.filters.result_text_contains),
      event_type: normalizeHomeRunEventType(structuredQuery.filters),
    },
  })
}

export function normalizeTeamName(value: string | undefined): string | undefined {
  const normalized = normalizeFreeText(value)
  if (!normalized) {
    return undefined
  }

  return normalized
    .replace(/^千葉ロッテマリーンズ$/u, 'ロッテ')
    .replace(/^阪神タイガーズ$/u, '阪神')
    .replace(/^タイガーズ$/u, '阪神')
}

export function messageMentionsTeam(message: string, team: string): boolean {
  const normalizedTeam = normalizeTeamName(team)
  if (!normalizedTeam) return false
  const messageKey = normalizeLookupKey(message)
  const teamKey = normalizeLookupKey(normalizedTeam)
  return messageKey.includes(teamKey) || teamKey.includes(messageKey)
}

export function normalizePlayerName(value: string | undefined): string | undefined {
  const normalized = normalizeFreeText(value)
  if (!normalized) {
    return undefined
  }

  // Planner output occasionally retains a conversational predicate as part of
  // the entity span. Keep this deliberately narrow: these are predicates, not
  // valid registered-name suffixes, and stripping them restores the entity
  // without weakening ambiguity handling for the remaining surname.
  const entityOnly = normalized
    .replace(/近ごろ見ない気$/u, '')
    .replace(/どう$/u, '')
    .replace(/投手$/u, '')
    .replace(/^([\p{Script=Han}々ヶ]{2,})選手$/u, '$1')
    .trim()

  return normalizeOrthographicVariants(entityOnly)
}

function normalizeOrthographicVariants(value: string): string {
  return value.replace(/﨑/gu, '崎').replace(/髙/gu, '高').replace(/濵/gu, '浜')
}

function normalizePlayerNames(value: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const normalized = value
    .map((name) => normalizePlayerName(name))
    .filter((name): name is string => Boolean(name))
  return normalized.length > 0 ? normalized : undefined
}

export function normalizePosition(value: string | undefined): string | undefined {
  const normalized = normalizeFreeText(value)
  if (!normalized) {
    return undefined
  }

  return positionAliasMap.get(normalizeLookupKey(normalized)) ?? normalized
}

function normalizeResultTextContains(value: string | undefined): string | undefined {
  const normalized = normalizeFreeText(value)
  if (!normalized) {
    return undefined
  }
  return /^(本|本塁打|ホームラン|HR)$/iu.test(normalized) ? 'ホームラン' : normalized
}

function normalizeHomeRunEventType(filters: {
  event_type?: SearchEventsFilters['event_type']
  result_text_contains?: string
}): SearchEventsFilters['event_type'] | undefined {
  return normalizeResultTextContains(filters.result_text_contains) === 'ホームラン'
    ? 'plate_appearance'
    : filters.event_type
}

export function normalizeFreeText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value
    .normalize('NFKC')
    .replace(/[‐‑‒–—―ーｰ−]/gu, 'ー')
    .replace(/[ \u3000\t\r\n]+/gu, '')
    .trim()

  return normalized.length > 0 ? normalized : undefined
}

function normalizeLookupKey(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/^[*＊+＋\s\u3000]+/u, '')
    .replace(/[・･]/gu, '')
    .replace(/[‐‑‒–—―ーｰ−]/gu, 'ー')
    .replace(/[ \u3000\t\r\n]+/gu, '')
    .toLowerCase()
}
