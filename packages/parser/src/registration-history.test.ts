import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseOfficialRegistrationHistory, type RegistrationPageScope } from './registration-history'

const html = readFileSync(new URL('./__fixtures__/registration-2025-yakult.html', import.meta.url), 'utf8')
const scope: RegistrationPageScope = { year: 2025, teamId: 's', teamName: '東京ヤクルトスワローズ', kind: 'registered', sourceUrl: 'https://npb.jp/announcement/2025/registered_s.html' }

describe('official historical registration semantics', () => {
  it('keeps the captured bytes and distinguishes a prior-year departure from a target-year transfer', () => {
    const source = JSON.parse(readFileSync(new URL('./__fixtures__/registration-2025-yakult.source.json', import.meta.url), 'utf8'))
    expect(createHash('sha256').update(html).digest('hex')).toBe(source.contentHash)
    const result = parseOfficialRegistrationHistory(html, scope)
    expect(result.declaredActive).toBe(69)
    expect(result.entries).toHaveLength(72)
    expect(result.entries.find((entry) => entry.playerId === '71575134')).toMatchObject({ playerName: '矢崎 拓也', membershipInYear: true })
    expect(result.entries.find((entry) => entry.playerId === '81985155')).toMatchObject({ removed: true, removalDates: ['2024-12-17'], membershipInYear: false })
    expect(result.entries.find((entry) => entry.playerName === '小森 航大郎')).toMatchObject({ removed: true, removalDates: ['2025-01-17'], membershipInYear: true })
    expect(result.currentContractConfirmed).toBe(false)
  })
  it('refuses a backdated source or an active-count mismatch', () => {
    expect(() => parseOfficialRegistrationHistory(html, { ...scope, year: 2024, sourceUrl: scope.sourceUrl.replace('/2025/', '/2024/') })).toThrow('published year/team')
    expect(() => parseOfficialRegistrationHistory(html.replace('class="xxx"', 'class=""'), scope)).toThrow('active count mismatch')
  })
  it('leaves an unexplained removal and a missing official link unresolved', () => {
    const sample = `<title>2025年度 支配下選手登録 東京ヤクルトスワローズ</title><section><h5>1名</h5><table>
      <tr><th>公示日</th><th>位置</th><th>番号</th><th>選手名</th></tr>
      <tr class="xxx"><th>1/20</th><td>投手</td><td>1</td><td><a href="/bis/players/11111111.html">検証甲</a></td></tr>
      <tr><th>1/20</th><td>投手</td><td>2</td><td>検証乙</td></tr></table></section>`
    const result = parseOfficialRegistrationHistory(sample, scope)
    expect(result.entries[0]).toMatchObject({ playerId: '11111111', membershipInYear: null })
    expect(result.entries[1]).toMatchObject({ playerId: null, membershipInYear: true })
  })
})
