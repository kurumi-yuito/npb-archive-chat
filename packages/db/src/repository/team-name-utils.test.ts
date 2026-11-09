import { describe, expect, it } from 'vitest'
import { canonicalTeamName, matchesGameTeamFilter, teamMentionCandidates } from './team-name-utils'

describe('official team typography', () => {
  it.each([
    ['阪神タイガーズ', '阪神'], ['中日ドラコンズ', '中日'], ['Ｙｏｍｉｕｒｉ', '巨人'], ['ＤｅＮａ', 'DeNA'],
  ])('resolves the user mention %s against the catalog without changing official stored names', (mention, expected) => {
    expect(teamMentionCandidates(mention)).toEqual([expected])
  })
  it.each(['巨入', '西部', '架空の球団', '山田', '12球団'])('does not guess a club for %s', (mention) => {
    expect(teamMentionCandidates(mention)).toEqual([])
  })
  it.each([
    ['阪 神', '阪神タイガース'], ['中　日', '中日ドラゴンズ'], ['読 売', '読売ジャイアンツ'],
    ['ＤｅＮＡ', '横浜DeNAベイスターズ'], ['ソフトバンク', '福岡ソフトバンクホークス'],
  ])('matches official padded name %s to %s without changing the season', (short, full) => {
    expect(canonicalTeamName(short)).toBe(canonicalTeamName(full))
    expect(matchesGameTeamFilter(short, full)).toBe(true)
    expect(matchesGameTeamFilter(short, '西武')).toBe(false)
  })
})
