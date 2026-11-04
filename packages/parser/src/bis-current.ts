import {
  absoluteUrl,
  cleanText,
  extractTopLevelCells,
  extractTopLevelElements,
  parseCell,
} from './scores-utils.js'

export type BisTeamInfo = {
  teamId: string
  teamName: string
}

export type BisSourceType =
  | 'team_roster'
  | 'team_index'
  | 'team_yearly_stats'
  | 'player_batting_stats'
  | 'player_pitching_stats'
  | 'player_fielding_stats'
  | 'team_monthly_results'

export type BisSourceSnapshot = {
  sourceKey: string
  sourceType: BisSourceType
  sourceUrl: string
  rawPath?: string | null
  structuredPath?: string | null
  fetchedAt: string
  contentHash?: string
  basisText?: string | null
}

export type BisCurrentRosterEntry = {
  year: number
  teamId: string
  teamName: string
  playerId: string | null
  playerName: string
  position: string | null
  uniformNumber: string | null
  bats: string | null
  throws: string | null
  sourceUrl: string
  remarks?: string | null
  birthDate?: string | null
  height?: string | null
  weight?: string | null
}

export type BisGenericTeamRow = {
  year: number
  teamId: string
  teamName: string
  rowIndex: number
  label: string | null
  values: Record<string, string>
  sourceUrl: string
}

export type BisPlayerStatsRow = {
  year: number
  teamId: string
  teamName: string
  playerId: string | null
  playerName: string
  rowIndex: number
  values: Record<string, string>
  sourceUrl: string
}

export type BisTeamMonthlyResultRow = BisGenericTeamRow & {
  month: number
  gameDate: string | null
}

export type BisCurrentDataset = {
  year: number
  teams: BisTeamInfo[]
  sourceSnapshots: BisSourceSnapshot[]
  currentTeamRoster: BisCurrentRosterEntry[]
  teamIndex: BisGenericTeamRow[]
  teamYearlyStats: BisGenericTeamRow[]
  playerBattingStats: BisPlayerStatsRow[]
  playerPitchingStats: BisPlayerStatsRow[]
  playerFieldingStats: BisPlayerStatsRow[]
  teamMonthlyResults: BisTeamMonthlyResultRow[]
}

export function emptyBisCurrentDataset(year: number): BisCurrentDataset {
  return {
    year,
    teams: [],
    sourceSnapshots: [],
    currentTeamRoster: [],
    teamIndex: [],
    teamYearlyStats: [],
    playerBattingStats: [],
    playerPitchingStats: [],
    playerFieldingStats: [],
    teamMonthlyResults: [],
  }
}

export function parseBisTeamRosterHtml(
  html: string,
  input: { year: number; teamId: string; teamName: string; sourceUrl: string },
): BisCurrentRosterEntry[] {
  return parseDataTables(html).flatMap((table) =>
    table.rows.filter((row) => !row.headers.some((header) => ['監督', 'コーチ'].includes(header))).map((row) => {
      const player = findPlayerCell(row)
      const role = row.headers.find((header) => ['投手', '捕手', '内野手', '外野手'].includes(header)) ?? null
      const nameIndex = row.headers.findIndex((header) => ['選手', '選手名', '氏名', '登録名', '投手', '捕手', '内野手', '外野手'].includes(header))
      return {
        year: input.year,
        teamId: input.teamId,
        teamName: input.teamName,
        playerId: player.playerId,
        playerName: player.playerName || row.cells[nameIndex]?.text || '',
        position: valueByHeader(row, ['位置', '守備', 'ポジション']) || role,
        uniformNumber: valueByHeader(row, ['背番号', '番号', 'No.', 'No']),
        bats: valueByHeader(row, ['打', '打席']),
        throws: valueByHeader(row, ['投', '投打']),
        sourceUrl: input.sourceUrl,
        remarks: valueByHeader(row, ['備考']),
        birthDate: valueByHeader(row, ['生年月日']),
        height: valueByHeader(row, ['身長']),
        weight: valueByHeader(row, ['体重']),
      }
    }),
  ).filter((row) => row.playerName)
}

export function parseBisPlayerStatsHtml(
  html: string,
  input: { year: number; teamId: string; teamName: string; sourceUrl: string },
): BisPlayerStatsRow[] {
  return parseDataTables(html).flatMap((table) =>
    table.rows.map((row, index) => {
      const player = findPlayerCell(row)
      return {
        year: input.year,
        teamId: input.teamId,
        teamName: input.teamName,
        playerId: player.playerId,
        playerName: player.playerName || valueByHeader(row, ['選手', '選手名', '打者', '投手']) || row.cells[0]?.text || '',
        rowIndex: index + 1,
        values: rowToValues(row),
        sourceUrl: input.sourceUrl,
      }
    }),
  ).filter((row) => row.playerName)
}

export function parseBisGenericTeamTableHtml(
  html: string,
  input: { year: number; teamId: string; teamName: string; sourceUrl: string },
): BisGenericTeamRow[] {
  return parseDataTables(html).flatMap((table) =>
    table.rows.map((row, index) => ({
      year: input.year,
      teamId: input.teamId,
      teamName: input.teamName,
      rowIndex: index + 1,
      label: row.cells[0]?.text || null,
      values: rowToValues(row),
      sourceUrl: input.sourceUrl,
    })),
  )
}

