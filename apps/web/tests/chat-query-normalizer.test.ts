import { describe, expect, it } from 'vitest'
import {
  normalizeChatStructuredQuery,
  normalizeFreeText,
  normalizePlayerName,
  normalizeTeamName,
} from '../server/services/chat-query-normalizer'

describe('chat-query-normalizer', () => {
  it('does not perform semantic team alias resolution during text normalization', () => {
    expect(normalizeTeamName('千葉ロッテマリーンズ')).toBe('千葉ロッテマリーンズ')
    expect(normalizeTeamName('オリックス・バッファローズ')).toBe('オリックス・バッファローズ')
    expect(normalizeTeamName('  東京ヤクルトスワローズ  ')).toBe('東京ヤクルトスワローズ')
  })

  it('normalizes player names with basic whitespace and width normalization', () => {
    expect(normalizePlayerName(' 山 村 ')).toBe('山村')
    expect(normalizePlayerName(' 益　田 ')).toBe('益田')
    expect(normalizePlayerName('ｻｻｷ ﾛｳｷ')).toBe('ササキロウキ')
  })

  it('absorbs Unicode glyph variants without resolving a player identity', () => {
    expect(normalizePlayerName('髙松')).toBe('高松')
    expect(normalizePlayerName('山﨑伊織')).toBe('山崎伊織')
    expect(normalizePlayerName('濵口')).toBe('浜口')
  })

  it('removes narrow conversational predicates retained in player entity spans', () => {
    expect(normalizePlayerName('藤浪どう')).toBe('藤浪')
    expect(normalizePlayerName('田中どう')).toBe('田中')
    expect(normalizePlayerName('藤浪近ごろ見ない気')).toBe('藤浪')
  })

  it('normalizes both sides of an explicit matchup without dropping the venue', () => {
    expect(normalizeChatStructuredQuery({
      intent: 'game_detail',
      filters: {
        game_date: '2026-05-21',
        team: '横浜DeNAベイスターズ',
        opponent: '読売ジャイアンツ',
        venue: '東京ドーム',
      },
    })).toEqual({
      intent: 'game_detail',
      filters: {
        game_date: '2026-05-21',
        team: '横浜DeNAベイスターズ',
        opponent: '読売ジャイアンツ',
        venue: '東京ドーム',
      },
    })
  })

  it('keeps unknown values after basic normalization', () => {
    expect(normalizeTeamName('架空チーム')).toBe('架空チーム')
    expect(normalizePlayerName(' 謎 の 選手 ')).toBe('謎の選手')
    expect(normalizeFreeText('   ')).toBeUndefined()
  })

  it('normalizes only the configured chat query fields before DB search', () => {
    expect(
      normalizeChatStructuredQuery({
        intent: 'search_events',
        filters: {
          team: '千葉 ロッテ マリーンズ',
          batter_name: ' 山 村 ',
          pitcher_name: ' 益　田 ',
          runner_name: '高松',
          event_subtype: 'stolen_base',
        },
      }),
    ).toEqual({
      intent: 'search_events',
      filters: {
        team: '千葉ロッテマリーンズ',
        batter_name: '山村',
        pitcher_name: '益田',
        runner_name: '高松',
        event_subtype: 'stolen_base',
      },
    })
  })
})
