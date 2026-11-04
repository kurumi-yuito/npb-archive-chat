import { describe, expect, it } from 'vitest'
import { canonicalTeamName, matchesGameTeamFilter } from './team-name-utils'

describe('official team typography', () => {
  it.each([
    ['阪 神', '阪神タイガース'], ['中　日', '中日ドラゴンズ'], ['読 売', '読売ジャイアンツ'],
    ['ＤｅＮＡ', '横浜DeNAベイスターズ'], ['ソフトバンク', '福岡ソフトバンクホークス'],
  ])('matches official padded name %s to %s without changing the season', (short, full) => {
    expect(canonicalTeamName(short)).toBe(canonicalTeamName(full))
    expect(matchesGameTeamFilter(short, full)).toBe(true)
    expect(matchesGameTeamFilter(short, '西武')).toBe(false)
  })
})
