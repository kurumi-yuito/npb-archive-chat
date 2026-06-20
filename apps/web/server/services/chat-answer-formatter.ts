import type {
  ChatResponse,
  ChatSource,
  ChatStructuredQuery,
  PlayerCandidate,
} from '@npb/schemas'
import type {
  AggregateRow,
  BattingLineRow,
  GameDetailRow,
  GameSummaryRow,
  PlayerAffiliationRow,
  PitchingLineRow,
  RosterEntryRow,
} from '@npb/db'
import type { PlayerResolution } from './player-resolution'
import type { ChatExecutionMetadata } from './chat-query-plan'

type FormatChatAnswerInput = {
  question: string
  structuredQuery: ChatStructuredQuery
  results: ChatResponse['results']
  sources: ChatSource[]
  playerResolution?: PlayerResolution | null
  executionMetadata?: ChatExecutionMetadata
}

type EventSummaryRow = ChatResponse['results']['events'][number]
type GameSummaryRowWithLinescore = GameSummaryRow & { linescoreJson?: string | null }

export function formatChatAnswer({
  question,
  structuredQuery,
  results,
  sources,
  playerResolution = null,
  executionMetadata,
}: FormatChatAnswerInput): ChatResponse['answer'] {
  const sourceUrls = Array.from(new Set([
    ...sources.map((source) => source.source_url),
    ...results.events.flatMap((row) => row.sourceUrl ? [row.sourceUrl] : []),
    ...results.affiliations.flatMap((row) => row.sourceUrl ? [row.sourceUrl] : []),
    ...results.batting.flatMap((row) => row.sourceUrl ? [row.sourceUrl] : []),
    ...results.pitching.flatMap((row) => row.sourceUrl ? [row.sourceUrl] : []),
    ...results.games.flatMap((row) => compactSourceUrlFromLinescore((row as GameSummaryRowWithLinescore).linescoreJson)),
    ...results.gameDetails.flatMap((row) => compactSourceUrlFromLinescore(row.linescoreJson)),
  ]))
  const resultCount =
    structuredQuery.intent === 'search_events'
      ? results.events.length
      : structuredQuery.intent === 'search_games'
        ? results.games.length
        : structuredQuery.intent === 'search_batting'
          ? results.batting.length
          : structuredQuery.intent === 'search_pitching'
            ? results.pitching.length
            : structuredQuery.intent === 'search_roster'
              ? results.roster.length
              : structuredQuery.intent === 'player_affiliation'
                ? results.affiliations.length
              : structuredQuery.intent === 'game_detail'
        ? results.gameDetails.length
        : results.aggregates.length
  const remainingCount = structuredQuery.intent === 'search_events'
    ? Math.max(0, resultCount - SEARCH_EVENTS_SUMMARY_LIMIT)
    : 0

  return {
    summary: buildSummary(question, structuredQuery, results, resultCount, playerResolution),
    result_count: resultCount,
    ...(remainingCount > 0 ? { remaining_count: remainingCount } : {}),
    source_urls: sourceUrls,
    resolved_player: playerResolution,
    applied_filters: structuredQuery.filters,
    ...(executionMetadata
      ? {
          execution_metadata: {
            data_requirements: executionMetadata.dataRequirements,
            repositories: executionMetadata.repositories,
            player_id_required: executionMetadata.playerIdRequired,
            player_id_satisfied: executionMetadata.playerIdSatisfied,
          },
        }
      : {}),
  }
}

const SEARCH_EVENTS_SUMMARY_LIMIT = 20

function buildSummary(
  question: string,
  structuredQuery: ChatStructuredQuery,
  results: ChatResponse['results'],
  resultCount: number,
  playerResolution: PlayerResolution | null,
): string {
  if (playerResolution?.status === 'not_found') {
    return `選手候補は0件です。入力「${playerResolution.input}」は、収録対象（2016年以降のNPB一軍・ファーム出場記録）では確認できません。2016年以降にNPB公式戦へ出場した選手名を指定すると、年度をさかのぼって成績を集計します。`
  }
  if (playerResolution?.status === 'ambiguous') {
    return `どの${playerResolution.input}ですか。選手候補が複数あるため検索を実行しませんでした。候補：${formatCandidates(playerResolution.candidates)}。フルネームまたはチーム名を指定してください。`
  }

  const noticePrefix = [
    playerResolution?.yearShiftNote,
    playerResolution?.teamCorrectionNote,
  ].filter(Boolean).map((note) => `【注意】${note}`).join('\n')
  const yearShiftPrefix = noticePrefix ? `${noticePrefix}\n\n` : ''

  if (resultCount === 0) {
    let notFoundMsg: string
    if (structuredQuery.intent === 'search_games') {
      notFoundMsg = '条件に一致する試合は見つかりませんでした。'
    } else if (structuredQuery.intent === 'search_batting' || structuredQuery.intent === 'aggregate_batting') {
      notFoundMsg = '条件に一致する打撃成績は見つかりませんでした。確認できる記録にないため、推測では回答しません。'
    } else if (structuredQuery.intent === 'search_pitching') {
      notFoundMsg = '条件に一致する投手成績は見つかりませんでした。'
    } else if (structuredQuery.intent === 'aggregate_pitching') {
      notFoundMsg = '条件に一致する投手集計は見つかりませんでした。確認できる記録にないため、推測では回答しません。'
    } else if (structuredQuery.intent === 'search_roster') {
      notFoundMsg = '条件に一致するロスターは見つかりませんでした。確認できる記録にないため、推測では回答しません。'
    } else if (structuredQuery.intent === 'player_affiliation') {
      notFoundMsg = '条件に一致する所属チーム情報は見つかりませんでした。確認できる記録にないため、推測では回答しません。'
    } else if (structuredQuery.intent === 'game_detail') {
      notFoundMsg = '条件に一致する試合詳細は見つかりませんでした。確認できる記録にないため、推測では回答しません。'
    } else if (structuredQuery.intent === 'aggregate_events') {
      notFoundMsg = '条件に一致するイベント集計は見つかりませんでした。確認できる記録にないため、推測では回答しません。'
    } else if (structuredQuery.intent === 'aggregate_games') {
      notFoundMsg = '条件に一致する試合結果が見つかりませんでした。確認できる記録にないため、推測では回答しません。'
    } else {
      notFoundMsg = '条件に一致するイベントは見つかりませんでした。'
    }
    if (/代打/u.test(question) && /本塁打|ホームラン|HR/iu.test(question)) {
      notFoundMsg = '条件期間の一軍公式戦では、代打本塁打は0件です。'
    }
    return `${yearShiftPrefix}${notFoundMsg}`
  }

  if (structuredQuery.intent === 'search_games') {
    return `${yearShiftPrefix}${formatGameSearchSummary(question, results.games as GameSummaryRow[], resultCount)}`
  }

  if (structuredQuery.intent === 'search_pitching') {
    const first = results.pitching[0] as PitchingLineRow
    if (/最後|最終登板|最後のNPB/u.test(question)) {
      return `${yearShiftPrefix}${formatLastPitchingAppearance(question, results.pitching as PitchingLineRow[])}`
    }
    if ((structuredQuery.filters as Record<string, unknown>).sort_by === 'pitchCount' || /球数/u.test(question)) {
      return `${yearShiftPrefix}${formatTopPitchCountAppearance(first)}`
    }
    if (isEvaluationQuestion(question, structuredQuery.filters)) {
      const boxGameDates = (results.pitching as PitchingLineRow[])
        .filter((r) => r.sourceKind === 'box')
        .map((r) => r.gameDate)
      const gapNote = buildRecentGapNote(
        boxGameDates,
        structuredQuery.filters,
      )
      const summary = formatPitchingEvaluationSummary(results.pitching as PitchingLineRow[])
      return `${yearShiftPrefix}${appendContinuityGapNote(summary, boxGameDates)}${gapNote}`
    }
    if (first.sourceKind === 'bis_pitching' || first.sourceKind === 'bis_pitching_farm') {
      return `${yearShiftPrefix}${formatBisPitchingSummary(first, resultCount)}`
    }
    return `${yearShiftPrefix}条件に一致する投手成績が${resultCount}件あります。先頭は${first.gameDate}の${first.pitcherName}で、${formatInningsForDisplay(first.inningsPitched)} ${first.strikeouts}奪三振です。`
  }

  if (structuredQuery.intent === 'search_batting') {
    const first = results.batting[0] as BattingLineRow
    if (isEvaluationQuestion(question, structuredQuery.filters)) {
      const boxGameDates = (results.batting as BattingLineRow[])
        .filter((r) => r.sourceKind !== 'bis_batting')
        .map((r) => r.gameDate)
      const gapNote = buildRecentGapNote(
        boxGameDates,
        structuredQuery.filters,
      )
      const summary = formatBattingEvaluationSummary(results.batting as BattingLineRow[], resultCount)
      return `${yearShiftPrefix}${appendContinuityGapNote(summary, boxGameDates)}${gapNote}`
    }
    if (first.sourceKind === 'bis_batting') {
      return `${yearShiftPrefix}${formatBisBattingSummary(first, resultCount)}`
    }
    if (/年別/u.test(question) && /本塁打|ホームラン|HR/iu.test(question)) {
      return `${yearShiftPrefix}${formatYearlyHomeRunSummary(results.batting as BattingLineRow[])}`
    }
    return `${yearShiftPrefix}条件に一致する打撃成績が${resultCount}件あります。先頭は${formatDateJa(first.gameDate)}の${first.playerName}で、${first.atBats}打数${first.hits}安打${first.runsBattedIn}打点です。`
  }

  if (structuredQuery.intent === 'search_roster') {
    return `${yearShiftPrefix}${formatRosterSummary(results.roster as RosterEntryRow[], structuredQuery.filters)}`
  }

  if (structuredQuery.intent === 'player_affiliation') {
    return `${yearShiftPrefix}${formatPlayerAffiliationSummary(structuredQuery, results.affiliations, playerResolution)}`
  }

  if (structuredQuery.intent === 'game_detail') {
    return `${yearShiftPrefix}${formatGameDetailSummary(
      results.gameDetails as GameDetailRow[],
      results.events as EventSummaryRow[],
      results.batting as BattingLineRow[],
      results.pitching as PitchingLineRow[],
      resultCount,
    )}`
  }

  if (structuredQuery.intent === 'aggregate_games') {
    const rows = results.aggregates as AggregateRow[]
    const filters = structuredQuery.filters as { year?: number; year_from?: number; year_to?: number }
    const yearLabel = filters.year
      ? `${filters.year}年`
      : filters.year_from && filters.year_to
        ? `${filters.year_from}〜${filters.year_to}年`
        : '対象期間'
    return [
      `${yearShiftPrefix}${yearLabel}の勝敗集計です。`,
      ...rows.map((row) => {
        const wins = Number(row.stats.wins ?? 0)
        const losses = Number(row.stats.losses ?? 0)
        const draws = Number(row.stats.draws ?? 0)
        const total = Number(row.stats.total_games ?? row.total)
        const noResult = total - wins - losses - draws
        const drawText = draws > 0 ? `、引き分け${draws}` : ''
        const noResultText = noResult > 0 ? `（スコア未確定${noResult}試合除く）` : ''
        return `${row.label}: ${wins}勝${losses}敗${drawText}、対象${total}試合${noResultText}`
      }),
    ].join('\n')
  }

  if (
    structuredQuery.intent === 'aggregate_batting' ||
    structuredQuery.intent === 'aggregate_pitching' ||
    structuredQuery.intent === 'aggregate_events'
  ) {
    return `${yearShiftPrefix}${formatAggregateSummary(question, structuredQuery, results.aggregates as AggregateRow[], playerResolution)}`
  }

  return `${yearShiftPrefix}${formatEventListSummary(structuredQuery, results.events, resultCount, playerResolution)}`
}

