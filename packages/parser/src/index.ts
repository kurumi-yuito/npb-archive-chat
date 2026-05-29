import { crawlerPackage } from '@npb/crawler'
import { richGameSchema, type PlayerRef, type RichGame } from '@npb/schemas'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRichGameFromBisEngIndex, isBisEnglishGameHtml } from './bis-only.js'
export { isScoresRichGameComplete } from './rich-game-complete.js'
export { NoPlayByPlayAvailableError, parseScoresPlayByPlayHtml } from './scores-playbyplay.js'
export { parseScoresCalendarHtml } from './scores-calendar.js'
export { parseScoresIndexHtml } from './scores-index.js'
export { parseScoresBoxHtml } from './scores-box.js'
export { parseScoresRosterHtml } from './scores-roster.js'
export {
  emptyBisCurrentDataset,
  parseBisGenericTeamTableHtml,
  parseBisPlayerProfileHtml,
  parseBisPlayerStatsHtml,
  parseBisTeamMonthlyResultsHtml,
  parseBisTeamRosterHtml,
  playerIdFromUrl,
  type BisCurrentDataset,
  type BisCurrentRosterEntry,
  type BisGenericTeamRow,
  type BisPlayerProfile,
  type BisPlayerStatsRow,
  type BisSourceSnapshot,
  type BisSourceType,
  type BisTeamInfo,
  type BisTeamMonthlyResultRow,
} from './bis-current.js'
export type {
  ScoresCalendarGame,
  StructuredBattingLine,
  StructuredEvent,
  StructuredGame,
  StructuredLineScore,
  StructuredPitchingLine,
  StructuredRosterEntry,
  StructuredSourceEntry,
  StructuredSources,
} from './scores-types.js'

type RawGameFiles = {
  indexPath: string
  playByPlayPath: string
  boxPath: string
  rosterPath: string
}

type LoadedRawGame = RawGameFiles & {
  indexHtml: string
  playByPlayHtml: string
  boxHtml: string
  rosterHtml: string
}

type ParseContext = {
  year: number
  mmdd: string
  gameId: string
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = process.env.INIT_CWD ?? path.resolve(moduleDir, '../../..')

/**
 * Parse raw HTML into rich intermediate JSON (see AGENTS.md).
 */
export const upstreamCrawlerPackage: () => string = crawlerPackage

export function parserPackage(): string {
  return '@npb/parser'
}

export function inferContextFromGameDir(gameDir: string): ParseContext {
  const normalized = path.normalize(gameDir)
  const gameId = path.basename(normalized)
  const mmdd = path.basename(path.dirname(normalized))
  const year = Number(path.basename(path.dirname(path.dirname(normalized))))

  if (!/^\d{4}$/.test(mmdd) || !Number.isInteger(year)) {
    throw new Error(`Could not infer year/mmdd/gameId from ${gameDir}`)
  }

  return {
    year,
    mmdd,
    gameId,
  }
}

async function readUtf8IfExists(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    return ''
  }
}

export async function loadRawGameFromDir(gameDir: string): Promise<LoadedRawGame> {
  const files: RawGameFiles = {
    indexPath: path.join(gameDir, 'index.html'),
    playByPlayPath: path.join(gameDir, 'playbyplay.html'),
    boxPath: path.join(gameDir, 'box.html'),
    rosterPath: path.join(gameDir, 'roster.html'),
  }

  const [indexHtml, playByPlayHtml, boxHtml, rosterHtml] = await Promise.all([
    readFile(files.indexPath, 'utf8'),
    readUtf8IfExists(files.playByPlayPath),
    readUtf8IfExists(files.boxPath),
    readUtf8IfExists(files.rosterPath),
  ])

  return {
    ...files,
    indexHtml,
    playByPlayHtml,
    boxHtml,
    rosterHtml,
  }
}

export async function parseRawGameFromDir(gameDir: string): Promise<RichGame> {
  const context = inferContextFromGameDir(gameDir)
  const raw = await loadRawGameFromDir(gameDir)
  return parseRawGame(context, raw)
}

export async function writeRichGameJson(gameDir: string, outputPath?: string): Promise<string> {
  const resolvedGameDir = path.resolve(workspaceRoot, gameDir)
  const richGame = await parseRawGameFromDir(resolvedGameDir)
  const { isScoresRichGameComplete } = await import('./rich-game-complete.js')
  if (!isScoresRichGameComplete(richGame)) {
    throw new Error(
      'game.json は npb.jp/scores の playbyplay/box/roster が揃った試合だけ書き出せます。BIS index のみ・空配列のままでは書きません。enrich:scores-calendar で取得するか、raw に4ファイルを置いてください。',
    )
  }
  const context = inferContextFromGameDir(resolvedGameDir)
  const targetPath =
    (outputPath ? path.resolve(workspaceRoot, outputPath) : undefined) ??
    path.join(
      workspaceRoot,
      'data',
      'rich',
      String(context.year),
      context.mmdd,
      context.gameId,
      'game.json',
    )

  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, `${JSON.stringify(richGame, null, 2)}\n`, 'utf8')
  return targetPath
}

