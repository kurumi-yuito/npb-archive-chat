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
}

/** games / events テーブル用: 日本語 → 英語チーム名 */
export function toEnglishTeamName(team: string): string | undefined {
  return japaneseToEnglishMap[team]
}

/** batting_lines / pitching_lines テーブル用: 日本語 → 日本語エイリアスリスト */
export function toJapaneseTeamAliases(team: string): string[] {
  return japaneseTeamAliasMap[team] ?? [team]
}