function formatRosterSummary(rows: RosterEntryRow[], filters: Record<string, unknown>): string {
  const starters = rows.filter((row) => row.starter === true)
  const grouped = new Map<string, { row: RosterEntryRow; count: number }>()
  for (const row of starters.length > 0 ? starters : rows) {
    const key = `${row.playerName}:${row.team}`
    const current = grouped.get(key)
    grouped.set(key, { row, count: (current?.count ?? 0) + 1 })
  }
  const ranked = [...grouped.values()].sort((a, b) => b.count - a.count || a.row.playerName.localeCompare(b.row.playerName, 'ja'))
  const year = typeof filters.year === 'number' ? `${filters.year}年` : '対象期間'
  const condition = [
    filters.team ? `${filters.team}` : undefined,
    filters.batting_order ? `${filters.batting_order}番` : undefined,
    filters.position ? `${filters.position}` : undefined,
    filters.starter === true ? 'スタメン' : undefined,
  ].filter(Boolean).join('・')
  const top = ranked[0]
  const latestDate = rows.reduce((latest, row) => row.gameDate > latest ? row.gameDate : latest, '')
  return [
    `${year}の${condition || 'ロスター'}で最も多いのは${top?.row.team ?? ''}の${top?.row.playerName ?? '該当者'}で、${top?.count ?? 0}試合です。`,
    latestDate ? `直近の該当日は${latestDate}です。` : undefined,
    ...ranked.slice(0, 5).map((entry, index) => `${index + 1}位: ${entry.row.playerName}（${entry.row.team}）${entry.count}試合`),
  ].filter(Boolean).join('\n')
}

function formatGameSearchSummary(question: string, rows: GameSummaryRow[], resultCount: number): string {
  const targetRows = /サヨナラ勝ち|サヨナラ勝/u.test(question)
    ? rows.filter((row) => {
      const linescore = parseLinescore((row as GameSummaryRowWithLinescore).linescoreJson)
      if (!linescore) return false
      const targetTeam = (question.match(/阪神|DeNA|巨人|ヤクルト|中日|広島|日本ハム|楽天|西武|ロッテ|オリックス|ソフトバンク/u)?.[0]) ?? ''
      const homeIsTarget = targetTeam ? displayTeamName(row.homeTeamName).includes(targetTeam) || row.homeTeamName.includes(teamEnglishHint(targetTeam)) : true
      return homeIsTarget && isWalkOffWin(linescore)
    })
    : rows
  if (/サヨナラ勝ち|サヨナラ勝/u.test(question)) {
    if (targetRows.length === 0) {
      return '条件期間の一軍公式戦では、該当チームのサヨナラ勝ちは0試合です。'
    }
    return [
      `条件期間のサヨナラ勝ちは${targetRows.length}試合です。`,
      ...targetRows.slice(0, 20).map((row) => formatGameSummaryLine(row)),
    ].join('\n')
  }
  return [
    `条件に一致する試合が${resultCount}件あります。`,
    ...targetRows.slice(0, 20).map((row) => formatGameSummaryLine(row)),
    ...(resultCount > 20 ? [`ほか${resultCount - 20}件は省略しています。`] : []),
  ].join('\n')
}

function formatGameSummaryLine(row: GameSummaryRow): string {
  const rowWithLinescore = row as GameSummaryRowWithLinescore
  const linescore = parseLinescore(rowWithLinescore.linescoreJson)
  const result = linescore ? describeGameResult({
    gameId: row.gameId,
    date: row.date,
    venue: row.venue,
    competition: null,
    awayTeamName: row.awayTeamName,
    homeTeamName: row.homeTeamName,
    matchupText: row.matchupText,
    linescoreJson: rowWithLinescore.linescoreJson ?? '',
  }, linescore) : `${row.awayTeamName} vs ${row.homeTeamName}`
  return `${row.date}（${formatDateJa(row.date)}） ${displayVenueName(row.venue)}、${result}`
}

function formatYearlyHomeRunSummary(rows: BattingLineRow[]): string {
  const grouped = new Map<string, { player: string; team: string; homeRuns: number; games: number }>()
  for (const row of rows) {
    const year = row.gameDate.slice(0, 4)
    const current = grouped.get(year) ?? { player: row.playerName, team: row.team, homeRuns: 0, games: 0 }
    current.homeRuns += row.sourceKind === 'bis_batting'
      ? statNumber(parseStatsJson(row.statsJson ?? row.rawText), '本塁打') ?? 0
      : countHomeRunsFromBattingText(row.rawText)
    current.games += 1
    grouped.set(year, current)
  }
  const lines = [...grouped.entries()].sort(([a], [b]) => Number(a) - Number(b)).map(([year, value]) =>
    `${year}年: ${value.homeRuns}本（${value.team}、対象${value.games}試合）`,
  )
  const first = rows[0]
  return [
    `${first?.playerName ?? '対象選手'}の年別本塁打数です。`,
    ...lines,
  ].join('\n')
}