export async function parseRawGame(
  context: ParseContext,
  raw: LoadedRawGame,
): Promise<RichGame> {
  if (isBisEnglishGameHtml(raw.indexHtml)) {
    const fetchedAt = await computeFetchedAt([raw.indexPath])
    return buildRichGameFromBisEngIndex(
      context,
      { indexPath: raw.indexPath, indexHtml: raw.indexHtml },
      fetchedAt,
    )
  }

  if (!raw.playByPlayHtml || !raw.boxHtml || !raw.rosterHtml) {
    throw new Error(
      'Missing raw HTML: expected playbyplay.html, box.html, and roster.html next to index.html (scores サイト用)。BIS 単試合 index のみの場合は index.html が BIS 英語版である必要があります。',
    )
  }

  const indexData = parseIndexPage(context, raw.indexHtml)
  const playByPlay = parsePlayByPlayPage(raw.playByPlayHtml)
  const boxData = parseBoxPage(raw.boxHtml)
  const roster = parseRosterPage(raw.rosterHtml)
  const fetchedAt = await computeFetchedAt([
    raw.indexPath,
    raw.playByPlayPath,
    raw.boxPath,
    raw.rosterPath,
  ])

  const richGame = richGameSchema.parse({
    schemaVersion: 1,
    game_meta: indexData.gameMeta,
    top_summary: {
      linescore: indexData.linescore,
      result_pitchers: indexData.resultPitchers,
      batteries: indexData.batteries,
      home_runs: indexData.homeRuns,
      latest_order: indexData.latestOrder,
    },
    play_by_play: playByPlay,
    batting_box: boxData.batting,
    pitching_box: boxData.pitching,
    roster,
    sources: {
      index: {
        url: indexData.gameMeta.canonical_url,
        path: toProjectRelative(raw.indexPath),
      },
      playbyplay: {
        url: buildScoreUrl(context, 'playbyplay.html'),
        path: toProjectRelative(raw.playByPlayPath),
      },
      box: {
        url: buildScoreUrl(context, 'box.html'),
        path: toProjectRelative(raw.boxPath),
      },
      roster: {
        url: buildScoreUrl(context, 'roster.html'),
        path: toProjectRelative(raw.rosterPath),
      },
    },
    fetched_at: fetchedAt,
  })

  return richGame
}

const FULLWIDTH_DIGIT_BY_CHAR: Record<string, string> = {
  '０': '0',
  '１': '1',
  '２': '2',
  '３': '3',
  '４': '4',
  '５': '5',
  '６': '6',
  '７': '7',
  '８': '8',
  '９': '9',
}

/**
 * NPB scores の index に出る `<h3>` タイトル（日本シリーズ / CS / ファーム日本選手権などの表記）を解析する。
 */
export function parseNpbScoresIndexGameTitle(rawTitle: string): {
  competition: string
  homeTeamName: string
  awayTeamName: string
  game_number: number | null
} {
  const collapsed = rawTitle
    .replace(/\u3000/g, ' ')
    .replace(/[Ｖｖ][Ｓｓ]/g, 'vs')
    .replace(/\s+/g, ' ')
    .trim()

  const vsToken = String.raw`(?:vs|VS|ＶＳ|ｖｓ)`
  const main = collapsed.match(
    new RegExp(`^【(.+?)】\\s*(.+?)\\s+${vsToken}\\s+(.+?)\\s+(.+)$`, 'u'),
  )
  if (!main) {
    throw new Error(`Unexpected game title format: ${rawTitle}`)
  }

  const [, competition, homeTeamName, awayTeamName, suffixRaw] = main
  const suffix = [...suffixRaw.trim()]
    .map((ch) => FULLWIDTH_DIGIT_BY_CHAR[ch] ?? ch)
    .join('')

  const kaiSen = suffix.match(/^(\d+)回戦$/)
  if (kaiSen) {
    return {
      competition: competition.trim(),
      homeTeamName: homeTeamName.trim(),
      awayTeamName: awayTeamName.trim(),
      game_number: Number(kaiSen[1]),
    }
  }

  const daiSen = suffix.match(/^第(\d+)戦$/)
  if (daiSen) {
    return {
      competition: competition.trim(),
      homeTeamName: homeTeamName.trim(),
      awayTeamName: awayTeamName.trim(),
      game_number: Number(daiSen[1]),
    }
  }

  if (/^(決勝|準決勝)$/u.test(suffix)) {
    return {
      competition: competition.trim(),
      homeTeamName: homeTeamName.trim(),
      awayTeamName: awayTeamName.trim(),
      game_number: null,
    }
  }

  throw new Error(`Unexpected game title format: ${rawTitle}`)
}