export function parseBisTeamMonthlyResultsHtml(
  html: string,
  input: { year: number; teamId: string; teamName: string; month: number; sourceUrl: string },
): BisTeamMonthlyResultRow[] {
  return parseBisGenericTeamTableHtml(html, input).map((row) => ({
    ...row,
    month: input.month,
    gameDate: inferGameDate(input.year, input.month, Object.values(row.values).join(' ')),
  }))
}

type ParsedRow = {
  headers: string[]
  cells: ReturnType<typeof parseCell>[]
}

function parseDataTables(html: string): Array<{ headers: string[]; rows: ParsedRow[] }> {
  return extractTopLevelElements(html, 'table').map((tableHtml) => {
    const rawRows = extractTopLevelElements(tableHtml, 'tr')
      .map((rowHtml) => extractTopLevelCells(rowHtml).map((cellHtml) => ({ ...parseCell(cellHtml), isHeader: /^<th\b/iu.test(cellHtml.trim()) })))
      .filter((cells) => cells.length > 0)
    const headerIndex = rawRows.findIndex((cells) => cells.every((cell) => cell.isHeader))
    const headers = (headerIndex >= 0 ? rawRows[headerIndex] : rawRows[0] ?? [])
      .map((cell, index) => cell.text || `col${index + 1}`)
    let activeHeaders = headers
    const bodyRows: ParsedRow[] = []
    for (const cells of rawRows.slice(headerIndex >= 0 ? headerIndex + 1 : 1)) {
      if (cells.every((cell) => cell.isHeader)) {
        activeHeaders = cells.map((cell, index) => cell.text || `col${index + 1}`)
      } else if (cells.some((cell) => cell.text || cell.links.length > 0)) bodyRows.push({ headers: activeHeaders, cells })
    }
    return { headers, rows: bodyRows }
  }).filter((table) => table.rows.length > 0)
}

function findPlayerCell(row: ParsedRow): { playerName: string; playerId: string | null } {
  for (const cell of row.cells) {
    const link = cell.links.find((item) => playerIdFromUrl(item.url) !== null)
    if (link) {
      return { playerName: link.name || cell.text, playerId: playerIdFromUrl(link.url) }
    }
  }
  return { playerName: '', playerId: null }
}

function valueByHeader(row: ParsedRow, names: string[]): string | null {
  const exact = row.headers.findIndex((header) => names.some((name) => cleanText(header) === name))
  const index = exact >= 0 ? exact : row.headers.findIndex((header) => names.some((name) => cleanText(header).includes(name)))
  return index >= 0 ? row.cells[index]?.text || null : null
}

function rowToValues(row: ParsedRow): Record<string, string> {
  return Object.fromEntries(row.cells.map((cell, index) => [
    row.headers[index] || `col${index + 1}`,
    cell.text,
  ]))
}

export function playerIdFromUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null
  }
  const match = absoluteUrl(url).match(/\/players\/([^/.]+)\.html/i)
  return match?.[1] ?? null
}

function inferGameDate(year: number, month: number, text: string): string | null {
  const match = cleanText(text).match(/(\d{1,2})[日/-]/u)
  if (!match?.[1]) {
    return null
  }
  return `${year}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

export type BisPlayerProfile = {
  playerId: string
  fullName: string
  teamName: string | null
  yearTeamsJson: string
  sourceUrl: string
}

export function parseBisPlayerProfileHtml(html: string, playerId: string, sourceUrl: string): BisPlayerProfile | null {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
  if (!titleMatch) return null
  // Title example includes an ideographic space between surname and given name.
  // cleanText converts U+3000 (全角スペース) to regular space
  const titleText = cleanText(titleMatch[1])
  const nameTeamMatch = titleText.match(/^([^（(|]+?)(?:（([^）)]+)）)?\s*(?:\|.*)?$/)
  if (!nameTeamMatch) return null
  const fullName = nameTeamMatch[1].trim()
  if (!fullName) return null
  const teamName = nameTeamMatch[2]?.trim() ?? null

  const yearTeams: Record<string, string | string[]> = {}
  for (const table of parseDataTables(html)) {
    const yearIdx = table.headers.findIndex((h) => h === '年度')
    const teamIdx = table.headers.findIndex((h) => h.includes('球団') || h === '所属')
    if (yearIdx < 0 || teamIdx < 0) continue
    for (const row of table.rows) {
      const year = row.cells[yearIdx]?.text
      const team = row.cells[teamIdx]?.text
      if (year && /^\d{4}$/u.test(year) && team && team !== '計') {
        const previous = yearTeams[year]
        if (!previous) yearTeams[year] = team
        else {
          const teams = [...new Set([...(Array.isArray(previous) ? previous : [previous]), team])]
          yearTeams[year] = teams.length === 1 ? teams[0]! : teams
        }
      }
    }
  }

  return { playerId, fullName, teamName, yearTeamsJson: JSON.stringify(yearTeams), sourceUrl }
}