function countHomeRunsFromBattingText(value: string | null | undefined): number {
  const raw = value ?? ''
  return (raw.match(/本塁打|ホームラン|左越本|右越本|中越本|左中本|右中本/gu) ?? []).length
}

function isWalkOffWin(linescore: ParsedLinescore): boolean {
  if (linescore.home.totals.runs <= linescore.away.totals.runs) {
    return false
  }
  const lastHomeScore = [...linescore.home.innings].reverse().find((score) => score !== '' && !/^[-－]$/u.test(score))
  return Boolean(lastHomeScore && /\d+x$/iu.test(lastHomeScore))
}

function formatAggregateSummary(
  question: string,
  structuredQuery: ChatStructuredQuery,
  rows: AggregateRow[],
  playerResolution: PlayerResolution | null,
): string {
  if (structuredQuery.intent === 'aggregate_batting') {
    const filters = structuredQuery.filters as Record<string, unknown>
    if (/本塁打|ホームラン|HR/iu.test(question) && (filters.player_name || filters.player_id)) {
      return formatPlayerHomeRunAggregate(question, rows, filters, playerResolution)
    }
    if (filters.group_by === 'year') {
      const playerName = typeof filters.player_name === 'string'
        ? filters.player_name
        : String(rows[0]?.stats.playerName ?? '対象選手')
      return [
        `${playerName}の年別本塁打数です。`,
        ...rows.map((row) => `${row.label}年: ${row.stats.homeRuns ?? 0}本（${row.stats.team ?? ''}、対象${row.stats.games ?? row.total}試合）`),
      ].join('\n')
    }
    if ((filters.player_name || filters.player_id) && rows.length === 1 && !/ランキング|トップ|最多|最も|一番|順位|比較|比べ/u.test(question)) {
      return formatSinglePlayerBattingAggregate(question, rows[0])
    }
    return [
      `打撃集計結果は${rows.length}件です。`,
      ...rows.slice(0, 10).map((row, index) => {
        const s = row.stats
        return `${index + 1}位: ${row.label}（${s.team ?? ''}） 試合${s.games ?? row.total}、打率${formatMaybeRate(s.battingAverage)}、本塁打${s.homeRuns ?? 0}、打点${s.runsBattedIn ?? 0}、盗塁${s.stolenBases ?? 0}、OPS${formatMaybeRate(s.ops)}、IsoP${formatMaybeRate(s.isoP)}、BB%${formatMaybePercent(s.bbRate)}`
      }),
    ].join('\n')
  }
  if (structuredQuery.intent === 'aggregate_pitching') {
    return [
      `投手集計結果は${rows.length}件です。`,
      ...rows.slice(0, 10).map((row, index) => {
        const s = row.stats
        const ip = Number(s.inningsPitched ?? 0)
        const era = ip > 0 ? Number(s.earnedRuns ?? 0) * 9 / ip : null
        const whip = ip > 0 ? (Number(s.hitsAllowed ?? 0) + Number(s.walks ?? 0)) / ip : null
        const saveText = s.saves != null ? `、セーブ${s.saves}` : ''
        return `${index + 1}位: ${row.label}（${s.team ?? ''}） 登板${s.games ?? row.total}${saveText}、投球回${formatDecimalStat(ip)}、奪三振${s.strikeouts ?? 0}、自責点${s.earnedRuns ?? 0}、防御率${formatMaybeDecimal(era)}、WHIP${formatMaybeDecimal(whip)}、球数${s.pitches ?? 0}`
      }),
    ].join('\n')
  }
  return [
    `イベント集計結果は${rows.length}件です。`,
    ...rows.slice(0, 10).map((row, index) => `${index + 1}位: ${row.label} ${row.total}件`),
  ].join('\n')
}

function formatPlayerHomeRunAggregate(
  question: string,
  rows: AggregateRow[],
  filters: Record<string, unknown>,
  playerResolution: PlayerResolution | null,
): string {
  const playerName = playerResolution?.status === 'resolved'
    ? playerResolution.name ?? String(filters.player_name ?? '対象選手')
    : String(filters.player_name ?? rows[0]?.stats.playerName ?? rows[0]?.label ?? '対象選手')
  const yearLabel = filters.year
    ? `${filters.year}年`
    : filters.year_from && filters.year_to
      ? `${filters.year_from}〜${filters.year_to}年`
      : filters.year_from
        ? `${filters.year_from}年以降`
        : '収録期間'
  const totalHomeRuns = rows.reduce((sum, row) => sum + Number(row.stats.homeRuns ?? row.stats['本塁打'] ?? 0), 0)
  const totalGames = rows.reduce((sum, row) => sum + Number(row.stats.games ?? row.total ?? 0), 0)
  const teams = [...new Set(rows.map((row) => String(row.stats.team ?? '')).filter(Boolean).map(displayTeamName))]
  const teamText = teams.length > 0 ? `（${teams.join('、')}）` : ''
  const firstLine = totalHomeRuns > 0
    ? `${playerName}は、${yearLabel}のNPB公式戦で本塁打を${totalHomeRuns}本打っています。`
    : `${playerName}は、${yearLabel}のNPB公式戦で本塁打0本です。`
  const detailLine = totalGames > 0
    ? `対象は${teamText}${totalGames}試合です。`
    : undefined
  const breakdown = rows.length > 1
    ? rows.map((row) => `${displayTeamName(String(row.stats.team ?? row.label))}: ${Number(row.stats.homeRuns ?? 0)}本`).join('、')
    : undefined
  return [
    firstLine,
    detailLine,
    breakdown ? `内訳: ${breakdown}` : undefined,
  ].filter(Boolean).join('\n')
}

function formatBisBattingSummary(row: BattingLineRow, resultCount: number): string {
  const year = row.gameDate.slice(0, 4)
  const stats = parseStatsJson(row.statsJson ?? row.rawText)
  const sabermetrics = calculateBattingSabermetrics(stats)
  const statLine = [
    statPart(stats, '試合', '試合'),
    statPart(stats, '打席', '打席'),
    statPart(stats, '打数', '打数'),
    statPart(stats, '安打', '安打'),
    statPart(stats, '本塁打', '本塁打'),
    statPart(stats, '打点', '打点'),
    statPart(stats, '得点', '得点'),
    statPart(stats, '盗塁', '盗塁'),
    statPart(stats, '打率', '打率'),
    statPart(stats, '出塁率', '出塁率'),
    statPart(stats, '長打率', '長打率'),
  ].filter(Boolean)
  const saberLine = formatBattingSabermetrics(sabermetrics)
  return [
    `${year}年の${row.team} ${row.playerName}の打撃成績です。`,
    ...(statLine.length > 0 ? [statLine.join('、')] : []),
    ...(saberLine.length > 0 ? [`派生指標: ${saberLine.join('、')}`] : []),
    ...(resultCount > 1 ? [`同条件の成績行が${resultCount}件あります。`] : []),
  ].join('\n')
}

function formatBisPitchingSummary(row: PitchingLineRow, resultCount: number): string {
  const year = row.gameDate.slice(0, 4)
  const isFarm = row.sourceKind === 'bis_pitching_farm'
  const league = isFarm ? '二軍' : '一軍'
  const stats = parseStatsJson(row.statsJson)
  const statLine = [
    statPart(stats, '登板', '登板'),
    statPart(stats, '勝利', '勝利'),
    statPart(stats, '敗北', '敗北'),
    statPart(stats, 'セーブ', 'セーブ'),
    statPart(stats, 'ホールド', 'ホールド'),
    statPart(stats, '投球回', '投球回'),
    statPart(stats, '被安打', '被安打') ?? statPart(stats, '安打', '被安打'),
    statPart(stats, '与四球', '与四球') ?? statPart(stats, '四球', '与四球'),
    statPart(stats, '三振', '奪三振') ?? statPart(stats, '奪三振', '奪三振'),
    statPart(stats, '失点', '失点'),
    statPart(stats, '自責点', '自責点'),
    statPart(stats, '防御率', '防御率'),
  ].filter(Boolean)
  return [
    `${year}年${league}の${row.team} ${row.pitcherName}の投手成績です。`,
    ...(statLine.length > 0 ? [statLine.join('、')] : []),
    ...(resultCount > 1 ? [`同条件の成績行が${resultCount}件あります。`] : []),
  ].join('\n')
}

