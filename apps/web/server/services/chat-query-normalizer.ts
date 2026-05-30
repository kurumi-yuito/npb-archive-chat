import {
  chatStructuredQuerySchema,
  type ChatStructuredQuery,
  type SearchEventsFilters,
} from '@npb/schemas'

const teamAliasEntries = [
  ['読売ジャイアンツ', '巨人'],
  ['読売', '巨人'],
  ['巨人', '巨人'],
  ['ジャイアンツ', '巨人'],
  ['東京ヤクルトスワローズ', 'ヤクルト'],
  ['ヤクルトスワローズ', 'ヤクルト'],
  ['ヤクルト', 'ヤクルト'],
  ['スワローズ', 'ヤクルト'],
  ['横浜DeNAベイスターズ', 'DeNA'],
  ['横浜ＤｅＮＡベイスターズ', 'DeNA'],
  ['横浜denaベイスターズ', 'DeNA'],
  ['dena', 'DeNA'],
  ['ベイスターズ', 'DeNA'],
  ['横浜', 'DeNA'],
  ['中日ドラゴンズ', '中日'],
  ['中日', '中日'],
  ['ドラゴンズ', '中日'],
  ['阪神タイガース', '阪神'],
  ['阪神', '阪神'],
  ['タイガース', '阪神'],
  ['広島東洋カープ', '広島'],
  ['広島カープ', '広島'],
  ['広島', '広島'],
  ['カープ', '広島'],
  ['北海道日本ハムファイターズ', '日本ハム'],
  ['日本ハムファイターズ', '日本ハム'],
  ['日本ハム', '日本ハム'],
  ['日ハム', '日本ハム'],
  ['ファイターズ', '日本ハム'],
  ['東北楽天ゴールデンイーグルス', '楽天'],
  ['楽天ゴールデンイーグルス', '楽天'],
  ['楽天', '楽天'],
  ['イーグルス', '楽天'],
  ['埼玉西武ライオンズ', '西武'],
  ['西武ライオンズ', '西武'],
  ['西武', '西武'],
  ['ライオンズ', '西武'],
  ['千葉ロッテマリーンズ', 'ロッテ'],
  ['千葉ロッテ', 'ロッテ'],
  ['ロッテマリーンズ', 'ロッテ'],
  ['ロッテ', 'ロッテ'],
  ['オリックスバファローズ', 'オリックス'],
  ['オリックスバッファローズ', 'オリックス'],
  ['オリックス・バファローズ', 'オリックス'],
  ['オリックス・バッファローズ', 'オリックス'],
  ['オリックス', 'オリックス'],
  ['バファローズ', 'オリックス'],
  ['バッファローズ', 'オリックス'],
  ['福岡ソフトバンクホークス', 'ソフトバンク'],
  ['ソフトバンクホークス', 'ソフトバンク'],
  ['ソフトバンク', 'ソフトバンク'],
  ['ホークス', 'ソフトバンク'],
  // hiragana readings
  ['きょじん', '巨人'],
  ['やくると', 'ヤクルト'],
  ['でな', 'DeNA'],
  ['でーな', 'DeNA'],
  ['ちゅうにち', '中日'],
  ['はんしん', '阪神'],
  ['ひろしま', '広島'],
  ['にほんはむ', '日本ハム'],
  ['にっぽんはむ', '日本ハム'],
  ['らくてん', '楽天'],
  ['せいぶ', '西武'],
  ['ろって', 'ロッテ'],
  ['おりっくす', 'オリックス'],
  ['そふとばんく', 'ソフトバンク'],
  // English team names
  ['yomiuri', '巨人'],
  ['giants', '巨人'],
  ['yakult', 'ヤクルト'],
  ['swallows', 'ヤクルト'],
  ['baystars', 'DeNA'],
  ['baystar', 'DeNA'],
  ['chunichi', '中日'],
  ['dragons', '中日'],
  ['hanshin', '阪神'],
  ['tigers', '阪神'],
  ['hiroshima', '広島'],
  ['carp', '広島'],
  ['nipponham', '日本ハム'],
  ['fighters', '日本ハム'],
  ['rakuten', '楽天'],
  ['eagles', '楽天'],
  ['seibu', '西武'],
  ['lions', '西武'],
  ['lotte', 'ロッテ'],
  ['marines', 'ロッテ'],
  ['orix', 'オリックス'],
  ['buffaloes', 'オリックス'],
  ['softbank', 'ソフトバンク'],
  ['hawks', 'ソフトバンク'],
] as const

const playerAliasEntries = [
  ['髙松', '髙松'],
  ['高松', '髙松'],
] as const

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

const teamAliasMap = new Map(
  teamAliasEntries.map(([alias, canonical]) => [normalizeLookupKey(alias), canonical]),
)

const playerAliasMap = new Map(
  playerAliasEntries.map(([alias, canonical]) => [normalizeLookupKey(alias), canonical]),
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
      },
    })
  }

  if (structuredQuery.intent === 'game_detail') {
    return chatStructuredQuerySchema.parse({
      intent: 'game_detail',
      filters: {
        ...structuredQuery.filters,
        team: normalizeTeamName(structuredQuery.filters.team),
        player_name: normalizePlayerName(structuredQuery.filters.player_name),
      },
    })
  }

  if (structuredQuery.intent === 'aggregate_batting') {
    return chatStructuredQuerySchema.parse({
      intent: 'aggregate_batting',
      filters: {
        ...structuredQuery.filters,
        team: normalizeTeamName(structuredQuery.filters.team),
        player_name: normalizePlayerName(structuredQuery.filters.player_name),
      },
    })
  }

  if (structuredQuery.intent === 'aggregate_pitching') {
    return chatStructuredQuerySchema.parse({
      intent: 'aggregate_pitching',
      filters: {
        ...structuredQuery.filters,
        team: normalizeTeamName(structuredQuery.filters.team),
        pitcher_name: normalizePlayerName(structuredQuery.filters.pitcher_name),
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

  return teamAliasMap.get(normalizeLookupKey(normalized)) ?? normalized
}

export function normalizePlayerName(value: string | undefined): string | undefined {
  const normalized = normalizeFreeText(value)
  if (!normalized) {
    return undefined
  }

  return playerAliasMap.get(normalizeLookupKey(normalized)) ?? normalized
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
    .replace(/^[*＊+＋\s　]+/u, '')
    .replace(/[・･]/gu, '')
    .replace(/[‐‑‒–—―ーｰ−]/gu, 'ー')
    .replace(/[ \u3000\t\r\n]+/gu, '')
    .toLowerCase()
}