function parseIndexPage(context: ParseContext, html: string) {
  const canonicalUrl = requiredMatch(
    html,
    /<link rel="canonical" href="([^"]+)">/,
    'canonical URL',
  )[1]
  const dateLabel = cleanText(
    requiredMatch(html, /<time>([\s\S]*?)<\/time>/, 'game date label')[1],
  )
  const venue = cleanText(
    requiredMatch(html, /<span class="place">([\s\S]*?)<\/span>/, 'venue')[1],
  )
  const rawTitle = cleanText(requiredMatch(html, /<h3>([\s\S]*?)<\/h3>/, 'game title')[1])
  const titleParsed = parseNpbScoresIndexGameTitle(rawTitle)
  const { competition, homeTeamName, awayTeamName, game_number: gameNumberParsed } = titleParsed
  const linescore = parseLineScore(html)
  const latestOrder = parseLatestOrder(html)
  const gameInfoText = cleanText(
    requiredMatch(html, /<p class="game_info">([\s\S]*?)<\/p>/, 'game info')[1],
  )

  const status = extractBracketValue(gameInfoText)
  const startTime = captureOptional(gameInfoText, /◇開始\s*([0-9:]+)/)
  const endTime = captureOptional(gameInfoText, /◇終了\s*([0-9:]+)/)
  const durationText = captureOptional(gameInfoText, /◇試合時間\s*([0-9時間分]+)/)
  const attendanceText = captureOptional(gameInfoText, /◇入場者\s*([\d,]+)人/)
  const attendance = attendanceText ? Number(attendanceText.replaceAll(',', '')) : null

  const gameMeta = {
    year: context.year,
    mmdd: context.mmdd,
    game_id: context.gameId,
    canonical_url: canonicalUrl,
    date: `${context.year}-${context.mmdd.slice(0, 2)}-${context.mmdd.slice(2, 4)}`,
    date_label: dateLabel,
    venue,
    competition,
    matchup_text: `${homeTeamName} vs ${awayTeamName}`,
    game_number: gameNumberParsed,
    status,
    start_time: startTime,
    end_time: endTime,
    duration_text: durationText,
    attendance: Number.isFinite(attendance) ? attendance : null,
    umpires: parseUmpires(html),
    away_team: {
      name: linescore.away.team,
      short_name: extractShortTeamName(html, 'top'),
    },
    home_team: {
      name: linescore.home.team,
      short_name: extractShortTeamName(html, 'bottom'),
    },
  }

  return {
    gameMeta,
    linescore,
    resultPitchers: parseResultPitchers(html),
    batteries: parseBatteries(html),
    homeRuns: parseHomeRuns(html),
    latestOrder,
  }
}

function parseLineScore(html: string) {
  const tableHtml = requiredMatch(
    html,
    /<div id="table_linescore">([\s\S]*?)<\/table>[\s\S]*?<\/div>/,
    'line score table',
  )[1]
  const headerRow = requiredMatch(tableHtml, /<thead>[\s\S]*?<tr>([\s\S]*?)<\/tr>/, 'line score header')[1]
  const bodyRows = extractTopLevelElements(
    requiredMatch(tableHtml, /<tbody>([\s\S]*?)<\/tbody>/, 'line score body')[1],
    'tr',
  )
  const [awayRow, homeRow] = bodyRows
  if (!awayRow || !homeRow) {
    throw new Error('Line score rows are missing')
  }

  const inningHeaders = extractTopLevelCells(headerRow)
    .slice(1)
    .map(parseCell)
    .map((cell) => cell.text)
    .filter((cell) => /^\d+$/.test(cell))

  const parseTeamRow = (rowHtml: string) => {
    const cells = extractTopLevelCells(rowHtml).map(parseCell)
    const visibleTeam = cleanText(rowHtml.match(/<span class="hide_sp">([\s\S]*?)<\/span>/)?.[1] ?? '')
    const team = visibleTeam || cells[0]?.text || ''
    const inningValues = cells.slice(1, 1 + inningHeaders.length).map((cell) => cell.text)
    const totals = cells.slice(1 + inningHeaders.length)
    return {
      team,
      innings: inningValues,
      totals: {
        runs: Number(totals[0]?.text ?? '0'),
        hits: Number(totals[1]?.text ?? '0'),
        errors: Number(totals[2]?.text ?? '0'),
      },
    }
  }

  return {
    innings: inningHeaders,
    away: parseTeamRow(awayRow),
    home: parseTeamRow(homeRow),
  }
}

function parseUmpires(html: string) {
  const umpireText = cleanText(
    requiredMatch(html, /<p class="referee_info">([\s\S]*?)<\/p>/, 'umpire info')[1],
  )

  return umpireText
    .split('、')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const match = chunk.match(/^(.+?)：(.+)$/)
      if (!match) {
        return null
      }

      return {
        role: match[1].trim(),
        name: match[2].trim(),
      }
    })
    .filter((value): value is { role: string; name: string } => value !== null)
}

