import { describe, expect, it } from 'vitest'
import {
  parseBisPlayerStatsHtml,
  parseBisTeamRosterHtml,
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