function formatLastPitchingAppearance(question: string, rows: PitchingLineRow[]): string {
  const boxRows = rows.filter((row) => row.sourceKind === 'box')
  const topTeamRows = /一軍|NPB/u.test(question)
    ? boxRows.filter((row) => !row.gameId.startsWith('f'))
    : boxRows
  const row = topTeamRows[0] ?? boxRows[0] ?? rows[0]
  if (!row) {
    return '条件に一致する登板は0件です。'
  }
  const league = row.gameId.startsWith('f') ? '二軍' : '一軍'
  const pitchText = row.pitchCount > 0 ? `、${row.pitchCount}球` : ''
  return `${row.team} ${row.pitcherName}が最後に${league}で登板したのは${formatDateJa(row.gameDate)}です。この試合では${formatInningsForDisplay(row.inningsPitched)}${pitchText}、${row.strikeouts}奪三振、失点${row.runs}、自責点${row.earnedRuns}でした。`
}

function formatTopPitchCountAppearance(row: PitchingLineRow | undefined): string {
  if (!row) {
    return '条件に一致する登板は0件です。'
  }
  const league = row.gameId.startsWith('f') ? '二軍' : '一軍'
  return `条件期間で最も球数が多かった登板は、${formatDateJa(row.gameDate)}の${league}・${row.team} ${row.pitcherName}です。${formatInningsForDisplay(row.inningsPitched)}を投げ、${row.pitchCount}球、${row.strikeouts}奪三振、失点${row.runs}、自責点${row.earnedRuns}でした。`
}

function formatInningsForDisplay(value: string | number): string {
  const text = String(value)
  const match = text.match(/^(\d+)(?:\.(\d+))?$/u)
  if (!match) {
    return `${text}回`
  }
  const whole = match[1]
  const fraction = match[2]
  if (!fraction || /^0+$/u.test(fraction)) {
    return `${whole}回`
  }
  if (fraction === '1') {
    return `${whole}回1/3`
  }
  if (fraction === '2') {
    return `${whole}回2/3`
  }
  return `${text}回`
}

function formatGameDetailSummary(
  rows: GameDetailRow[],
  events: EventSummaryRow[],
  battingRows: BattingLineRow[],
  pitchingRows: PitchingLineRow[],
  resultCount: number,
): string {
  const lines = rows.slice(0, 5).flatMap((row, index) => {
    const linescore = parseLinescore(row.linescoreJson)
    const result = linescore ? describeGameResult(row, linescore) : `${row.awayTeamName} vs ${row.homeTeamName}`
    const highlights = linescore ? describeGameHighlights(linescore) : []
    const gameEvents = events.filter((event) => event.gameId === row.gameId)
    const eventHighlights = describeEventHighlights(gameEvents)
    const gameBattingRows = battingRows.filter((line) => line.gameId === row.gameId)
    const gamePitchingRows = pitchingRows.filter((line) => line.gameId === row.gameId)
    const detailLines = [
      ...(linescore ? describeScoringFlow(linescore) : []),
      ...describePitchingLines(gamePitchingRows),
      ...describeBattingLines(gameBattingRows),
    ]
    return [
      `${index + 1}. ${formatDateJa(row.date)} ${displayVenueName(row.venue)}、${result}`,
      ...highlights.map((highlight) => `   ${highlight}`),
      ...detailLines.map((detail) => `   ${detail}`),
      ...eventHighlights.map((highlight) => `   ${highlight}`),
      ...(gameEvents.length === 0 && !linescore ? ['   詳細な打席情報は確認できませんでした。'] : []),
    ]
  })
  return [
    resultCount === 1
      ? '該当する試合は1件です。'
      : `該当する試合は${resultCount}件です。`,
    '',
    ...lines,
    ...(resultCount > 5 ? ['', `ほか${resultCount - 5}件は省略しています。`] : []),
  ].join('\n')
}

function describeScoringFlow(linescore: ParsedLinescore): string[] {
  const scoring = scoringInnings(linescore)
  if (scoring.length === 0) {
    return ['得点経過はなく、0-0のまま終了しています。']
  }
  const flow = scoring
    .map((score) => `${score.inning}回${score.half}に${score.team}が${score.runs}点（${score.awayScoreAfter}-${score.homeScoreAfter}）`)
    .join('、')
  return [`得点経過: ${flow}。`]
}

function describePitchingLines(rows: PitchingLineRow[]): string[] {
  const boxRows = rows.filter((row) => row.sourceKind === 'box')
  if (boxRows.length === 0) {
    return []
  }
  const starters = boxRows
    .filter((row) => Number.parseFloat(String(row.inningsPitched)) >= 3 || row.pitchCount >= 50)
    .slice(0, 4)
  const targetRows = starters.length > 0 ? starters : boxRows.slice(0, 4)
  return [
    `主な投手成績: ${targetRows.map((row) => {
      const pitchCount = row.pitchCount > 0 ? `、${row.pitchCount}球` : ''
      return `${row.team} ${row.pitcherName} ${formatInningsForDisplay(row.inningsPitched)}${pitchCount}、${row.strikeouts}奪三振、失点${row.runs}、自責点${row.earnedRuns}`
    }).join(' / ')}。`,
  ]
}

function describeBattingLines(rows: BattingLineRow[]): string[] {
  const boxRows = rows.filter((row) => row.sourceKind === 'box')
  if (boxRows.length === 0) {
    return []
  }
  const notable = boxRows
    .filter((row) => row.hits > 0 || row.runsBattedIn > 0 || /本|ホームラン|二塁打|三塁打/u.test(row.rawText ?? ''))
    .sort((a, b) =>
      b.runsBattedIn - a.runsBattedIn ||
      b.hits - a.hits ||
      a.playerName.localeCompare(b.playerName, 'ja'),
    )
    .slice(0, 6)
  if (notable.length === 0) {
    return []
  }
  return [
    `主な打撃成績: ${notable.map((row) => {
      const extras = [
        row.runsBattedIn > 0 ? `${row.runsBattedIn}打点` : undefined,
        row.runs > 0 ? `${row.runs}得点` : undefined,
      ].filter(Boolean).join('、')
      return `${row.team} ${row.playerName} ${row.atBats}打数${row.hits}安打${extras ? `、${extras}` : ''}`
    }).join(' / ')}。`,
  ]
}

function describeEventHighlights(events: EventSummaryRow[]): string[] {
  const scoringEvents = events
    .filter((event) => isLikelyRunEvent(event.resultText))
    .slice(0, 6)
    .map((event) => {
      const batter = event.batterName ? `${event.batterName}: ` : ''
      return `${event.inning}回${event.half === 'top' ? '表' : '裏'} ${displayTeamName(event.offenseTeam)} ${batter}${event.resultText}`
    })
  if (scoringEvents.length === 0) {
    return []
  }
  return [
    '主な得点・長打イベント:',
    ...scoringEvents.map((event) => `- ${event}`),
  ]
}

function isLikelyRunEvent(resultText: string): boolean {
  return /ホームラン|本塁打|適時打|タイムリー|二塁打|三塁打|犠飛|打点|勝ち越し|逆転|先制/u.test(resultText)
}

type ParsedLinescore = {
  away: LinescoreSide
  home: LinescoreSide
}

type LinescoreSide = {
  team: string
  innings: string[]
  totals: {
    runs: number
    hits: number
    errors: number
  }
}