function parseResultPitchers(html: string) {
  const sectionHtml = requiredMatch(
    html,
    /<section class="game_result_info">([\s\S]*?)<\/section>/,
    'game result info section',
  )[1]
  const tables = extractTopLevelElements(sectionHtml, 'table')
  const firstTable = tables[0]
  if (!firstTable) {
    throw new Error('Result pitcher table is missing')
  }

  const entries = extractTopLevelElements(firstTable, 'tr').map((rowHtml) => {
    const cells = extractTopLevelCells(rowHtml).map(parseCell)
    const label = cells[0]?.text.replace(/[【】]/g, '') ?? ''
    const player = cells[1]?.links[0] ?? null
    const recordMatch = cells[1]?.text.match(/（(.+?)）/)

    return {
      key:
        label === '勝投手'
          ? 'winner'
          : label === '敗投手'
            ? 'loser'
            : label === 'セーブ'
              ? 'save'
              : null as 'winner' | 'loser' | 'save' | null,
      value: player
        ? {
            label,
            player,
            record_text: recordMatch?.[1] ?? null,
          }
        : null,
    }
  })

  const result: {
    winner: { label: string; player: PlayerRef; record_text: string | null } | null
    loser: { label: string; player: PlayerRef; record_text: string | null } | null
    save: { label: string; player: PlayerRef; record_text: string | null } | null
  } = {
    winner: null,
    loser: null,
    save: null,
  }

  for (const entry of entries) {
    if (entry.key) {
      result[entry.key] = entry.value
    }
  }

  return result
}

function parseBatteries(html: string) {
  const batteryTable = extractLabeledTable(html, 'バッテリー')
  return extractTopLevelElements(batteryTable, 'tr').map((rowHtml) => {
    const cells = extractTopLevelCells(rowHtml).map(parseCell)
    const team = cells[0]?.text.replace(/[【】]/g, '') ?? ''
    const rawText = cells[1]?.text ?? ''
    const [pitcherText, catcherText] = rawText.split('‐').map((value) => value.trim())
    const pitchers = cells[1]?.links.filter((link) => pitcherText.includes(link.name)) ?? []
    const catcher =
      (cells[1]?.links.find((link) => catcherText?.includes(link.name)) as PlayerRef | undefined) ??
      null

    return {
      team,
      pitchers,
      catcher,
      raw_text: rawText,
    }
  })
}

function parseHomeRuns(html: string) {
  const homeRunTable = extractLabeledTable(html, '本塁打')
  return extractTopLevelElements(homeRunTable, 'tr').map((rowHtml) => {
    const cells = extractTopLevelCells(rowHtml).map(parseCell)
    const team = cells[0]?.text.replace(/[【】]/g, '') ?? ''
    const rawText = cells[1]?.text ?? ''
    const rawHtml = cells[1]?.rawHtml ?? ''

    const items = splitJapaneseListHtml(rawHtml).map((itemHtml) => {
      const itemLinks = extractLinks(itemHtml)
      const itemText = cleanText(stripTags(itemHtml))
      return {
        batter: itemLinks[0] ?? null,
        pitcher: itemLinks.length > 1 ? itemLinks[itemLinks.length - 1] ?? null : null,
        raw_text: itemText,
      }
    })

    return {
      team,
      raw_text: rawText,
      items: rawText ? items : [],
    }
  })
}

function parseLatestOrder(html: string) {
  const orderSection = requiredMatch(
    html,
    /<div class="wrap" id="player-order">([\s\S]*?)<\/div>\s*<\/div>/,
    'latest order section',
  )[1]

  return extractHalfSections(orderSection).map((sectionHtml) => {
    const team = cleanText(requiredMatch(sectionHtml, /<h5>([\s\S]*?)<\/h5>/, 'order team')[1])
    const tableHtml = requiredMatch(sectionHtml, /<table>([\s\S]*?)<\/table>/, 'order table')[1]
    const entries = extractTopLevelElements(tableHtml, 'tr').map((rowHtml) => {
      const cells = extractTopLevelCells(rowHtml).map(parseCell)
      return {
        batting_order: normalizeNumber(cells[0]?.text ?? null),
        position: cells[1]?.text ?? '',
        player: requiredPlayerRef(cells[2]?.links[0] ?? null, 'latest order player'),
        note: normalizeNullableText(cells[3]?.text ?? null),
      }
    })

    return {
      team,
      entries,
    }
  })
}

