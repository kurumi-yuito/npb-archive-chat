import { describe, expect, it } from 'vitest'
import {
  parseBisPlayerStatsHtml,
  parseBisTeamRosterHtml,
  parseBisPlayerProfileHtml,
} from './bis-current'

const rosterHtml = `
<html><body>
<table>
  <tr><th>背番号</th><th>位置</th><th>選手名</th><th>投</th><th>打</th></tr>
  <tr>
    <td>19</td><td>投手</td>
    <td><a href="/bis/players/41045137.html">藤浪 晋太郎</a></td>
    <td>右</td><td>右</td>
  </tr>
</table>
</body></html>
`

const battingHtml = `
<html><body>
<table>
  <tr><th>選手</th><th>試合</th><th>打率</th><th>本塁打</th></tr>
  <tr><td><a href="/bis/players/41045137.html">藤浪 晋太郎</a></td><td>2</td><td>.000</td><td>0</td></tr>
</table>
</body></html>
`

const pitchingHtml = `
<html><body>
<table>
  <tr><th>投手</th><th>登板</th><th>防御率</th></tr>
  <tr><td><a href="/bis/players/41045137.html">藤浪 晋太郎</a></td><td>6</td><td>2.25</td></tr>
</table>
</body></html>
`

describe('BIS current parsers', () => {
  it('tracks repeated roster headers, excludes staff and preserves release remarks without asserting active status', () => {
    const html = `<table>
      <tr><th>No.</th><th>監督</th><th>生年月日</th><th>備考</th></tr><tr><td>99</td><td>監督 氏名</td><td>1970.01.01</td><td></td></tr>
      <tr><th>No.</th><th>投手</th><th>生年月日</th><th>身長</th><th>体重</th><th>投</th><th>打</th><th>備考</th></tr>
      <tr><td>10</td><td><a href="/bis/players/11111111.html">検証 投手</a></td><td>2000.01.01</td><td>180</td><td>80</td><td>左</td><td>右</td><td>11/1 自由契約選手</td></tr>
      <tr><th>No.</th><th>外野手</th><th>生年月日</th><th>身長</th><th>体重</th><th>投</th><th>打</th><th>備考</th></tr>
      <tr><td>20</td><td><a href="/bis/players/22222222.html">検証 野手</a></td><td>2001.01.01</td><td>181</td><td>81</td><td>右</td><td>左</td><td></td></tr></table>`
    const rows = parseBisTeamRosterHtml(html, { year: 2026, teamId: 't', teamName: '阪神', sourceUrl: 'https://npb.jp/bis/teams/rst_t.html' })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ playerId: '11111111', position: '投手', uniformNumber: '10', throws: '左', bats: '右', remarks: '11/1 自由契約選手' })
    expect(rows[1]).toMatchObject({ playerId: '22222222', position: '外野手', uniformNumber: '20', throws: '右', bats: '左' })
    expect(rows[0]).not.toHaveProperty('active')
  })

  it('preserves both official teams for an intra-season transfer without duplicating repeated statistic sections', () => {
    const table = `<table><tr><th>年度</th><th>球団</th></tr>
      <tr><td>2024</td><td>ヤクルト</td></tr>
      <tr><td>2025</td><td>ヤクルト</td></tr><tr><td>2025</td><td>阪神</td></tr><tr><td>2025</td><td>計</td></tr></table>`
    const profile = parseBisPlayerProfileHtml(`<title>検証 選手（阪神） | NPB.jp</title>${table}${table}`, 'test-id', 'https://npb.jp/bis/players/test-id.html')
    expect(JSON.parse(profile!.yearTeamsJson)).toEqual({ 2024: 'ヤクルト', 2025: ['ヤクルト', '阪神'] })
  })

  it('extracts current roster entries from rst_db.html', () => {
    const rows = parseBisTeamRosterHtml(rosterHtml, {
      year: 2026,
      teamId: 'db',
      teamName: '横浜DeNAベイスターズ',
      sourceUrl: 'https://npb.jp/bis/teams/rst_db.html',
    })

    expect(rows[0]).toMatchObject({
      year: 2026,
      teamId: 'db',
      teamName: '横浜DeNAベイスターズ',
      playerId: '41045137',
      playerName: '藤浪 晋太郎',
      position: '投手',
      uniformNumber: '19',
      sourceUrl: 'https://npb.jp/bis/teams/rst_db.html',
    })
  })

  it('extracts player batting stats from idb1_db.html', () => {
    const rows = parseBisPlayerStatsHtml(battingHtml, {
      year: 2026,
      teamId: 'db',
      teamName: '横浜DeNAベイスターズ',
      sourceUrl: 'https://npb.jp/bis/2026/stats/idb1_db.html',
    })

    expect(rows[0]).toMatchObject({
      playerId: '41045137',
      playerName: '藤浪 晋太郎',
      values: {
        試合: '2',
        打率: '.000',
        本塁打: '0',
      },
    })
  })

  it('extracts player pitching stats from idp1_db.html', () => {
    const rows = parseBisPlayerStatsHtml(pitchingHtml, {
      year: 2026,
      teamId: 'db',
      teamName: '横浜DeNAベイスターズ',
      sourceUrl: 'https://npb.jp/bis/2026/stats/idp1_db.html',
    })

    expect(rows[0]).toMatchObject({
      playerId: '41045137',
      playerName: '藤浪 晋太郎',
      values: {
        登板: '6',
        防御率: '2.25',
      },
    })
  })
})