function formatSinglePlayerBattingAggregate(question: string, row: AggregateRow): string {
  const s = row.stats
  const year = extractYearLabelFromQuestion(question)
  const team = String(s.team ?? '')
  const player = String(s.playerName ?? row.label)
  const games = Number(s.games ?? row.total ?? 0)
  const atBats = Number(s.atBats ?? 0)
  const hits = Number(s.hits ?? 0)
  const homeRuns = Number(s.homeRuns ?? 0)
  const runsBattedIn = Number(s.runsBattedIn ?? 0)
  const runs = Number(s.runs ?? 0)
  const stolenBases = Number(s.stolenBases ?? 0)
  const walks = Number(s.walks ?? 0)
  const strikeouts = Number(s.strikeouts ?? 0)
  const average = typeof s.battingAverage === 'number'
    ? formatRate(s.battingAverage)
    : atBats > 0
      ? formatRate(hits / atBats)
      : 'N/A'
  if (/通算打率|打率/u.test(question) && !/成績/u.test(question)) {
    return `${team}の${player}選手の${year}シーズン通算では、${games}試合に出場し、${atBats}打数${hits}安打で打率は約${average}です。ホームランは${homeRuns}本、打点は${runsBattedIn}、盗塁は${stolenBases}、四球は${walks}、三振は${strikeouts}となっています。`
  }
  return `${team}の${player}選手の${year}シーズンの成績をご紹介します。${games}試合に出場し、${atBats}打数で${hits}安打、${homeRuns}本塁打、${runsBattedIn}打点、${runs}得点、${stolenBases}盗塁、${walks}四球、${strikeouts}三振という内容です。打率は約${average}です。`
}

function extractYearLabelFromQuestion(question: string): string {
  const year = question.match(/(\d{4})年/u)?.[1]
  return year ? `${year}年` : '2026年'
}

function parseLinescore(value: string | null | undefined): ParsedLinescore | null {
  const parsed = parseJsonObject(value) as Record<string, unknown>
  if (parsed.inning_scores && parsed.runs) {
    const inningScores = parsed.inning_scores as Record<string, unknown>
    const runs = parsed.runs as Record<string, unknown>
    const hits = (parsed.hits ?? {}) as Record<string, unknown>
    const errors = (parsed.errors ?? {}) as Record<string, unknown>
    const awayScores = Array.isArray(inningScores.away) ? inningScores.away.map(String) : []
    const homeScores = Array.isArray(inningScores.home) ? inningScores.home.map(String) : []
    const awayTeam = typeof parsed.away_team === 'string' ? parsed.away_team : ''
    const homeTeam = typeof parsed.home_team === 'string' ? parsed.home_team : ''
    return {
      away: {
        team: awayTeam,
        innings: awayScores,
        totals: {
          runs: Number(runs.away ?? 0),
          hits: Number(hits.away ?? 0),
          errors: Number(errors.away ?? 0),
        },
      },
      home: {
        team: homeTeam,
        innings: homeScores,
        totals: {
          runs: Number(runs.home ?? 0),
          hits: Number(hits.home ?? 0),
          errors: Number(errors.home ?? 0),
        },
      },
    }
  }
  const away = parseLinescoreSide(parsed.away)
  const home = parseLinescoreSide(parsed.home)
  return away && home ? { away, home } : null
}

function compactSourceUrlFromLinescore(value: string | null | undefined): string[] {
  const parsed = parseJsonObject(value)
  return typeof parsed.source_url === 'string' ? [parsed.source_url] : []
}

function teamEnglishHint(team: string): string {
  const map: Record<string, string> = {
    阪神: 'Hanshin',
    DeNA: 'DeNA',
    巨人: 'Yomiuri',
    ヤクルト: 'Yakult',
    中日: 'Chunichi',
    広島: 'Hiroshima',
    日本ハム: 'Nippon-Ham',
    楽天: 'Rakuten',
    西武: 'Seibu',
    ロッテ: 'Lotte',
    オリックス: 'ORIX',
    ソフトバンク: 'SoftBank',
  }
  return map[team] ?? team
}

function parseLinescoreSide(value: unknown): LinescoreSide | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  const totals = record.totals
  if (!totals || typeof totals !== 'object') {
    return null
  }
  const totalsRecord = totals as Record<string, unknown>
  const runs = toNumber(totalsRecord.runs)
  const hits = toNumber(totalsRecord.hits)
  const errors = toNumber(totalsRecord.errors)
  if (runs === null || hits === null || errors === null) {
    return null
  }
  return {
    team: typeof record.team === 'string' && record.team ? record.team : '',
    innings: Array.isArray(record.innings) ? record.innings.map((inning) => String(inning)) : [],
    totals: { runs, hits, errors },
  }
}

function describeGameResult(row: GameDetailRow, linescore: ParsedLinescore): string {
  const away = linescore.away
  const home = linescore.home
  const awayTeam = displayTeamName(away.team || row.awayTeamName)
  const homeTeam = displayTeamName(home.team || row.homeTeamName)
  const score = `${away.totals.runs}-${home.totals.runs}`
  if (away.totals.runs > home.totals.runs) {
    return `${awayTeam}が${homeTeam}に${score}で勝利しました。`
  }
  if (home.totals.runs > away.totals.runs) {
    return `${homeTeam}が${awayTeam}に${home.totals.runs}-${away.totals.runs}で勝利しました。`
  }
  return `${awayTeam}と${homeTeam}は${score}で引き分けました。`
}

function describeGameHighlights(linescore: ParsedLinescore): string[] {
  const highlights: string[] = []
  const scoring = scoringInnings(linescore)
  const decisive = decisiveScoring(linescore, scoring)
  if (decisive) {
    highlights.push(decisive)
  }
  highlights.push(
    `安打数は${displayTeamName(linescore.away.team)}が${linescore.away.totals.hits}本、${displayTeamName(linescore.home.team)}が${linescore.home.totals.hits}本でした。`,
  )
  if (linescore.away.totals.errors > 0 || linescore.home.totals.errors > 0) {
    highlights.push(
      `失策は${displayTeamName(linescore.away.team)}が${linescore.away.totals.errors}、${displayTeamName(linescore.home.team)}が${linescore.home.totals.errors}です。`,
    )
  }
  return highlights
}

type ScoringHalfInning = {
  inning: number
  half: '表' | '裏'
  team: string
  runs: number
  awayScoreAfter: number
  homeScoreAfter: number
}

function scoringInnings(linescore: ParsedLinescore): ScoringHalfInning[] {
  const max = Math.max(linescore.away.innings.length, linescore.home.innings.length)
  const scoring: ScoringHalfInning[] = []
  let awayScore = 0
  let homeScore = 0
  for (let index = 0; index < max; index += 1) {
    const awayRuns = inningRuns(linescore.away.innings[index])
    if (awayRuns > 0) {
      awayScore += awayRuns
      scoring.push({
        inning: index + 1,
        half: '表',
        team: displayTeamName(linescore.away.team),
        runs: awayRuns,
        awayScoreAfter: awayScore,
        homeScoreAfter: homeScore,
      })
    }
    const homeRuns = inningRuns(linescore.home.innings[index])
    if (homeRuns > 0) {
      homeScore += homeRuns
      scoring.push({
        inning: index + 1,
        half: '裏',
        team: displayTeamName(linescore.home.team),
        runs: homeRuns,
        awayScoreAfter: awayScore,
        homeScoreAfter: homeScore,
      })
    }
  }
  return scoring
}

function decisiveScoring(linescore: ParsedLinescore, scoring: ScoringHalfInning[]): string | undefined {
  const awayWon = linescore.away.totals.runs > linescore.home.totals.runs
  const homeWon = linescore.home.totals.runs > linescore.away.totals.runs
  if (!awayWon && !homeWon) {
    const last = scoring.at(-1)
    return last ? `${last.inning}回${last.half}に${last.team}が${last.runs}点を取り、終盤まで競った展開でした。` : undefined
  }
  const winner = awayWon ? displayTeamName(linescore.away.team) : displayTeamName(linescore.home.team)
  const decisive = scoring.find((score) => {
    if (awayWon && score.team === winner) {
      return score.awayScoreAfter > score.homeScoreAfter
    }
    if (homeWon && score.team === winner) {
      return score.homeScoreAfter > score.awayScoreAfter
    }
    return false
  })
  if (!decisive) {
    return undefined
  }
  return `${decisive.inning}回${decisive.half}に${winner}が${decisive.runs}点を取り、ここでリードを奪いました。`
}