function parsePlayByPlayPage(html: string) {
  const progressSection = requiredMatch(
    html,
    /<div id="progress">([\s\S]*?)<\/div>\s*<\/div>/,
    'play by play section',
  )[1]
  const halfBlocks = splitHalfInnings(progressSection)
  const currentPitchers: Record<'top' | 'bottom', PlayerRef | null> = {
    top: null,
    bottom: null,
  }

  const events: RichGame['play_by_play'] = []
  let eventIndex = 0

  for (const halfBlock of halfBlocks) {
    const defendingHalf = halfBlock.half === 'top' ? 'top' : 'bottom'
    const tables = extractTopLevelElements(halfBlock.html, 'table')

    for (const tableHtml of tables) {
      const rows = extractTopLevelElements(tableHtml, 'tr')
      for (const rowHtml of rows) {
        const cells = extractTopLevelCells(rowHtml).map(parseCell)
        if (cells.length === 1) {
          const resultText = cells[0]?.text ?? ''
          const links = cells[0]?.links ?? []
          const firstLink = links[0] ?? null
          const secondLink = links[1] ?? null

          let eventType: RichGame['play_by_play'][number]['event_type'] = 'substitution'
          let eventSubtype: RichGame['play_by_play'][number]['event_subtype'] = 'other'
          if (resultText.startsWith('（先発投手）')) {
            eventType = 'game_note'
            eventSubtype = 'starting_pitcher'
            currentPitchers[defendingHalf] = firstLink
          } else if (resultText.startsWith('（投手交代）')) {
            eventSubtype = 'pitching_change'
            currentPitchers[defendingHalf] = secondLink
          } else if (resultText.startsWith('（守備変更）')) {
            eventSubtype = 'defensive_switch'
          } else if (
            resultText.startsWith('（代走）') ||
            resultText.startsWith('（臨時代走）')
          ) {
            eventSubtype = 'pinch_runner'
          }

          events.push({
            event_index: eventIndex,
            inning: halfBlock.inning,
            half: halfBlock.half,
            inning_label: halfBlock.label,
            offense_team: halfBlock.offenseTeam,
            pitcher: currentPitchers[defendingHalf],
            event_type: eventType,
            event_subtype: eventSubtype,
            outs: null,
            bases: null,
            batter: null,
            count: null,
            result: {
              text: resultText,
              runs_batted_in: extractRbi(resultText),
              links,
            },
            event_attributes: null,
            raw_row_html: rowHtml,
          })
          eventIndex += 1
          continue
        }

        const batterCell = cells[2]
        const rawBatterText = batterCell?.text ?? ''
        const batterPrefixMatch = rawBatterText.match(/^(.+?)・(.+)$/)
        const batterPlayer =
          batterCell?.links[0] ??
          (rawBatterText && rawBatterText !== ' '
            ? { name: rawBatterText, url: null }
            : null)

        const resultText = cells[4]?.text ?? ''
        const resultLinks = cells[4]?.links ?? []
        const eventType = rawBatterText ? 'plate_appearance' : 'runner_event'
        const eventSubtype = rawBatterText
          ? rawBatterText.startsWith('代打・')
            ? 'pinch_hitter'
            : 'standard'
          : classifyRunnerEventSubtype(resultText)
        const runner = eventType === 'runner_event' ? extractRunnerRef(resultText, resultLinks) : null
        const previousEvent = events.at(-1) ?? null

        events.push({
          event_index: eventIndex,
          inning: halfBlock.inning,
          half: halfBlock.half,
          inning_label: halfBlock.label,
          offense_team: halfBlock.offenseTeam,
          pitcher: currentPitchers[defendingHalf],
          event_type: eventType,
          event_subtype: eventSubtype,
          outs: normalizeNullableText(cells[0]?.text ?? null),
          bases: normalizeNullableText(cells[1]?.text ?? null),
          batter: rawBatterText
            ? {
                role_prefix: batterPrefixMatch?.[1] ?? null,
                player: batterPlayer,
                raw_text: rawBatterText,
              }
            : null,
          count: normalizeNullableText(cells[3]?.text ?? null),
          result: {
            text: resultText,
            runs_batted_in: extractRbi(resultText),
            links: resultLinks,
          },
          event_attributes:
            eventType === 'runner_event'
              ? {
                  runner,
                  implied_substitution_subtype: inferImpliedSubstitutionSubtype(
                    previousEvent,
                    runner,
                    resultText,
                  ),
                }
              : null,
          raw_row_html: rowHtml,
        })
        eventIndex += 1
      }
    }
  }

  return events
}

function parseBoxPage(html: string) {
  const sections = extractTopLevelElements(
    requiredMatch(
      html,
      /<div class="wrap">[\s\S]*?<section>[\s\S]*<\/section>\s*<section>[\s\S]*<\/section>[\s\S]*?<\/div>\s*<\/div>/,
      'box content',
    )[0],
    'section',
  )

  const batting = sections.map((sectionHtml, index) => {
    const team = cleanText(requiredMatch(sectionHtml, /<h4>([\s\S]*?)<\/h4>/, 'box team')[1])
    const tableId = index === 0 ? 'table_top_b' : 'table_bottom_b'
    return parseBattingTable(team, sectionHtml, tableId)
  })

  const pitching = sections.map((sectionHtml, index) => {
    const team = cleanText(requiredMatch(sectionHtml, /<h4>([\s\S]*?)<\/h4>/, 'pitching team')[1])
    const tableId = index === 0 ? 'table_top_p' : 'table_bottom_p'
    return parsePitchingTable(team, sectionHtml, tableId)
  })

  return { batting, pitching }
}

