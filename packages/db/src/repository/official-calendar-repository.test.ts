import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../sqlite'
import { sqliteDatabaseToQuery } from '../query-driver'
import { storeOfficialCalendarCapture, verifyOfficialCalendarArchive } from '../official-calendar'
import type { ObjectStorage } from '../object-storage'
import { officialSeasonInWindow, readOfficialCalendars, searchOfficialCalendarAbsence } from './official-calendar-repository'

const clubs = ['読売ジャイアンツ', '阪神タイガース', '横浜DeNAベイスターズ', '広島東洋カープ', '東京ヤクルトスワローズ', '中日ドラゴンズ', '福岡ソフトバンクホークス', '北海道日本ハムファイターズ', '千葉ロッテマリーンズ', '東北楽天ゴールデンイーグルス', 'オリックス・バファローズ', '埼玉西武ライオンズ']
function fixture() {
  const sourceUrl = 'https://npb.jp/bis/2025/stats/'
  const table = (league: string, names: string[]) => `<div class="standing_table--${league}"><table><tbody>${names.map((name) => `<tr><td><span class="hide_sp">${name}</span></td><td>143</td><td>70</td><td>70</td><td>3</td><td>.500</td></tr>`).join('')}</tbody></table></div>`
  const html = `<title>2025年度 公式戦成績</title>全日程終了<div class="stcalendar">${Array.from({ length: 8 }, (_, i) => `<a href="/bis/2025/calendar/index_${String(i + 3).padStart(2, '0')}.html">${i + 3}月</a>`).join('')}</div>${table('central', clubs.slice(0, 6))}${table('pacific', clubs.slice(6))}</html>`
  return { sourceUrl, html, fetchedAt: '2026-11-11T01:00:01Z', discovery: [{ sourceUrl: 'https://npb.jp/bis/teams/rst_db.html', html: `<a href="${sourceUrl}">成績</a></html>`, fetchedAt: '2026-11-11T01:00:00Z' }] }
}
function memoryStorage() {
  const objects = new Map<string, string>()
  const storage = { getText: async (key: string) => objects.get(key) ?? null, putText: async (key: string, value: string) => { objects.set(key, value); return key } } as ObjectStorage
  return { storage, objects }
}

describe('official calendar observations', () => {
  it('proves absent matchups while retaining cancelled fixtures and unsupported conditions', async () => {
    const db = openDatabase(), query = sqliteDatabaseToQuery(db), { storage } = memoryStorage()
    try {
      db.exec(await readFile(new URL('../../migrations/0016_official_calendar.sql', import.meta.url), 'utf8'))
      const sourceUrl = 'https://npb.jp/bis/2025/calendar/index_06.html'
      const cells = Array.from({ length: 30 }, (_, index) => `<td class="stschedule"><div class="teschedate">${index + 1}</div>${index === 9 ? '<a href="/bis/2025/games/s2025061000001.html">ソ 5 - 2 巨</a><a href="/bis/2025/games/s2025061000002.html">西 * - * 神</a>' : ''}</td>`).join('')
      const capture = fixture()
      await storeOfficialCalendarCapture(db, storage, { ...capture, sourceUrl,
        html: `<title>2025年度 6月 カレンダー</title>全日程終了<table>${cells}</table></html>`,
        discovery: [{ ...capture.discovery[0]!, html: `<a href="${sourceUrl}">カレンダー</a></html>` }] })
      const scope = { game_date: '2025-06-10', team: '巨人', opponent: '阪神' }
      expect(await searchOfficialCalendarAbsence(query, scope)).toMatchObject({ sourceUrl, date: scope.game_date })
      expect(await searchOfficialCalendarAbsence(query, { ...scope, opponent: 'ソフトバンク' })).toBeNull()
      expect(await searchOfficialCalendarAbsence(query, { ...scope, team: '西武' })).toBeNull()
      for (const condition of [{ include_farm: true }, { venue: '東京ドーム' }, { player_name: '選手' }, { competition: '日本シリーズ' }]) {
        expect(await searchOfficialCalendarAbsence(query, { ...scope, ...condition })).toBeNull()
      }
      expect(await searchOfficialCalendarAbsence(query, { ...scope, game_date: '2025-07-10' })).toBeNull()
    } finally { db.close() }
  })
  it('retains immutable fetch observations and proves only enclosing season windows', async () => {
    const db = openDatabase(), query = sqliteDatabaseToQuery(db), { storage, objects } = memoryStorage()
    try {
      db.exec(await readFile(new URL('../../migrations/0016_official_calendar.sql', import.meta.url), 'utf8'))
      const capture = fixture()
      const first = await storeOfficialCalendarCapture(db, storage, capture)
      await storeOfficialCalendarCapture(db, storage, capture)
      const later = await storeOfficialCalendarCapture(db, storage, { ...capture, fetchedAt: '2026-11-11T01:00:02Z' })
      expect(later.observationId).not.toBe(first.observationId)
      expect(db.prepare('SELECT COUNT(*) AS n FROM official_calendar_observations').get()).toEqual({ n: 2 })
      expect(await verifyOfficialCalendarArchive(db, storage)).toMatchObject({ observations: 2, objects: expect.any(Array) })
      expect((await officialSeasonInWindow(query, 2025, '2025-01-01', '2025-11-11'))?.fetchedAt).toBe(later.fetchedAt)
      expect(await officialSeasonInWindow(query, 2025, '2025-04-01', '2025-11-11')).toBeNull()
      expect(await officialSeasonInWindow(query, 2025, '2025-01-01', '2025-09-01')).toBeNull()
      objects.set(later.rawKey, 'conflict')
      await expect(storeOfficialCalendarCapture(db, storage, capture)).rejects.toThrow('object conflict')
      await expect(verifyOfficialCalendarArchive(db, storage)).rejects.toThrow('original object integrity')
      objects.set(later.rawKey, capture.html)
      db.prepare('UPDATE official_calendar_observations SET facts_hash=? WHERE observation_id=?').run('0'.repeat(64), later.observationId)
      await expect(readOfficialCalendars(query, 2025, 'season')).rejects.toThrow('integrity mismatch')
    } finally { db.close() }
  })

  it('rejects unlinked discovery and chronology changes before persistence', async () => {
    const db = openDatabase(), { storage } = memoryStorage(), capture = fixture()
    try {
      await expect(storeOfficialCalendarCapture(db, storage, { ...capture, discovery: [{ ...capture.discovery[0]!, html: '</html>' }] })).rejects.toThrow('discovery link/time')
      await expect(storeOfficialCalendarCapture(db, storage, { ...capture, fetchedAt: '2026-11-10T01:00:00Z' })).rejects.toThrow('discovery link/time')
    } finally { db.close() }
  })
})