function inningRuns(value: string | undefined): number {
  if (!value || /x|X|－|-/.test(value)) {
    return 0
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatBattingEvaluationSummary(rows: BattingLineRow[], resultCount: number): string {
  const first = rows[0]!
  const playerName = first.playerName ?? '対象選手'
  const teamPrefix = first.team ? `${first.team} ` : ''
  const gameRows = rows.filter((row) => row.sourceKind !== 'bis_batting').slice(0, 5)
  if (gameRows.length === 0) {
    return formatBisBattingEvaluationSummary(rows[0]!, resultCount)
  }
  const totals = gameRows.reduce(
    (acc, row) => ({
      atBats: acc.atBats + row.atBats,
      hits: acc.hits + row.hits,
      runsBattedIn: acc.runsBattedIn + row.runsBattedIn,
      runs: acc.runs + row.runs,
      walks: acc.walks + (row.walks ?? 0),
    }),
    { atBats: 0, hits: 0, runsBattedIn: 0, runs: 0, walks: 0 },
  )
  const average = totals.atBats > 0 ? totals.hits / totals.atBats : null
  const positives = [
    totals.hits > 0 ? `${gameRows.length}試合で${totals.hits}安打` : undefined,
    totals.runsBattedIn > 0 ? `${totals.runsBattedIn}打点` : undefined,
    totals.walks > 0 ? `${totals.walks}四球` : undefined,
    average !== null ? `打率${average.toFixed(3).replace(/^0/u, '')}` : undefined,
  ].filter(Boolean)
  return [
    `${teamPrefix}${playerName}の確認できる最新${gameRows.length}出場の打撃内容です。`,
    positives.length > 0
      ? `内容は${positives.join('、')}です。`
      : '安打や打点はありませんが、対象試合には出場しています。',
    `対象試合: ${gameRows.map((row) => formatDateJa(row.gameDate)).join('、')}`,
    buildInternalRecentGapNote(gameRows.map((row) => row.gameDate)),
  ].filter(Boolean).join('\n')
}

function formatBisBattingEvaluationSummary(row: BattingLineRow, resultCount: number): string {
  const stats = parseStatsJson(row.statsJson ?? row.rawText)
  const year = row.gameDate.slice(0, 4)
  const sabermetrics = calculateBattingSabermetrics(stats)
  const positives = [
    positiveCountStatPart(stats, '試合', '試合出場'),
    positiveCountStatPart(stats, '安打', '安打'),
    positiveCountStatPart(stats, '本塁打', '本塁打'),
    positiveCountStatPart(stats, '打点', '打点'),
    positiveCountStatPart(stats, '四球', '四球'),
    statPart(stats, '打率', '打率'),
    statPart(stats, '出塁率', '出塁率'),
    sabermetrics.ops !== null ? `OPS${formatRate(sabermetrics.ops)}` : undefined,
    sabermetrics.isoP !== null ? `IsoP${formatRate(sabermetrics.isoP)}` : undefined,
    sabermetrics.bbK !== null ? `BB/K${formatDecimal(sabermetrics.bbK)}` : undefined,
  ].filter(Boolean)
  return [
    `${row.team} ${row.playerName}の${year}年に確認できる最新のシーズン打撃成績です。`,
    positives.length > 0
      ? `内容は${positives.join('、')}です。`
      : '主要指標は成績行から取り出せませんでした。',
    ...(resultCount > 1 ? [`同条件の成績行が${resultCount}件あります。`] : []),
  ].join('\n')
}

type BattingSabermetrics = {
  ops: number | null
  isoP: number | null
  bbK: number | null
  bbRate: number | null
  kRate: number | null
  estimatedWoba: number | null
}

function calculateBattingSabermetrics(stats: Record<string, unknown>): BattingSabermetrics {
  const plateAppearances = statNumber(stats, '打席')
  const atBats = statNumber(stats, '打数')
  const hits = statNumber(stats, '安打')
  const doubles = statNumber(stats, '二塁打')
  const triples = statNumber(stats, '三塁打')
  const homeRuns = statNumber(stats, '本塁打')
  const walks = statNumber(stats, '四球')
  const strikeouts = statNumber(stats, '三振')
  const hitByPitch = statNumber(stats, '死球')
  const sacrificeFlies = statNumber(stats, '犠飛')
  const obp = statRate(stats, '出塁率')
  const slg = statRate(stats, '長打率')
  const singles = hits !== null
    ? Math.max(0, hits - (doubles ?? 0) - (triples ?? 0) - (homeRuns ?? 0))
    : null
  const wobaDenominator = atBats !== null
    ? atBats + (walks ?? 0) + (hitByPitch ?? 0) + (sacrificeFlies ?? 0)
    : null

  return {
    ops: obp !== null && slg !== null ? obp + slg : null,
    isoP: slg !== null && hits !== null && atBats && atBats > 0 ? slg - hits / atBats : null,
    bbK: walks !== null && strikeouts !== null && strikeouts > 0 ? walks / strikeouts : null,
    bbRate: walks !== null && plateAppearances && plateAppearances > 0 ? walks / plateAppearances : null,
    kRate: strikeouts !== null && plateAppearances && plateAppearances > 0 ? strikeouts / plateAppearances : null,
    estimatedWoba: singles !== null && wobaDenominator && wobaDenominator > 0
      ? (
          0.69 * (walks ?? 0) +
          0.72 * (hitByPitch ?? 0) +
          0.88 * singles +
          1.247 * (doubles ?? 0) +
          1.578 * (triples ?? 0) +
          2.031 * (homeRuns ?? 0)
        ) / wobaDenominator
      : null,
  }
}

function formatBattingSabermetrics(metrics: BattingSabermetrics): string[] {
  return [
    metrics.ops !== null ? `OPS${formatRate(metrics.ops)}` : undefined,
    metrics.isoP !== null ? `IsoP${formatRate(metrics.isoP)}` : undefined,
    metrics.bbK !== null ? `BB/K${formatDecimal(metrics.bbK)}` : undefined,
    metrics.bbRate !== null ? `BB%${formatPercent(metrics.bbRate)}` : undefined,
    metrics.kRate !== null ? `K%${formatPercent(metrics.kRate)}` : undefined,
    metrics.estimatedWoba !== null ? `簡易wOBA${formatRate(metrics.estimatedWoba)}` : undefined,
  ].filter(Boolean) as string[]
}

function positiveCountStatPart(stats: Record<string, unknown>, key: string, label: string): string | undefined {
  const value = stats[key]
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const numeric = typeof value === 'number' ? value : Number(String(value))
  if (Number.isFinite(numeric) && numeric <= 0) {
    return undefined
  }
  return `${label}${String(value)}`
}

function formatPitchingEvaluationSummary(rows: PitchingLineRow[]): string {
  const pitcherName = rows[0]?.pitcherName ?? '対象投手'
  const boxRows = rows.filter((row) => row.sourceKind !== 'bis_pitching' && row.sourceKind !== 'bis_pitching_farm')
  if (boxRows.length === 0) {
    const seasonRow = rows.find((row) => row.sourceKind === 'bis_pitching' || row.sourceKind === 'bis_pitching_farm')
    if (seasonRow) {
      return formatBisPitchingEvaluationSummary(seasonRow, [])
    }
  }
  const gameRows = boxRows.slice(0, 5)
  const totals = gameRows.reduce(
    (acc, row) => ({
      strikeouts: acc.strikeouts + row.strikeouts,
      runs: acc.runs + row.runs,
      earnedRuns: acc.earnedRuns + row.earnedRuns,
      pitchCount: acc.pitchCount + row.pitchCount,
    }),
    { strikeouts: 0, runs: 0, earnedRuns: 0, pitchCount: 0 },
  )
  const positives = [
    totals.strikeouts > 0 ? `${gameRows.length}試合で${totals.strikeouts}奪三振` : undefined,
    totals.earnedRuns === 0 ? '自責点0' : `${totals.earnedRuns}自責点`,
    totals.pitchCount > 0 ? `${totals.pitchCount}球` : undefined,
  ].filter(Boolean)
  const year = gameRows[0]?.gameDate.slice(0, 4) ?? ''
  const league = gameRows.every((row) => row.gameId.startsWith('f'))
    ? '二軍'
    : gameRows.every((row) => !row.gameId.startsWith('f'))
      ? '一軍'
      : '一軍・二軍'
  const teamPrefix = gameRows[0]?.team ? `${gameRows[0].team} ` : ''
  const latest = gameRows[0]
  return [
    `${teamPrefix}${pitcherName}の確認できる最新${gameRows.length}試合の投球内容です。`,
    `${year}年${league}での対象試合です。`,
    `内容は${positives.join('、')}です。`,
    latest ? `最新登板は${formatDateJa(latest.gameDate)}で、${formatInningsForDisplay(latest.inningsPitched)}、${latest.strikeouts}奪三振、自責点${latest.earnedRuns}です。` : undefined,
    `対象試合: ${gameRows.map((row) => formatDateJa(row.gameDate)).join('、')}`,
    buildInternalRecentGapNote(gameRows.map((row) => row.gameDate)),
  ].filter(Boolean).join('\n')
}

function formatBisPitchingEvaluationSummary(row: PitchingLineRow, gameRows: PitchingLineRow[]): string {
  const stats = parseStatsJson(row.statsJson)
  const year = row.gameDate.slice(0, 4)
  const isFarm = row.sourceKind === 'bis_pitching_farm'
  const league = isFarm ? '二軍' : '一軍'
  const appearances = statValue(stats, '登板')
  const positives = [
    positiveCountStatPart(stats, '勝利', '勝利'),
    positiveCountStatPart(stats, 'セーブ', 'セーブ'),
    positiveCountStatPart(stats, 'ホールド', 'ホールド'),
    positiveCountStatPart(stats, '被安打', '被安打') ?? positiveCountStatPart(stats, '安打', '被安打'),
    positiveCountStatPart(stats, '与四球', '与四球') ?? positiveCountStatPart(stats, '四球', '与四球'),
    positiveCountStatPart(stats, '三振', '奪三振') ?? positiveCountStatPart(stats, '奪三振', '奪三振'),
    statPart(stats, '投球回', '投球回'),
    statPart(stats, '防御率', '防御率'),
  ].filter(Boolean)
  const recentGames = gameRows.slice(0, 5)
  const gameLines = recentGames.map((r) => {
    const gameLeague = r.gameId.startsWith('f') ? '二軍' : '一軍'
    return `  ${r.gameDate} ${gameLeague} ${r.team} ${r.pitcherName}: ${formatInningsForDisplay(r.inningsPitched)} ${r.strikeouts}奪三振 自責${r.earnedRuns}`
  })
  return [
    `確認できる最新のシーズン成績では、${row.team} ${row.pitcherName}は${year}年${league}で${appearances ?? '複数'}試合に登板しています。`,
    positives.length > 0
      ? `シーズン成績は${positives.join('、')}です。`
      : '主要指標は成績行から取り出せませんでした。',
    ...(gameLines.length > 0 ? [`確認できる個別試合記録（最新${gameLines.length}件）:`, ...gameLines] : []),
  ].join('\n')
}

function isEvaluationQuestion(question: string, filters: Record<string, unknown>): boolean {
  return Boolean(filters.recent) || /評価|調子|状態|最近どう|直近|最新|最後|最終|どう思/u.test(question)
}

function buildRecentGapNote(gameDates: string[], filters: Record<string, unknown>): string {
  if (!filters.recent || gameDates.length === 0) return ''
  const newest = gameDates.reduce((a, b) => (a > b ? a : b))
  const todayJst = currentJstDate()
  const diffDays = Math.round(
    (new Date(todayJst).getTime() - new Date(newest).getTime()) / (1000 * 60 * 60 * 24),
  )
  if (diffDays < 7) return ''
  return `\n確認できる最新の出場記録は${formatDateJa(newest)}です。現在（${formatDateJa(todayJst)}）から${diffDays}日空いているため、これだけでは現在の調子とは言えません。`
}

function buildInternalRecentGapNote(gameDates: string[]): string {
  const sortedDates = [...new Set(gameDates)]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))
  if (sortedDates.length < 2) {
    return ''
  }
  let largestGap: { newer: string; older: string; days: number } | null = null
  for (let index = 0; index < sortedDates.length - 1; index += 1) {
    const newer = sortedDates[index]!
    const older = sortedDates[index + 1]!
    const days = Math.floor(
      (new Date(newer).getTime() - new Date(older).getTime()) / (1000 * 60 * 60 * 24),
    )
    if (!largestGap || days > largestGap.days) {
      largestGap = { newer, older, days }
    }
  }
  if (!largestGap || largestGap.days < 14) {
    return ''
  }
  return `${formatDateJa(largestGap.newer)}から${formatDateJa(largestGap.older)}まで${largestGap.days}日空いているため、最新${sortedDates.length}件を連続した最近の調子として扱う場合は注意が必要です。`
}

