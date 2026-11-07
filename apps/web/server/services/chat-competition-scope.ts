/** League membership is a team-set constraint, independent of the source's competition column. */
export function competitionLeague(value: string): 'セ・リーグ' | 'パ・リーグ' | null {
  const key = value.normalize('NFKC').replace(/[\s・._-]+/gu, '').toLowerCase()
  if (['セリーグ', 'セントラルリーグ', 'centralleague'].includes(key)) return 'セ・リーグ'
  if (['パリーグ', 'パシフィックリーグ', 'pacificleague'].includes(key)) return 'パ・リーグ'
  return null
}

export function isRegularSeasonScope(value: string): boolean {
  return ['公式戦', '一軍公式戦', 'レギュラーシーズン', 'regularseason', 'regular'].includes(value.normalize('NFKC').replace(/[\s_-]+/gu, '').toLowerCase())
}
