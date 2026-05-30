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
  巨人: ['巨人', '読売ジャイアンツ'],
  ヤクルト: ['ヤクルト', '東京ヤクルトスワローズ'],
  DeNA: ['DeNA', '横浜DeNAベイスターズ'],
  中日: ['中日', '中日ドラゴンズ'],
  阪神: ['阪神', '阪神タイガース'],
  広島: ['広島', '広島東洋カープ'],
  日本ハム: ['日本ハム', '北海道日本ハムファイターズ'],
  楽天: ['楽天', '東北楽天ゴールデンイーグルス'],
  西武: ['西武', '埼玉西武ライオンズ'],
  ロッテ: ['ロッテ', '千葉ロッテマリーンズ'],
  オリックス: ['オリックス', 'オリックス・バファローズ'],
  ソフトバンク: ['ソフトバンク', '福岡ソフトバンクホークス'],
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
  const japaneseAliases = japaneseTeamAliasMap[team] ?? [team]
  const english = toEnglishTeamName(team)
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
  for (const alias of aliases) {
    aliasToCanonical[alias] = canonical
  }
}

/** チーム名の表記ゆれを正規の短縮名に統一（「福岡ソフトバンクホークス」→「ソフトバンク」等） */
export function canonicalTeamName(team: string): string {
  return aliasToCanonical[team] ?? team
}