function parseBattingTable(team: string, sectionHtml: string, tableId: string) {
  const tableHtml = extractTableById(sectionHtml, tableId)
  const theadHtml = extractTopLevelElements(tableHtml, 'thead')[0] ?? ''
  const tbodyHtml = extractTopLevelElements(tableHtml, 'tbody')[0] ?? ''
  const tfootHtml = extractTopLevelElements(tableHtml, 'tfoot')[0] ?? ''
  const headerRowHtml = extractTopLevelElements(theadHtml, 'tr')[0] ?? ''
  const footerRowHtml = extractTopLevelElements(tfootHtml, 'tr')[0] ?? ''
  const headers = extractTopLevelCells(
    headerRowHtml,
  )
    .map(parseCell)
    .map((cell, index) => (cell.text ? cell.text : index === 0 ? '打順' : `col_${index}`))

  const inningHeaders = headers.slice(8)
  const bodyRows = extractTopLevelElements(tbodyHtml, 'tr')

  const rows = bodyRows.map((rowHtml) => {
    const cells = extractTopLevelCells(rowHtml).map(parseCell)
    const inningResults = cells.slice(8).map((cell, index) => ({
      inning: inningHeaders[index] ?? String(index + 1),
      text: cell.text,
      classes: cell.classes,
    }))

    return {
      batting_order: normalizeNumber(cells[0]?.text ?? null),
      position: cells[1]?.text ?? '',
      player: requiredPlayerRef(cells[2]?.links[0] ?? null, 'batting box player'),
      stats: {
        at_bats: Number(cells[3]?.text ?? '0'),
        runs: Number(cells[4]?.text ?? '0'),
        hits: Number(cells[5]?.text ?? '0'),
        runs_batted_in: Number(cells[6]?.text ?? '0'),
        stolen_bases: Number(cells[7]?.text ?? '0'),
      },
      inning_results: inningResults,
    }
  })

  const footerCells = extractTopLevelCells(
    footerRowHtml,
  ).map(parseCell)

  return {
    team,
    headers,
    rows,
    team_totals: {
      at_bats: Number(footerCells[3]?.text ?? '0'),
      runs: Number(footerCells[4]?.text ?? '0'),
      hits: Number(footerCells[5]?.text ?? '0'),
      runs_batted_in: Number(footerCells[6]?.text ?? '0'),
      stolen_bases: Number(footerCells[7]?.text ?? '0'),
    },
  }
}

function parsePitchingTable(team: string, sectionHtml: string, tableId: string) {
  const tableHtml = extractTableById(sectionHtml, tableId)
  const theadHtml = extractTopLevelElements(tableHtml, 'thead')[0] ?? ''
  const tbodyHtml = extractTopLevelElements(tableHtml, 'tbody')[0] ?? ''
  const tfootHtml = extractTopLevelElements(tableHtml, 'tfoot')[0] ?? ''
  const headerRowHtml = extractTopLevelElements(theadHtml, 'tr')[0] ?? ''
  const footerRowHtml = extractTopLevelElements(tfootHtml, 'tr')[0] ?? ''
  const headers = extractTopLevelCells(
    headerRowHtml,
  )
    .map(parseCell)
    .map((cell, index) => (cell.text ? cell.text : index === 0 ? '結果' : `col_${index}`))

  const bodyRows = extractTopLevelElements(tbodyHtml, 'tr')

  const rows = bodyRows.map((rowHtml) => {
    const cells = extractTopLevelCells(rowHtml).map(parseCell)
    return {
      decision: normalizeNullableText(cells[0]?.text ?? null),
      pitcher: requiredPlayerRef(cells[1]?.links[0] ?? null, 'pitching box player'),
      pitch_count: Number(cells[2]?.text ?? '0'),
      batters_faced: Number(cells[3]?.text ?? '0'),
      innings_pitched: parseNestedCellText(cells[4]?.rawHtml ?? ''),
      hits: Number(cells[5]?.text ?? '0'),
      home_runs: Number(cells[6]?.text ?? '0'),
      walks: Number(cells[7]?.text ?? '0'),
      hit_batters: Number(cells[8]?.text ?? '0'),
      strikeouts: Number(cells[9]?.text ?? '0'),
      wild_pitches: Number(cells[10]?.text ?? '0'),
      balks: Number(cells[11]?.text ?? '0'),
      runs: Number(cells[12]?.text ?? '0'),
      earned_runs: Number(cells[13]?.text ?? '0'),
    }
  })

  const footerCells = extractTopLevelCells(
    footerRowHtml,
  ).map(parseCell)

  return {
    team,
    headers,
    rows,
    team_totals: {
      pitch_count: Number(footerCells[2]?.text ?? '0'),
      batters_faced: Number(footerCells[3]?.text ?? '0'),
      innings_pitched: parseNestedCellText(footerCells[4]?.rawHtml ?? ''),
      hits: Number(footerCells[5]?.text ?? '0'),
      home_runs: Number(footerCells[6]?.text ?? '0'),
      walks: Number(footerCells[7]?.text ?? '0'),
      hit_batters: Number(footerCells[8]?.text ?? '0'),
      strikeouts: Number(footerCells[9]?.text ?? '0'),
      wild_pitches: Number(footerCells[10]?.text ?? '0'),
      balks: Number(footerCells[11]?.text ?? '0'),
      runs: Number(footerCells[12]?.text ?? '0'),
      earned_runs: Number(footerCells[13]?.text ?? '0'),
    },
  }
}

