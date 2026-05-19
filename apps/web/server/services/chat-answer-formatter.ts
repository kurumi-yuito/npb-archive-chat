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

type FormatChatAnswerInput = {
  question: string
  structuredQuery: ChatStructuredQuery
  results: ChatResponse['results']
  sources: ChatSource[]
  playerResolution?: PlayerResolution | null
}

type EventSummaryRow = ChatResponse['results']['events'][number]

export function formatChatAnswer({
  question,
  structuredQuery,
  results,
  sources,
  playerResolution = null,
}: FormatChatAnswerInput): ChatResponse['answer'] {
  const sourceUrls = Array.from(new Set([
    ...sources.map((source) => source.source_url),
    ...results.events.flatMap((row) => row.sourceUrl ? [row.sourceUrl] : []),
    ...results.affiliations.flatMap((row) => row.sourceUrl ? [row.sourceUrl] : []),
    ...results.batting.flatMap((row) => row.sourceUrl ? [row.sourceUrl] : []),
    ...results.pitching.flatMap((row) => row.sourceUrl ? [row.sourceUrl] : []),
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
    return `選手を特定できないため検索できませんでした。入力「${playerResolution.input}」に一致する選手候補はDB内に見つかりません。`
  }
  if (playerResolution?.status === 'ambiguous') {
    return `どの${playerResolution.input}ですか。選手候補が複数あるため検索を実行しませんでした。候補: ${formatCandidates(playerResolution.candidates)}`
  }

  if (resultCount === 0) {
    if (structuredQuery.intent === 'search_games') {
      return '条件に一致する試合は見つかりませんでした。'
    }
    if (structuredQuery.intent === 'search_batting' || structuredQuery.intent === 'aggregate_batting') {
      return '条件に一致する打撃成績は見つかりませんでした。DB結果にないため、推測では回答しません。'
    }
    if (structuredQuery.intent === 'search_pitching') {
      return '条件に一致する投手成績は見つかりませんでした。'
    }
    if (structuredQuery.intent === 'aggregate_pitching') {
      return '条件に一致する投手集計は見つかりませんでした。DB結果にないため、推測では回答しません。'
    }
    if (structuredQuery.intent === 'search_roster') {
      return '条件に一致するロスターは見つかりませんでした。DB結果にないため、推測では回答しません。'
    }
    if (structuredQuery.intent === 'player_affiliation') {
      return '条件に一致する所属チーム情報は見つかりませんでした。DB結果にないため、推測では回答しません。'
    }
    if (structuredQuery.intent === 'game_detail') {
      return '条件に一致する試合詳細は見つかりませんでした。DB結果にないため、推測では回答しません。'
    }
    if (structuredQuery.intent === 'aggregate_events') {
      return '条件に一致するイベント集計は見つかりませんでした。DB結果にないため、推測では回答しません。'
    }
    return '条件に一致するイベントは見つかりませんでした。'
  }

  if (structuredQuery.intent === 'search_games') {
    const first = results.games[0] as GameSummaryRow
    return `条件に一致する試合が${resultCount}件あります。先頭は${first.date}の${first.matchupText}です。`
  }

  if (structuredQuery.intent === 'search_pitching') {
    const first = results.pitching[0] as PitchingLineRow
    if (isEvaluationQuestion(question, structuredQuery.filters)) {
      return formatPitchingEvaluationSummary(results.pitching as PitchingLineRow[])
    }
    if (first.sourceKind === 'bis_pitching') {
      return formatBisPitchingSummary(first, resultCount)
    }
    return `条件に一致する投手成績が${resultCount}件あります。先頭は${first.gameDate}の${first.pitcherName}で、${first.inningsPitched}回 ${first.strikeouts}奪三振です。`
  }

  if (structuredQuery.intent === 'search_batting') {
    const first = results.batting[0] as BattingLineRow
    if (isEvaluationQuestion(question, structuredQuery.filters)) {
      return formatBattingEvaluationSummary(results.batting as BattingLineRow[], resultCount)
    }
    if (first.sourceKind === 'bis_batting') {
      return formatBisBattingSummary(first, resultCount)
    }
    return `条件に一致する打撃成績が${resultCount}件あります。先頭は${formatDateJa(first.gameDate)}の${first.playerName}で、${first.atBats}打数${first.hits}安打${first.runsBattedIn}打点です。`
  }

  if (structuredQuery.intent === 'search_roster') {
    const first = results.roster[0] as RosterEntryRow
    const starter = first.starter === true ? 'スタメン' : '登録'
    return `条件に一致するロスターが${resultCount}件あります。先頭は${first.gameDate} ${first.gameId} の${first.team} ${first.playerName}（${starter}）です。`
  }

  if (structuredQuery.intent === 'player_affiliation') {
    return formatPlayerAffiliationSummary(structuredQuery, results.affiliations, playerResolution)
  }

  if (structuredQuery.intent === 'game_detail') {
    return formatGameDetailSummary(
      results.gameDetails as GameDetailRow[],
      results.events as EventSummaryRow[],
      resultCount,
    )
  }

  if (
    structuredQuery.intent === 'aggregate_batting' ||
    structuredQuery.intent === 'aggregate_pitching' ||
    structuredQuery.intent === 'aggregate_events'
  ) {
    const first = results.aggregates[0] as AggregateRow
    return `条件に一致する集計結果が${resultCount}件あります。先頭は${first.label}で、対象件数は${first.total}件です。数値はDB集計結果のみを使っています。`
  }

  return formatEventListSummary(structuredQuery, results.events, resultCount, playerResolution)
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
    ...(row.sourceUrl ? [`source: ${row.sourceUrl}`] : []),
  ].join('\n')
}

function formatBisPitchingSummary(row: PitchingLineRow, resultCount: number): string {
  const year = row.gameDate.slice(0, 4)
  const stats = parseStatsJson(row.statsJson)
  const statLine = [
    statPart(stats, '登板', '登板'),
    statPart(stats, '勝利', '勝利'),
    statPart(stats, '敗北', '敗北'),
    statPart(stats, 'セーブ', 'セーブ'),
    statPart(stats, 'ホールド', 'ホールド'),
    statPart(stats, '投球回', '投球回'),
    statPart(stats, '奪三振', '奪三振'),
    statPart(stats, '失点', '失点'),
    statPart(stats, '自責点', '自責点'),
    statPart(stats, '防御率', '防御率'),
  ].filter(Boolean)
  return [
    `${year}年の${row.team} ${row.pitcherName}の投手成績です。`,
    ...(statLine.length > 0 ? [statLine.join('、')] : []),
    ...(resultCount > 1 ? [`同条件の成績行が${resultCount}件あります。`] : []),
    ...(row.sourceUrl ? [`source: ${row.sourceUrl}`] : []),
  ].join('\n')
}

function formatGameDetailSummary(
  rows: GameDetailRow[],
  events: EventSummaryRow[],
  resultCount: number,
): string {
  const lines = rows.slice(0, 5).flatMap((row, index) => {
    const linescore = parseLinescore(row.linescoreJson)
    const result = linescore ? describeGameResult(row, linescore) : `${row.awayTeamName} vs ${row.homeTeamName}`
    const highlights = linescore ? describeGameHighlights(linescore) : []
    const gameEvents = events.filter((event) => event.gameId === row.gameId)
    const eventHighlights = describeEventHighlights(gameEvents)
    return [
      `${index + 1}. ${formatDateJa(row.date)} ${displayVenueName(row.venue)}、${result}`,
      ...highlights.map((highlight) => `   ${highlight}`),
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

function parseLinescore(value: string | null | undefined): ParsedLinescore | null {
  const parsed = parseJsonObject(value)
  const away = parseLinescoreSide(parsed.away)
  const home = parseLinescoreSide(parsed.home)
  return away && home ? { away, home } : null
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
  const playerName = rows[0]?.playerName ?? '対象選手'
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
    `${playerName}は、DBで確認できる直近${gameRows.length}試合の打撃内容を見る限り、ポジティブに評価できます。`,
    positives.length > 0
      ? `根拠は${positives.join('、')}です。`
      : '安打や打点は確認できませんが、直近試合の出場実績は確認できます。',
    `対象試合: ${gameRows.map((row) => formatDateJa(row.gameDate)).join('、')}`,
  ].join('\n')
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
    `${row.team} ${row.playerName}は、DBで確認できる${year}年シーズン成績からポジティブに評価できます。`,
    positives.length > 0
      ? `根拠は${positives.join('、')}です。`
      : '根拠となる成績行は確認できていますが、主要指標の値はDB行から取り出せませんでした。',
    ...(resultCount > 1 ? [`同条件の成績行が${resultCount}件あります。`] : []),
    ...(row.sourceUrl ? [`source: ${row.sourceUrl}`] : []),
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
  const seasonRow = rows.find((row) => row.sourceKind === 'bis_pitching')
  if (seasonRow) {
    return formatBisPitchingEvaluationSummary(seasonRow, rows.length)
  }
  const gameRows = rows.slice(0, 5)
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
  return [
    `${pitcherName}は、DBで確認できる直近${gameRows.length}登板の投球内容からポジティブに評価できます。`,
    `根拠は${positives.join('、')}です。`,
    `対象試合: ${gameRows.map((row) => formatDateJa(row.gameDate)).join('、')}`,
  ].join('\n')
}

function formatBisPitchingEvaluationSummary(row: PitchingLineRow, resultCount: number): string {
  const stats = parseStatsJson(row.statsJson)
  const year = row.gameDate.slice(0, 4)
  const positives = [
    positiveCountStatPart(stats, '登板', '登板'),
    positiveCountStatPart(stats, '勝利', '勝利'),
    positiveCountStatPart(stats, 'セーブ', 'セーブ'),
    positiveCountStatPart(stats, 'ホールド', 'ホールド'),
    positiveCountStatPart(stats, '奪三振', '奪三振'),
    statPart(stats, '投球回', '投球回'),
    statPart(stats, '防御率', '防御率'),
  ].filter(Boolean)
  return [
    `${row.team} ${row.pitcherName}は、DBで確認できる${year}年シーズン投手成績からポジティブに評価できます。`,
    positives.length > 0
      ? `根拠は${positives.join('、')}です。`
      : '根拠となる成績行は確認できていますが、主要指標の値はDB行から取り出せませんでした。',
    ...(resultCount > 1 ? [`同条件の成績行が${resultCount}件あります。`] : []),
    ...(row.sourceUrl ? [`source: ${row.sourceUrl}`] : []),
  ].join('\n')
}

function isEvaluationQuestion(question: string, filters: Record<string, unknown>): boolean {
  return Boolean(filters.recent) || /評価|調子|状態|最近どう|どう思/u.test(question)
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
  const yearPrefix = filters.year
    ? `${filters.year}年では`
    : `DB上の最新確認年（${latestYear}年）では`
  const evidence = preferredRows.find((row) => row.sourceKind === 'bis_roster') ??
    latestRows.find((row) => row.sourceKind === 'roster') ??
    latestRows[0]!
  return [
    `${yearPrefix}、${playerName}は${teamText}に所属しています。`,
    ...(evidence.sourceUrl ? [`source: ${evidence.sourceUrl}`] : []),
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
  const visibleEvents = events.slice(0, SEARCH_EVENTS_SUMMARY_LIMIT)
  const remainingCount = Math.max(0, resultCount - visibleEvents.length)
  const lines = [
    `${title}は${resultCount}件です。`,
    '',
    ...visibleEvents.flatMap((event, index) => formatEventListItem(event, index + 1)),
  ]

  if (remainingCount > 0) {
    lines.push('', `ほか${remainingCount}件は省略しています。`)
  }

  return lines.join('\n')
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
  if (batterName) {
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

function formatEventListItem(event: EventSummaryRow, index: number): string[] {
  const half = event.half === 'top' ? '表' : '裏'
  const result = event.pitcherName
    ? `${event.pitcherName}から${event.resultText}`
    : event.resultText
  const lines = [
    `${index}. ${event.gameDate} ${event.gameId} ${event.inning}回${half}`,
    `   ${result}`,
  ]

  if (event.sourceUrl) {
    lines.push(`   source: ${event.sourceUrl}`)
  }

  return lines
}

function formatCandidates(candidates: PlayerCandidate[]): string {
  return candidates
    .slice(0, 10)
    .map((candidate) => {
      const years = candidate.years.length > 0
        ? `${Math.min(...candidate.years)}-${Math.max(...candidate.years)}`
        : 'year不明'
      const team = candidate.primary_team ?? candidate.teams[0] ?? 'team不明'
      const playerId = candidate.player_id ?? 'player_id不明'
      return `${candidate.name}(player_id=${playerId}, ${team}, ${years})`
    })
    .join('、')
}
