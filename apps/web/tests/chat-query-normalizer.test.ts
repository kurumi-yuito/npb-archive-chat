import { describe, expect, it } from 'vitest'
import {
  normalizeChatStructuredQuery,
  normalizeFreeText,
  normalizePlayerName,
  normalizeTeamName,
} from '../server/services/chat-query-normalizer'

describe('chat-query-normalizer', () => {
  it('normalizes representative team aliases to DB-friendly short names', () => {
    expect(normalizeTeamName('千葉ロッテマリーンズ')).toBe('ロッテ')
    expect(normalizeTeamName('オリックス・バッファローズ')).toBe('オリックス')
    expect(normalizeTeamName('  東京ヤクルトスワローズ  ')).toBe('ヤクルト')
  })

  it('normalizes player names with basic whitespace and width normalization', () => {
    expect(normalizePlayerName(' 山 村 ')).toBe('山村')
    expect(normalizePlayerName(' 益　田 ')).toBe('益田')
    expect(normalizePlayerName('ｻｻｷ ﾛｳｷ')).toBe('ササキロウキ')
  })

  it('applies dictionary aliases after basic text normalization', () => {
    expect(normalizePlayerName('高松')).toBe('髙松')
    expect(normalizePlayerName('山崎伊織')).toBe('山﨑伊織')
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
        team: 'DeNA',
        opponent: '巨人',
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
        team: 'ロッテ',
        batter_name: '山村',
        pitcher_name: '益田',
        runner_name: '髙松',
        event_subtype: 'stolen_base',
      },
    })
  })
})