function parseRosterPage(html: string) {
  const rosterSection = requiredMatch(
    html,
    /<div class="wrap">[\s\S]*?<div class="half_left">[\s\S]*?<div class="half_right">[\s\S]*?<\/div>\s*<\/div>/,
    'roster section',
  )[0]

  return extractHalfSections(rosterSection).map((sectionHtml) => {
    const team = cleanText(requiredMatch(sectionHtml, /<h5>([\s\S]*?)<\/h5>/, 'roster team')[1])
    const tableHtml = requiredMatch(sectionHtml, /<table>([\s\S]*?)<\/table>/, 'roster table')[1]
    const rows = extractTopLevelElements(tableHtml, 'tr')
    const groups: RichGame['roster'][number]['groups'] = []
    let currentGroup: RichGame['roster'][number]['groups'][number] | null = null

    for (const rowHtml of rows) {
      const cells = extractTopLevelCells(rowHtml).map(parseCell)
      if (cells.length === 1) {
        currentGroup = {
          label: cells[0]?.text ?? '',
          entries: [],
        }
        groups.push(currentGroup)
        continue
      }

      if (!currentGroup) {
        throw new Error(`Roster group missing before entry for ${team}`)
      }

      const handedness = cells[2]?.text ?? ''
      const handednessMatch = handedness.match(/^([右左両])投([右左両])打$/)

      currentGroup.entries.push({
        number: cells[0]?.text ?? '',
        player: requiredPlayerRef(cells[1]?.links[0] ?? null, 'roster player'),
        throws: (handednessMatch?.[1] as '右' | '左' | '両' | undefined) ?? null,
        bats: (handednessMatch?.[2] as '右' | '左' | '両' | undefined) ?? null,
        raw_handedness: handedness,
      })
    }

    return {
      team,
      groups,
    }
  })
}

function extractHalfSections(html: string) {
  const matches = [...html.matchAll(/<div class="half_(left|right)">([\s\S]*?)<\/div>/g)]
  return matches.map((match) => match[2])
}

function splitHalfInnings(progressHtml: string) {
  const marker = /<h5[^>]*>([\s\S]*?)<\/h5>/g
  const matches = [...progressHtml.matchAll(marker)]
  return matches.map((match, index) => {
    const start = match.index ?? 0
    const contentStart = start + match[0].length
    const contentEnd = index + 1 < matches.length ? matches[index + 1].index ?? progressHtml.length : progressHtml.length
    const label = cleanText(match[1])
    const headerMatch = label.match(/^(\d+)回([表裏])（(.+?)の攻撃）$/)
    if (!headerMatch) {
      throw new Error(`Unexpected inning label: ${label}`)
    }

    return {
      inning: Number(headerMatch[1]),
      half: headerMatch[2] === '表' ? 'top' : 'bottom' as 'top' | 'bottom',
      offenseTeam: headerMatch[3],
      label,
      html: progressHtml.slice(contentStart, contentEnd),
    }
  })
}

function extractTopLevelElements(html: string, tagName: string) {
  const matcher = new RegExp(`<(/?)${tagName}\\b[^>]*>`, 'gi')
  const results: string[] = []
  let startIndex = -1
  let depth = 0
  let match: RegExpExecArray | null

  while ((match = matcher.exec(html)) !== null) {
    const isClosing = match[1] === '/'
    if (!isClosing) {
      if (depth === 0) {
        startIndex = match.index
      }
      depth += 1
    } else {
      depth -= 1
      if (depth === 0 && startIndex >= 0) {
        results.push(html.slice(startIndex, matcher.lastIndex))
        startIndex = -1
      }
    }
  }

  return results
}

function extractTopLevelCells(rowHtml: string) {
  const matcher = /<(\/?)(td|th)\b[^>]*>/gi
  const results: string[] = []
  let startIndex = -1
  let depth = 0
  let match: RegExpExecArray | null

  while ((match = matcher.exec(rowHtml)) !== null) {
    const isClosing = match[1] === '/'
    if (!isClosing) {
      if (depth === 0) {
        startIndex = match.index
      }
      depth += 1
    } else {
      depth -= 1
      if (depth === 0 && startIndex >= 0) {
        results.push(rowHtml.slice(startIndex, matcher.lastIndex))
        startIndex = -1
      }
    }
  }

  return results
}

function parseCell(cellHtml: string) {
  const tagMatch = cellHtml.match(/^<(td|th)([^>]*)>/i)
  const attributes = tagMatch?.[2] ?? ''
  const classes =
    attributes.match(/class="([^"]+)"/)?.[1]
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean) ?? []
  const innerHtml = cellHtml.replace(/^<t[dh][^>]*>/i, '').replace(/<\/t[dh]>$/i, '')
  const text = cleanText(stripTags(innerHtml))
  const links = extractLinks(innerHtml)

  return {
    text,
    classes,
    links,
    rawHtml: innerHtml,
  }
}

function extractLinks(html: string): PlayerRef[] {
  return [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => ({
    name: cleanText(stripTags(match[2])),
    url: absoluteUrl(match[1]),
  }))
}

function extractTableById(html: string, id: string) {
  const containerHtml = extractDivById(html, id)
  const tableHtml = extractTopLevelElements(containerHtml, 'table')[0]
  if (!tableHtml) {
    throw new Error(`Could not find table ${id}`)
  }

  return tableHtml
}

