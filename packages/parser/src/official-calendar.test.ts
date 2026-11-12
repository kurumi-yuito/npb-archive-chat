import { describe, expect, it } from 'vitest'
import { parseOfficialCalendar } from './official-calendar'

const names = ['読売ジャイアンツ', '阪神タイガース', '横浜DeNAベイスターズ', '広島東洋カープ', '東京ヤクルトスワローズ', '中日ドラゴンズ',
  '福岡ソフトバンクホークス', '北海道日本ハムファイターズ', '千葉ロッテマリーンズ', '東北楽天ゴールデンイーグルス', 'オリックス・バファローズ', '埼玉西武ライオンズ']
const standings = (league: string, teams: string[]) => `<div class="standing_table standing_table--${league}"><table><tbody>${teams.map((team) =>
  `<tr><th><span class="hide_sp">${team}</span><span class="hide_pc">略称</span></th><td>143</td><td>70</td><td>70</td><td>3</td><td>.500</td><td>-</td></tr>`).join('')}</tbody></table></div>`
const season = `<html><title>2025年度 公式戦成績</title><p>全日程終了</p><div class="link_list_fl stcalendar"><ul>${Array.from({ length: 8 }, (_, index) => index + 3).map((month) =>
  `<li><a href="/games/2025/schedule_${String(month).padStart(2, '0')}_detail.html">${month}月</a></li>`).join('')}</ul></div>${standings('central', names.slice(0, 6))}${standings('pacific', names.slice(6))}</html>`
const month = `<html><title>2025年度 公式戦 カレンダー 【6月】</title><p>全日程終了</p><table>${Array.from({ length: 30 }, (_, index) => {
  const day = index + 1
  return `<td class="stschedule"><div class="teschedate">${day}</div>${day === 10 ? '<div class="stvsteam"><a href="/bis/2025/games/s2025061000001.html">ソ 5 - 2 巨</a><a href="/bis/2025/games/s2025061000002.html">西 * - * 神</a></div>' : ''}</td>`
}).join('')}</table></html>`

describe('official closed calendar evidence', () => {
  it('preserves the published season envelope and checks both complete league tables', () => {
    const result = parseOfficialCalendar(season, 'https://npb.jp/bis/2025/stats/')
    expect(result).toMatchObject({ kind: 'season', year: 2025, calendarFrom: '2025-03-01', calendarTo: '2025-10-31' })
    if (result.kind !== 'season') throw new Error('Wrong calendar kind')
    expect(result.standings).toHaveLength(12)
    expect(result.calendarUrls).toHaveLength(8)
    expect(() => parseOfficialCalendar(season.replace('<td>143</td>', '<td>142</td>'), 'https://npb.jp/bis/2025/stats/')).toThrow('decisions disagree')
    expect(() => parseOfficialCalendar(season.replaceAll('/games/2025/', '/games/2024/'), 'https://npb.jp/bis/2025/stats/')).toThrow('scope mismatch')
  })
  it('requires every day and distinguishes explicit cancellation from a played zero-zero draw', () => {
    const result = parseOfficialCalendar(month, 'https://npb.jp/bis/2025/calendar/index_06.html')
    if (result.kind !== 'month') throw new Error('Wrong calendar kind')
    expect(result.dates).toHaveLength(30)
    expect(result.games).toMatchObject([{ date: '2025-06-10', homeTeam: '福岡ソフトバンクホークス', awayTeam: '読売ジャイアンツ', homeRuns: 5, awayRuns: 2, status: 'completed' },
      { date: '2025-06-10', homeTeam: '埼玉西武ライオンズ', awayTeam: '阪神タイガース', homeRuns: null, awayRuns: null, status: 'cancelled' }])
    const draw = parseOfficialCalendar(month.replace('西 * - * 神', '西 0 - 0 神'), 'https://npb.jp/bis/2025/calendar/index_06.html')
    if (draw.kind !== 'month') throw new Error('Wrong calendar kind')
    expect(draw.games[1]).toMatchObject({ status: 'completed', homeRuns: 0, awayRuns: 0 })
    expect(() => parseOfficialCalendar(month.replace('<div class="teschedate">30</div>', '<div class="teschedate">29</div>'), 'https://npb.jp/bis/2025/calendar/index_06.html')).toThrow('duplicate')
    expect(() => parseOfficialCalendar(month.replace('s2025061000001', 's2025061100001'), 'https://npb.jp/bis/2025/calendar/index_06.html')).toThrow('Invalid official calendar game')
    expect(() => parseOfficialCalendar(month.replace('全日程終了', '更新中'), 'https://npb.jp/bis/2025/calendar/index_06.html')).toThrow('closed calendar')
  })
})
