/** League membership is a team-set constraint, independent of the source's competition column. */
export function competitionLeague(value: string): 'セ・リーグ' | 'パ・リーグ' | null {
  const key = value.normalize('NFKC').replace(/[\s・._-]+/gu, '').toLowerCase()
  if (['セリーグ', 'セントラルリーグ', 'centralleague'].includes(key)) return 'セ・リーグ'
  if (['パリーグ', 'パシフィックリーグ', 'pacificleague'].includes(key)) return 'パ・リーグ'
  return null
}