function extractLabeledTable(html: string, label: string) {
  return requiredMatch(
    html,
    new RegExp(`<h4>${label}<\\/h4>\\s*<table>([\\s\\S]*?)<\\/table>`),
    `${label} table`,
  )[1]
}

function extractDivById(html: string, id: string) {
  const matcher = /<(\/?)div\b([^>]*)>/gi
  let match: RegExpExecArray | null
  let startIndex = -1
  let depth = 0

  while ((match = matcher.exec(html)) !== null) {
    const isClosing = match[1] === '/'
    const attrs = match[2] ?? ''
    if (!isClosing) {
      if (startIndex < 0 && attrs.includes(`id="${id}"`)) {
        startIndex = match.index
        depth = 1
        continue
      }

      if (startIndex >= 0) {
        depth += 1
      }
    } else if (startIndex >= 0) {
      depth -= 1
      if (depth === 0) {
        return html.slice(startIndex, matcher.lastIndex)
      }
    }
  }

  throw new Error(`Could not find div ${id}`)
}

function extractShortTeamName(html: string, rowClass: 'top' | 'bottom') {
  const rowHtml = requiredMatch(
    html,
    new RegExp(`<tr class="${rowClass}">([\\s\\S]*?)<\\/tr>`),
    `${rowClass} line score row`,
  )[1]
  const match = rowHtml.match(/<span class="hide_pc">([\s\S]*?)<\/span>/)
  return match ? cleanText(match[1]) : null
}

function parseNestedCellText(html: string) {
  return cleanText(stripTags(html))
}

function computeFetchedAt(paths: string[]) {
  return Promise.all(paths.map((value) => stat(value))).then((stats) => {
    const latest = stats.reduce((max, entry) => (entry.mtimeMs > max.mtimeMs ? entry : max))
    return latest.mtime.toISOString()
  })
}

function buildScoreUrl(context: ParseContext, leaf: string) {
  if (leaf === 'index.html') {
    return `https://npb.jp/scores/${context.year}/${context.mmdd}/${context.gameId}/`
  }

  return `https://npb.jp/scores/${context.year}/${context.mmdd}/${context.gameId}/${leaf}`
}

function absoluteUrl(url: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  return `https://npb.jp${url}`
}

function stripTags(html: string) {
  return decodeHtmlEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
}

function cleanText(value: string) {
  return value.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function requiredMatch(html: string, pattern: RegExp, label: string) {
  const match = html.match(pattern)
  if (!match) {
    throw new Error(`Could not find ${label}`)
  }

  return match
}

function captureOptional(value: string, pattern: RegExp) {
  return value.match(pattern)?.[1] ?? null
}

function normalizeNullableText(value: string | null) {
  if (!value) {
    return null
  }

  const normalized = cleanText(value)
  return normalized && normalized !== '&nbsp;' ? normalized : null
}

function normalizeNumber(value: string | null) {
  if (!value) {
    return null
  }

  const normalized = cleanText(value)
  return /^\d+$/.test(normalized) ? Number(normalized) : null
}

function extractBracketValue(value: string) {
  return value.match(/【(.+?)】/)?.[1] ?? null
}

function extractRbi(value: string) {
  const match = value.match(/打点(\d+)/)
  return match ? Number(match[1]) : null
}

function classifyRunnerEventSubtype(
  value: string,
): RichGame['play_by_play'][number]['event_subtype'] {
  if (value.includes('盗塁成功')) {
    return 'stolen_base'
  }

  if (
    value.includes('盗塁失敗') ||
    value.includes('けん制') ||
    value.includes('牽制')
  ) {
    return 'caught_stealing'
  }

  if (value.includes('ワイルドピッチ') || value.includes('ボーク')) {
    return 'advance'
  }

  return 'other'
}

function extractRunnerRef(value: string, links: PlayerRef[]) {
  if (!value.startsWith('（走者・')) {
    return null
  }

  return links[0] ?? null
}

function inferImpliedSubstitutionSubtype(
  previousEvent: RichGame['play_by_play'][number] | null,
  runner: PlayerRef | null,
  value: string,
): 'pinch_runner' | null {
  if (!runner || !value.startsWith('（走者・') || !previousEvent) {
    return null
  }

  if (previousEvent.event_type !== 'plate_appearance' || !previousEvent.batter?.player) {
    return null
  }

  if (!didBatterReachBase(previousEvent.result.text)) {
    return null
  }

  return previousEvent.batter.player.name !== runner.name ? 'pinch_runner' : null
}

function didBatterReachBase(value: string) {
  return /(ヒット|フォアボール|四球|デッドボール|死球|エラー|内野安打|出塁)/.test(value)
}

function requiredPlayerRef(player: PlayerRef | null, label: string) {
  if (!player) {
    throw new Error(`Missing ${label}`)
  }

  return player
}

function splitJapaneseListHtml(value: string) {
  return value
    .split(/、(?=[^）]*(?:$|（))/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function toProjectRelative(filePath: string) {
  const relativePath = path.relative(workspaceRoot, filePath)
  return relativePath.startsWith('..') ? filePath : relativePath
}
