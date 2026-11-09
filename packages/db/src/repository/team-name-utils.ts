const japaneseToEnglishMap: Record<string, string> = {
  巨人: 'Yomiuri',
  ヤクルト: 'Yakult',
  DeNA: 'DeNA',
  中日: 'Chunichi',
  阪神: 'Hanshin',
  広島: 'Hiroshima',
  日本ハム: 'Nippon-Ham',
  楽天: 'Rakuten',
  西武: 'Seibu',
  ロッテ: 'Lotte',
  オリックス: 'ORIX',
  ソフトバンク: 'SoftBank',
}

const japaneseTeamAliasMap: Record<string, string[]> = {
  巨人: ['巨人', '読売ジャイアンツ', '読売'],
  ヤクルト: ['ヤクルト', '東京ヤクルトスワローズ', '東京ヤクルト'],
  DeNA: ['DeNA', '横浜DeNAベイスターズ', '横浜DeNA', '横浜'],
  中日: ['中日', '中日ドラゴンズ'],
  阪神: ['阪神', '阪神タイガース'],
  広島: ['広島', '広島東洋カープ', '広島東洋'],
  日本ハム: ['日本ハム', '北海道日本ハムファイターズ', '北海道日本ハム'],
  楽天: ['楽天', '東北楽天ゴールデンイーグルス', '東北楽天'],
  西武: ['西武', '埼玉西武ライオンズ', '埼玉西武'],
  ロッテ: ['ロッテ', '千葉ロッテマリーンズ', '千葉ロッテ'],
  オリックス: ['オリックス', 'オリックス・バファローズ'],
  ソフトバンク: ['ソフトバンク', '福岡ソフトバンクホークス', '福岡ソフトバンク'],
  'セ・リーグ': ['巨人', '読売ジャイアンツ', 'ヤクルト', '東京ヤクルトスワローズ', 'DeNA', '横浜DeNAベイスターズ', '中日', '中日ドラゴンズ', '阪神', '阪神タイガース', '広島', '広島東洋カープ'],
  'パ・リーグ': ['日本ハム', '北海道日本ハムファイターズ', '楽天', '東北楽天ゴールデンイーグルス', '西武', '埼玉西武ライオンズ', 'ロッテ', '千葉ロッテマリーンズ', 'オリックス', 'オリックス・バファローズ', 'ソフトバンク', '福岡ソフトバンクホークス'],
}

const allLeagueTeamsMap: Record<string, string[]> = {
  'セ・リーグ': [
    '巨人', '読売ジャイアンツ', 'Yomiuri', 'Yomiuri Giants',
    'ヤクルト', '東京ヤクルトスワローズ', 'Yakult', 'Tokyo Yakult Swallows',
    'DeNA', '横浜DeNAベイスターズ',
    '中日', '中日ドラゴンズ', 'Chunichi', 'Chunichi Dragons',
    '阪神', '阪神タイガース', 'Hanshin',
    '広島', '広島東洋カープ', 'Hiroshima', 'Hiroshima Toyo Carp',
  ],
  'パ・リーグ': [
    '日本ハム', '北海道日本ハムファイターズ', 'Nippon-Ham',
    '楽天', '東北楽天ゴールデンイーグルス', 'Rakuten',
    '西武', '埼玉西武ライオンズ', 'Seibu', 'Saitama Seibu Lions',
    'ロッテ', '千葉ロッテマリーンズ', 'Lotte',
    'オリックス', 'オリックス・バファローズ', 'ORIX', 'ORIX Buffaloes',
    'ソフトバンク', '福岡ソフトバンクホークス', 'SoftBank',
  ],
}

/** games / events テーブル用: 日本語 → 英語チーム名 */
export function toEnglishTeamName(team: string): string | undefined {
  return japaneseToEnglishMap[team]
}

/** games テーブル用: NPB.jp score data can contain English short names and occasional Japanese names. */
export function toGameTeamAliases(team: string): string[] {
  const canonical = canonicalTeamName(team)
  const japaneseAliases = japaneseTeamAliasMap[canonical] ?? japaneseTeamAliasMap[team] ?? [team]
  const english = toEnglishTeamName(canonical) ?? toEnglishTeamName(team)
  return [...new Set([
    ...japaneseAliases,
    ...(english ? [english] : []),
  ])]
}

/** events テーブル用リーグ展開: 「パ・リーグ」→日英両方の球団名リスト、単チームの場合は null */
export function toEnglishLeagueTeams(team: string): string[] | null {
  return allLeagueTeamsMap[team] ?? null
}

/** batting_lines / pitching_lines テーブル用: 日本語 → 日本語エイリアスリスト */
export function toJapaneseTeamAliases(team: string): string[] {
  return japaneseTeamAliasMap[team] ?? [team]
}

const aliasToCanonical: Record<string, string> = {}
for (const [canonical, aliases] of Object.entries(japaneseTeamAliasMap)) {
  if (canonical === 'セ・リーグ' || canonical === 'パ・リーグ') {
    continue
  }
  for (const alias of aliases) {
    aliasToCanonical[alias] = canonical
  }
}

/** チーム名の表記ゆれを正規の短縮名に統一（「福岡ソフトバンクホークス」→「ソフトバンク」等） */
export function canonicalTeamName(team: string): string {
  const normalized = team.normalize('NFKC').replace(/\s+/gu, '')
  return aliasToCanonical[normalized] ?? normalized
}

export function canonicalLeagueTeamNames(team?: string): string[] {
  if (!team) return Object.keys(japaneseToEnglishMap)
  const aliases = japaneseTeamAliasMap[team] ?? [team]
  return [...new Set(aliases.map(canonicalTeamName))].filter((name) => name in japaneseToEnglishMap)
}

/** Resolve a user club mention against the existing official club/alias catalog.
 * Short names require an exact match; one typo in a longer name is accepted
 * only if it identifies a single club. This is not applied to stored evidence. */
export function teamMentionCandidates(value: string): string[] {
  const key = (name: string) => name.normalize('NFKC').replace(/\s+/gu, '').toLowerCase()
  const aliases = new Map<string, string>()
  for (const [alias, canonical] of Object.entries(aliasToCanonical)) aliases.set(key(alias), canonical)
  for (const [canonical, english] of Object.entries(japaneseToEnglishMap)) aliases.set(key(english), canonical)
  const input = key(value), exact = aliases.get(input)
  if (exact) return [exact]
  if (input.length < 4) return []
  const oneEdit = (left: string, right: string) => {
    if (Math.abs(left.length - right.length) > 1) return false
    let a = 0, b = 0, edits = 0
    while (a < left.length && b < right.length) {
      if (left[a] === right[b]) { a++; b++; continue }
      if (++edits > 1) return false
      if (left.length >= right.length) a++
      if (right.length >= left.length) b++
    }
    return edits + (left.length - a) + (right.length - b) <= 1
  }
  return [...new Set([...aliases].filter(([alias]) => alias.length >= 4 && oneEdit(input, alias)).map(([, canonical]) => canonical))]
}

/** Apply the same team/league alias expansion to returned evidence as to SQL filters. */
export function matchesGameTeamFilter(team: string, filter: string): boolean {
  const aliases = toEnglishLeagueTeams(filter) ?? toGameTeamAliases(filter)
  return aliases.some((alias) => alias === team || canonicalTeamName(alias) === canonicalTeamName(team))
}
