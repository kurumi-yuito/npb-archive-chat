import type { RichGame } from '@npb/schemas'

/** npb.jp/scores の playbyplay/box/roster 由来で、実データが揃っているか */
export function isScoresRichGameComplete(rg: RichGame): boolean {
  if (rg.sources.playbyplay.url.includes('not-downloaded')) {
    return false
  }
  const battingRows = rg.batting_box.flatMap((t) => t.rows)
  const pitchingRows = rg.pitching_box.flatMap((t) => t.rows)
  const rosterEntries = rg.roster.flatMap((t) => t.groups.flatMap((g) => g.entries))
  if (battingRows.length === 0 || pitchingRows.length === 0 || rosterEntries.length === 0) {
    return false
  }
  const plateAppearances = rg.play_by_play.filter((e) => e.event_type === 'plate_appearance')
  return plateAppearances.length > 0
}