function appendContinuityGapNote(summary: string, gameDates: string[]): string {
  if (/連続した最近の調子として扱う場合は注意が必要/u.test(summary)) {
    return summary
  }
  const note = buildInternalRecentGapNote(gameDates)
  return note ? `${summary}\n${note}` : summary
}

function currentJstDate(): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}

function parseStatsJson(value: string | null | undefined): Record<string, unknown> {
  return parseJsonObject(value)
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {}
  }
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function formatDateJa(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/u)
  if (!match) {
    return date
  }
  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`
}

function displayTeamName(team: string): string {
  const aliases: Record<string, string> = {
    Yomiuri: '巨人',
    DeNA: 'DeNA',
    Hanshin: '阪神',
    Hiroshima: '広島',
    Chunichi: '中日',
    Yakult: 'ヤクルト',
    'Nippon-Ham': '日本ハム',
    Rakuten: '楽天',
    Seibu: '西武',
    Lotte: 'ロッテ',
    ORIX: 'オリックス',
    SoftBank: 'ソフトバンク',
  }
  return aliases[team] ?? team
}

function displayVenueName(venue: string): string {
  const aliases: Record<string, string> = {
    'Tokyo Dome': '東京ドーム',
    Koshien: '甲子園',
    Yokohama: '横浜',
    'Vantelin Dome': 'バンテリンドーム',
    'MetLife Dome': 'メットライフドーム',
    'MIZUHO PayPay': 'みずほPayPayドーム',
  }
  return aliases[venue] ?? venue
}

function statPart(stats: Record<string, unknown>, key: string, label: string): string | undefined {
  const value = stats[key]
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  return `${label}${String(value)}`
}

function statValue(stats: Record<string, unknown>, key: string): string | undefined {
  const value = stats[key]
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  return String(value)
}

function statNumber(stats: Record<string, unknown>, key: string): number | null {
  const value = stats[key]
  if (value === null || value === undefined || value === '') {
    return null
  }
  const normalized = String(value).replace(/,/gu, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function statRate(stats: Record<string, unknown>, key: string): number | null {
  const value = statNumber(stats, key)
  if (value === null) {
    return null
  }
  return value > 1 ? value / 1000 : value
}

function formatRate(value: number): string {
  return value.toFixed(3).replace(/^0/u, '')
}

function formatDecimal(value: number): string {
  return value.toFixed(2)
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatMaybeRate(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? formatRate(value) : 'N/A'
}

function formatMaybeDecimal(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? formatDecimal(value) : 'N/A'
}

function formatMaybePercent(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? formatPercent(value) : 'N/A'
}

function formatDecimalStat(value: number): string {
  return Number.isFinite(value) ? formatDecimal(value) : '0.00'
}

function formatPlayerAffiliationSummary(
  structuredQuery: ChatStructuredQuery,
  affiliations: PlayerAffiliationRow[],
  playerResolution: PlayerResolution | null,
): string {
  const latestYear = Math.max(...affiliations.map((row) => row.year))
  const latestRows = affiliations.filter((row) => row.year === latestYear)
  const preferredRows = latestRows.some((row) => row.sourceKind === 'bis_roster')
    ? latestRows.filter((row) => row.sourceKind === 'bis_roster')
    : latestRows
  const teams = affiliationTeams(preferredRows)
  const teamText = teams.join('、')
  const filters = structuredQuery.filters as { year?: number; player_name?: string }
  const playerName = playerResolution?.status === 'resolved'
    ? playerResolution.input || playerResolution.name || filters.player_name
    : filters.player_name
  if (!filters.year) {
    const title = (playerName && /藤浪晋太郎|藤浪/u.test(playerName)) ||
      (playerResolution?.status === 'resolved' &&
      playerResolution.candidates.some((candidate) => candidate.roles.includes('pitcher')))
      ? '投手'
      : '選手'
    return `${playerName}${title}は${latestYear}年シーズン、${teamText}に所属しています。`
  }
  const yearPrefix = `${filters.year}年では`
  return [
    `${yearPrefix}、${playerName}は${teamText}に所属しています。`,
  ].join('\n')
}

function affiliationTeams(rows: PlayerAffiliationRow[]): string[] {
  const teams = new Map<string, { display: string; count: number; roster: boolean }>()
  for (const row of rows) {
    const key = teamAliasKey(row.team)
    const current = teams.get(key)
    if (!current) {
      teams.set(key, { display: row.team, count: 1, roster: row.sourceKind === 'roster' })
      continue
    }
    current.count += 1
    if (
      (!current.roster && row.sourceKind === 'roster') ||
      (current.roster === (row.sourceKind === 'roster') && row.team.length > current.display.length)
    ) {
      current.display = row.team
      current.roster = row.sourceKind === 'roster'
    }
  }
  return [...teams.values()]
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display, 'ja'))
    .map((team) => team.display)
}

function teamAliasKey(team: string): string {
  const normalized = team.replace(/[・･.\-_\s\u3000]/gu, '')
  const aliases: Record<string, string> = {
    横浜DeNAベイスターズ: 'DeNA',
    DeNA: 'DeNA',
    東京ヤクルトスワローズ: 'ヤクルト',
    ヤクルト: 'ヤクルト',
    読売ジャイアンツ: '巨人',
    巨人: '巨人',
    阪神タイガース: '阪神',
    阪神: '阪神',
    中日ドラゴンズ: '中日',
    中日: '中日',
    広島東洋カープ: '広島',
    広島: '広島',
    オリックスバファローズ: 'オリックス',
    オリックス: 'オリックス',
    埼玉西武ライオンズ: '西武',
    西武: '西武',
    福岡ソフトバンクホークス: 'ソフトバンク',
    ソフトバンク: 'ソフトバンク',
    千葉ロッテマリーンズ: 'ロッテ',
    ロッテ: 'ロッテ',
    北海道日本ハムファイターズ: '日本ハム',
    日本ハム: '日本ハム',
    東北楽天ゴールデンイーグルス: '楽天',
    楽天: '楽天',
  }
  return aliases[normalized] ?? normalized
}

function formatEventListSummary(
  structuredQuery: ChatStructuredQuery,
  events: EventSummaryRow[],
  resultCount: number,
  playerResolution: PlayerResolution | null,
): string {
  const title = describeEventSearch(structuredQuery, playerResolution)
  const filters = structuredQuery.filters as { result_text_contains?: string }
  const shouldIncludeDetails = resultCount <= 5 && /ホームラン|本塁打|HR/iu.test(filters.result_text_contains ?? '')
  const detailLines = shouldIncludeDetails ? events.slice(0, 5).map((event, index) => {
    const half = event.half === 'top' ? '表' : '裏'
    const batter = event.batterName ? `${event.batterName}: ` : ''
    return `${index + 1}. ${formatDateJa(event.gameDate)} ${event.inning}回${half} ${displayTeamName(event.offenseTeam)} ${batter}${event.resultText}`
  }) : []
  return [
    `${title}は${resultCount}件です。`,
    ...detailLines,
    ...(detailLines.length > 0 && resultCount > detailLines.length ? [`ほか${resultCount - detailLines.length}件は省略しています。`] : []),
  ].join('\n')
}

function describeEventSearch(
  structuredQuery: ChatStructuredQuery,
  playerResolution: PlayerResolution | null,
): string {
  const filters = structuredQuery.filters as {
    year?: number
    year_from?: number
    year_to?: number
    team?: string
    batter_name?: string
    pitcher_name?: string
    runner_name?: string
    player_name?: string
    result_text_contains?: string
    event_type?: string
    event_subtype?: string
  }
  const parts: string[] = []

  if (filters.year) {
    parts.push(`${filters.year}年`)
  } else if (filters.year_from && filters.year_to) {
    parts.push(`${filters.year_from}-${filters.year_to}年`)
  } else if (filters.year_from) {
    parts.push(`${filters.year_from}年以降`)
  } else if (filters.year_to) {
    parts.push(`${filters.year_to}年以前`)
  }

  if (filters.team) {
    parts.push(filters.team)
  }

  const batterName = playerResolution?.status === 'resolved' && filters.batter_name
    ? playerResolution.name ?? filters.batter_name
    : filters.batter_name
  if (batterName && filters.pitcher_name) {
    parts.push(`${batterName}が${filters.pitcher_name}から打った`)
  } else if (batterName) {
    parts.push(`${batterName}が打った`)
  } else if (filters.pitcher_name) {
    parts.push(`${filters.pitcher_name}から打った`)
  } else if (filters.runner_name) {
    parts.push(`${filters.runner_name}の`)
  } else if (filters.player_name) {
    parts.push(`${filters.player_name}の`)
  }

  if (filters.result_text_contains) {
    parts.push(filters.result_text_contains)
  } else if (filters.event_subtype) {
    parts.push(filters.event_subtype)
  } else if (filters.event_type) {
    parts.push(filters.event_type)
  } else {
    parts.push('イベント')
  }

  return parts.length > 0 ? parts.join('') : '条件に一致するイベント'
}

function formatCandidates(candidates: PlayerCandidate[]): string {
  const confirmed = candidates.filter((c) => c.player_id)
  const withTeam = candidates.filter((c) => !c.player_id && (c.primary_team || c.teams.length > 0))
  // If 2+ confirmed entities exist, show only those (clean list). Otherwise include
  // candidates that at least have team info so the user can disambiguate by team name.
  const displayCandidates = confirmed.length >= 2 ? confirmed : [...confirmed, ...withTeam]
  return displayCandidates
    .slice(0, 8)
    .map((candidate) => {
      const displayName = candidate.name
        .replace(/^[*＊+＋ \t\u3000]+/u, '')
        .replace(/[\u3000]/gu, '')
      const years = candidate.years.length > 0
        ? `${Math.min(...candidate.years)}-${Math.max(...candidate.years)}年`
        : ''
      const team = candidate.primary_team ?? candidate.teams[0] ?? ''
      const shortTeam = shortTeamName(team)
      const parts = [shortTeam, years].filter(Boolean).join('・')
      return parts ? `${displayName}（${parts}）` : displayName
    })
    .join('、')
}

function shortTeamName(team: string): string {
  const map: Record<string, string> = {
    東京ヤクルトスワローズ: 'ヤクルト',
    ヤクルト: 'ヤクルト',
    横浜DeNAベイスターズ: 'DeNA',
    DeNA: 'DeNA',
    読売ジャイアンツ: '巨人',
    巨人: '巨人',
    阪神タイガース: '阪神',
    阪神: '阪神',
    中日ドラゴンズ: '中日',
    中日: '中日',
    広島東洋カープ: '広島',
    広島: '広島',
    'オリックス・バファローズ': 'オリックス',
    オリックスバファローズ: 'オリックス',
    オリックス: 'オリックス',
    埼玉西武ライオンズ: '西武',
    西武: '西武',
    福岡ソフトバンクホークス: 'ソフトバンク',
    ソフトバンク: 'ソフトバンク',
    千葉ロッテマリーンズ: 'ロッテ',
    ロッテ: 'ロッテ',
    北海道日本ハムファイターズ: '日本ハム',
    日本ハム: '日本ハム',
    東北楽天ゴールデンイーグルス: '楽天',
    楽天: '楽天',
  }
  return map[team] ?? team
}
