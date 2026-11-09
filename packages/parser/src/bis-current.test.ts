import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  parseBisPlayerStatsHtml,
  parseBisTeamRosterHtml,
  parseBisPlayerProfileHtml,
  parseBisPlayerStatisticHistoryHtml,
  parseBisGenericTeamTableHtml,
} from './bis-current'

describe('official nested yearly club table', () => {
  it('aligns spanning fielding headings and retains blank repeated headings across position sections', () => {
    const html = readFileSync(new URL('./__fixtures__/bis-fielding-2024-giants.html', import.meta.url), 'utf8')
    const rows = parseBisPlayerStatsHtml(html, { year: 2024, teamId: 'g', teamName: '読売ジャイアンツ', sourceUrl: 'https://npb.jp/bis/2024/stats/idf1_g.html' })
    const player = rows.filter((row) => row.playerName.replace(/\s+/gu, '') === '岡本和真')
    expect(player.map((row) => row.values)).toEqual(expect.arrayContaining([
      expect.objectContaining({ 区分: '一塁手', 試合: '130', 刺殺: '997', 補殺: '65', 失策: '4' }),
      expect.objectContaining({ 区分: '三塁手', 試合: '29', 刺殺: '14', 補殺: '45', 失策: '2' }),
      expect.objectContaining({ 区分: '外野手', 試合: '15', 刺殺: '9', 補殺: '3', 失策: '0' }),
    ]))
    expect(player).toHaveLength(3)
  })
  it('reads archived vertical column headings without changing player names or metric cells', () => {
    const html = readFileSync(new URL('./__fixtures__/bis-batting-2024-giants.html', import.meta.url), 'utf8')
    const rows = parseBisPlayerStatsHtml(html, { year: 2024, teamId: 'g', teamName: '読売ジャイアンツ', sourceUrl: 'https://npb.jp/bis/2024/stats/idb1_g.html' })
    const player = rows.find((row) => row.playerName.replace(/\s+/gu, '') === '岡本和真')
    expect(player?.values).toMatchObject({ 試合: '143', 打率: '.280', 本塁打: '27' })
    expect(player?.playerName).toBe('岡本 和真')
    expect(rows.filter((row) => '打数' in row.values && '安打' in row.values && '本塁打' in row.values).length).toBeGreaterThan(30)
  })
  it('keeps a parent pitching data table when nested tables only format fractional innings', () => {
    const html = readFileSync(new URL('./__fixtures__/bis-player-nested-innings.html', import.meta.url), 'utf8')
    const rows = parseBisPlayerStatisticHistoryHtml(html)
    expect(rows.find((row) => row.kind === 'pitching' && row.scope === 'career')?.metrics).toMatchObject({ 登板: '579', 投球回: '1746 .1' })
    expect(rows.find((row) => row.kind === 'pitching' && row.year === 1960)?.metrics).toMatchObject({ 登板: '2', 投球回: '3' })
    expect(rows.some((row) => row.kind === 'batting' && row.scope === 'career')).toBe(true)
  })
  it('reads season rows from the real data table instead of flattening its layout container', () => {
    const html = readFileSync(new URL('./__fixtures__/bis-team-yearly-giants.html', import.meta.url), 'utf8')
    const rows = parseBisGenericTeamTableHtml(html, { year: 2026, teamId: 'g', teamName: '読売ジャイアンツ', sourceUrl: 'https://npb.jp/bis/teams/yearly_g.html' })
      .filter((row) => /^\d{4}/u.test(row.values.年度 ?? ''))
    expect(rows).toHaveLength(93)
    expect(rows.filter((row) => row.values.年度 === '1937春')).toHaveLength(1)
    expect(rows.find((row) => row.values.年度 === '2025')?.values).toMatchObject({ 試合: '143', 勝利: '70', 敗北: '69', 引分: '4' })
    expect(rows.find((row) => row.values.年度 === '2026')?.values).toMatchObject({ 試合: '143', 勝利: '76', 敗北: '64', 引分: '3', 順位: '2' })
    for (const row of rows) expect(Number(row.values.試合)).toBe(Number(row.values.勝利) + Number(row.values.敗北) + Number(row.values.引分))
  })
})

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
  it('preserves historical split seasons as separate periods within the same membership year', () => {
    const html = `<title>検証 選手（検証球団） | 個人年度別成績</title><table><tr><th>年度</th><th>所属球団</th><th>試合</th><th>打数</th><th>安打</th><th>本塁打</th></tr>
      <tr><td>1937春</td><td>検証球団</td><td>10</td><td>20</td><td>5</td><td>1</td></tr>
      <tr><td>1937秋</td><td>検証球団</td><td>11</td><td>21</td><td>6</td><td>2</td></tr>
      <tr><th></th><th>通 算</th><th>21</th><th>41</th><th>11</th><th>3</th></tr></table>`
    const rows = parseBisPlayerStatisticHistoryHtml(html)
    expect(rows.map((row) => [row.year, row.seasonLabel])).toEqual([[1937, '1937春'], [1937, '1937秋'], [null, null]])
    expect(JSON.parse(parseBisPlayerProfileHtml(html, 'proof-id', 'https://npb.jp/bis/players/proof-id.html')!.yearTeamsJson)).toEqual({ '1937': '検証球団' })
  })
  it('preserves official career footer totals as data while keeping annual transfer subtotals distinct', () => {
    const html = `<table><thead><tr><th>年度</th><th>所属球団</th><th>登板</th><th>勝利</th><th>投球回</th><th>防御率</th></tr></thead>
      <tbody><tr><td>2024</td><td>ヤクルト</td><td>2</td><td>1</td><td>10 .1</td><td>1.74</td></tr>
      <tr><td>2024</td><td>阪 神</td><td>3</td><td>2</td><td>12 .2</td><td>2.13</td></tr>
      <tr><td>2024</td><td>計</td><td>5</td><td>3</td><td>23</td><td>1.96</td></tr></tbody>
      <tfoot><tr><th></th><th>通\u3000算</th><th>5</th><th>3</th><th>23</th><th>1.96</th></tr></tfoot></table>`
    const rows = parseBisPlayerStatisticHistoryHtml(html)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ kind: 'pitching', scope: 'team_season', year: 2024, team: 'ヤクルト', metrics: { 勝利: '1' } })
    expect(rows[2]).toMatchObject({ scope: 'season_total', year: 2024, team: null, metrics: { 勝利: '3' } })
    expect(rows[3]).toMatchObject({ scope: 'career', year: null, team: null, metrics: { 勝利: '3', 投球回: '23' } })
  })
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
