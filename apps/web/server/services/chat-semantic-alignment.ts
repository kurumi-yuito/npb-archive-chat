import { z } from '@npb/schemas'
import { chatCompletionModelParameters, type ChatQueryLlmConfig } from './chat-query-llm'
import type { ChatQueryParserContext } from './chat-query-parser-prompt'
import type { SemanticRequest } from './chat-semantic-llm'
import { ChatQueryParserUnavailableError } from './chat-query-parser'
import { semanticUpstreamError } from './chat-semantic-upstream-error'
import { resolveContractTeamMention } from './chat-team-resolution'
import type { SemanticFacts } from './chat-semantic-facts'

const verdictSchema = z.object({ equivalent: z.boolean(),
  issues: z.array(z.object({ field: z.string().min(1), reason: z.string().min(1) }).strict()) }).strict()
const prompt = [
  'Independently verify whether a candidate NPB semantic request faithfully represents the supplied user question and conversation. Return only the specified JSON verdict.',
  'Review meaning, not prose quality, SQL feasibility, database coverage, or baseball facts. Do not resolve player IDs or expand surnames.',
  'NPB, 日本プロ野球 and プロ野球 identify domain=npb and need no extra competition constraint or team entity. A real named league, series or game competition remains a separate explicit condition.',
  'A full/detailed statistical line retains all supported metrics, including when explicitly named metrics are examples followed by など. Do not reduce that request to its examples. An exact request for only named measures stays restricted to those measures.',
  'Batting-order, fielding-position and starting-lineup usage concern recorded appearances. A club query for the latest unnamed player satisfying these conditions may use batting_records and latest_appearance without a named player. A count/leaderboard of such uses is batting_statistics with games and the same conditions, not individual batting_records or generic appearance_records.',
  'independent_semantics was extracted from the user request and history in a separate call that never saw this candidate. Verify the candidate against those conditions as well as the original question. Do not reinterpret a comparison as a cause request merely because the candidate added a causal output. Explicit newly named clubs must remain in their applicable operand.',
  'A same-period comparison retains a separate explicit calendar cutoff for each compared year, resolved from current_date_jst or the established reference period. Whole-season years alone omit that condition, even after a season has finished. The executor later verifies whether a bounded window happens to include the complete official season.',
  'For cumulative season statistics, comparison with the same point of another year retains cumulative windows from each calendar year start to the reference cutoff. Do not substitute the current month alone unless a month-only period was actually established.',
  'Reject missing or added subjects, output types, measures, actor roles, dates, periods, team/opponent conditions, competition levels, grouping, ordering, limits, or all-record completeness.',
  'For a follow-up, verify the exact referenced entity, game, measure and period against conversation history. A missing anchor requires clarification; an existing anchor must not be treated as missing.',
  'A maximum or top-N request ranks the counting statistic without adding a positive-count threshold. A ranking alone can include zero values. A population explicitly restricted to players with at least one occurrence requires that statistic > 0, independently of displaying the measure. Combine an actual eligibility restriction with a named-player exclusion using AND. Explicit zero/at-least/at-most conditions retain their stated operators and values. Distinguish a ranking by a measure from a list restricted to people who recorded a nonzero measure.',
  'A named subject’s statistic count is an output measure and may legitimately be zero. Asking how many of that statistic the subject recorded does not impose a positive-count eligibility predicate. Use predicates=[] unless the user actually restricts the eligible population or explicitly states a numeric threshold. Preserve this distinction in follow-ups and comparisons as well.',
  'An explicit foreign-player registration condition is preserved by player_category eq 外国人 under execute. Lack of category evidence is explained downstream, not a missing user condition. Never accept dropping this restriction or guessing eligibility from a name/birthplace.',
  'A follow-up asking for other players in the same club excludes the previously identified player. Preserve that named exclusion as a predicate with field player_name, operator ne, and the literal player name from history. A positive statistic condition alone does not preserve other/except. Keep the club and established evidence season. The excluded player will be resolved to an official ID before filtering; never invent an ID.',
  'A newly requested comparison year does not need to have been displayed previously. Once the displayed evidence year is established, its preceding year is determined arithmetically for a last-year comparison. This is a requested search period, not a factual claim that records for that year are already available. Do not reject the prior-year operand merely because that operand has not yet been retrieved.',
  'Resolve follow-up ellipsis from the statistic actually displayed in the preceding answer. If the requested current season was unavailable and a verified earlier season was explicitly displayed as supplemental evidence, an unqualified comparison to last year compares that displayed evidence season with its preceding season. A substitution such as then Club B Player B keeps that displayed measure and season unless the user specifies a new one. Preserve each player-to-club association from the conversation in its own complete output scope, including a later comparison of those players. Do not attach both clubs to a shared player filter or forget an explicit club in the latest user turn. Explicitly repeated current-season or calendar conditions always take precedence.',
  'An output.scope, when present, is the complete scope of that individual operand and overrides the common root scope. Verify each operand against the question: player-to-club associations and comparison periods must stay separate. Do not reject correctly scoped operands because the root contains the union of all players, clubs or years. Do reject scopes that omit a requested operand or erase an unresolved constraint.',
  'For comparisons of discrete seasons, a single output covering several years without year grouping is a total across those years, not a faithful comparison. Reject it. Named player/club/year conditions do not require semantic unresolved_constraints merely because official identity or membership still needs verification; reject those invented obstacles and duplicate entity predicates.',
  'An introduction requires identity/profile facts. A request for batting and pitching requires both. Club comparisons require every named club; they are not individual-player leaderboards.',
  'For a generic player season/career 成績 request without a batting/pitching measure, require player_statistics with empty fields to preserve the unspecified domain. Do not accept both concrete domains unless both were requested, infer a domain from the name, or require semantic clarification of name ambiguity. Official identity resolution precedes execution and official position/annual evidence selects the statistic domain. Generic recent form instead uses appearance_records.',
  'Managers/coaches require policy staff_information or output kind staff_information. Always reject player_information for staff, even if its fields include manager/coach or it has a position/name predicate restricting it to a manager: the player source cannot represent staff. This is an output-type mismatch, not a missing predicate that can repair a player query.',
  'Club season wins/losses/draws/win rate/league rank/standings require team_statistics, not individual pitching_statistics or a list of game_results. A standings table has one official row per club in the requested league/year, ordered by league rank. A request for individual winning pitchers remains pitching_statistics and groups by player.',
  'Explicit club batting/pitching totals or rates group by team. A club’s player pitching/batting statistics without an explicit team-total/rate request instead retains pitching_statistics/batting_statistics grouped by player and the club as membership scope. Empty team_statistics would omit that batting/pitching demand.',
  'When the user delegates selection of a balanced batter from batting average, on-base percentage and slugging, OPS descending is an acceptable transparent combined proxy if all three measures and OPS remain displayed. This delegation does not require clarification of the selection rule. Preserve any expressly supplied formula instead.',
  'A why/reasons question about performance or standings changes requires causal_explanation, which receives an archive limitation rather than an invented causal claim. A factual comparison specified in the same question still requires its separate club/player/period statistical operands. A comparison alone omits the causal request; a causal limitation alone omits an explicitly requested comparison. Do not demand an executable causal statistic or unresolved predicate: causal_explanation is the valid representation of that request. The question may contain a false premise about the direction of change; extraction must not assume the premise is true.',
  'Reject an invented causal_explanation when the user only asks whether numeric performance is higher/lower, more/fewer, better/worse, or asks for a comparison. Such requests require quantitative operands, not causal analysis. A period difference or a changed value does not imply a request for reasons.',
  'A request for the result of one dated game needs per-game score/result fields. Do not replace it with wins/losses/draws fields, which request an aggregate record across a set of games. Aggregate win/loss fields require an actual win/loss-total request.',
  'Head-to-head records need a win/loss/draw aggregate of game_results with both subject and opponent preserved. A list of individual game scores without the requested aggregate is incomplete.',
  'A recent club win/loss record uses game_results with wins and losses, the named club as subject, and recent_appearances. Preserve an explicit game count as the window. Do not substitute whole-season totals or individual player appearances.',
  'An overall championship-series winner/final outcome requires series_result with the series competition and requested year scope. Individual game_results, a game-count reduction, or regular league team_statistics do not answer who won a championship series. The unknown winner is a requested output, not an already resolved entity. Regular-season three-game cards remain game_results; league standings remain team_statistics. Preserve explicitly requested team/player or other restrictions even when the executor cannot support them.',
  'Future fixtures or next scheduled starts require game_schedule, not past game_results/pitching_records. In mixed past-record and future-schedule requests require both outputs with independent periods and reductions. A schedule capability limitation does not justify dropping the supported historical operand. A game_schedule contract under execute is a valid semantic representation even though the archive returns a capability limitation for that operand.',
  'In this semantic grammar, game_results with requested fields wins/losses/draws and aggregation count on games explicitly requests the win/loss/draw breakdown. The aggregation field names the records being counted; it does not erase or override the requested output fields. Do not misclassify this complete breakdown as a request for the number of games alone. A games-count-only output without the wins/losses/draws fields remains incomplete when the user requested a head-to-head record.',
  'A numeric or universal club/player set is not a proper-name entity. All-club statistics have no named club filter and group by team; individual club rates must not be represented as player leaderboards.',
  'The entity schema has no separate league kind. A named league may be represented as a team entity or as a competition constraint; in either form it restricts eligible clubs/players. It does not itself change the aggregation subject. For an individual leaderboard, require batting_statistics/pitching_statistics with grouping player; a league entity alongside that grouping is a scope filter, not a request for club totals. Reject grouping team or team_statistics when the user requested individual leaders.',
  'Check entity roles independently of grouping: in a league-scoped individual leaderboard, the league restricts player membership and must use team role subject or competition_scope. Team role opponent instead asks about performance against that league and materially changes the records. Reject opponent unless the question explicitly asks about opposition; a correct output kind and grouping do not repair an incorrect role.',
  'Distinguish unsupported external news/live status/predictions from recorded past performance, recent completed games, historical comparisons and standings. Words about recency alone do not make a request news or live status.',
  'A fully specified situational 得点圏打率 request may execute as batting_statistics with battingAverageWithRunnersInScoringPosition while retaining its ranking/limit. Missing archive coverage is explained downstream with a clearly labeled ordinary-average alternative; it is not missing user context. Reject silently substituting ordinary battingAverage during semantic extraction.',
  'Recent player form uses batting_records or pitching_records and relative recent_appearances; a single last/latest appearance uses latest_appearance. Preserve an explicit N as bounded completeness, otherwise leave the limit unspecified for the product default. Do not add current-year bounds to an appearance-relative request, including a player whose last NPB appearance was in an earlier season.',
  'The opponentStarter field on pitching_records requests the opposing starting pitcher in the selected appearance game. A second subject pitching_records output or only an opponent-team field does not represent that requirement. A same-question game anchor does not require conversation history.',
  'A direct player-vs-player matchup requires event_records and relationship eq direct_matchup, not game_results or mere participation in opposing teams. Preserve stated actor roles and their associated clubs (team role batter/pitcher); unspecified player roles remain subject and the executor checks both directions. Do not infer roles from player names or treat a third player mentioned as context as another matchup operand.',
  'For generic recent form without an explicit batting/pitching domain, appearance_records preserves that unspecified domain for official-position resolution. Do not accept both concrete record kinds merely because the user said performance; both domains must actually have been requested.',
  'Resolve relative dates against current_date_jst. An omitted year, including calendar-month or month/day questions, defaults to the current NPB season unless the conversation establishes a different target year. Explicit or inherited years take precedence. Reject a missing-year clarification based solely on an omitted year, and reject dates outside the requested month or invented years unrelated to this default or conversation.',
  'An entirely unspecified season for ordinary player statistics already defaults to the current NPB season in the compiler. Accept this representation when the user omitted the year; do not demand an explicit year for that default. A stated relative season must still be represented.',
  'An unqualified current/now affiliation question asks for the current NPB season affiliation, represented by the current year/current_season, not a single game-date condition. Explicit calendar dates and contract/live-status requests retain their distinct meaning.',
  'A last-year comparison alone does not imply a same-calendar-cutoff comparison. A preceding whole-season value is compared with the preceding whole season unless the user explicitly requests the same point or history establishes a bounded period. Reject invented date cutoffs in a whole-season comparison.',
  'next_week means Monday through Sunday of the following calendar week, not the current week; next_month means the following calendar month. Check resolved date bounds accordingly.',
  'Player-name ambiguity alone is not a reason to clarify at this stage. Official identity resolution handles it after parsing. Preserve literal name spans without honorifics.',
  'A non-execute policy must match the actual requested function, not an isolated word. A null contract must not hide a supported historical request.',
  'A separate background assertion about a third player in a dated game is not automatically a filter or an operand of the requested two-player career matchup. It may remain literal context_references without changing the executable subjects/date bounds. Require such a date as a filter only when the user actually binds the requested lookup to that game.',
  'For news/realtime/prediction/staff_information/outside_npb/capabilities, judge whether the policy correctly classifies the requested function. These policies intentionally need no executable contract. Lack of a database grammar for forecasting, coaching information or external topics is not a semantic defect in a correctly classified unsupported policy. Never require a prediction to be represented as historical statistics.',
  'For policy clarify, a contract must preserve all known conditions and identify the genuinely missing anchor in unresolved_constraints. Unknown entities must remain absent: a pronoun without a usable conversation antecedent cannot supply a player, club, game or date. Do not reject a clarification for omitting precisely that unknown information, and do not require inventing it. If the conversation reports no matching game or no identified player, it does not establish a starting-pitcher or player anchor for the next turn. A literal named entity still must be retained.',
  'For a complaint or pronoun with no usable history and no identifiable output, policy clarify may use unresolved_request with empty fields. Accept this explicit missing-request placeholder; do not demand a guessed game/player output. Reject unresolved_request when the actual question establishes a concrete output.',
  'Use equivalent=true only when there is no material mismatch; issues must then be empty. Otherwise equivalent=false with concrete field paths and missing or misrepresented constraints. Do not supply a replacement interpretation or unsupported facts.',
].join('\n')

/** A separate structured review; deterministic evidence checks remain necessary after this stage. */
export async function verifySemanticAlignment(config: ChatQueryLlmConfig, input: {
  message: string; context: ChatQueryParserContext; candidate: SemanticRequest; currentDate: string;
  facts: SemanticFacts; fetch: typeof fetch; signal: AbortSignal; onRequest?: () => void
}): Promise<string[]> {
  input.onRequest?.()
  // Workers' native fetch must be called as a standalone function, not as a
  // method of the dependency container (which supplies an invalid receiver).
  const fetchFn = input.fetch
  const response = await fetchFn(`${config.baseUrl.replace(/\/$/u, '')}/chat/completions`, {
    method: 'POST', signal: input.signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ ...chatCompletionModelParameters(config), max_completion_tokens: 2000,
      response_format: { type: 'json_schema', json_schema: { name: 'npb_semantic_alignment', strict: true, schema: {
        type: 'object', additionalProperties: false, required: ['equivalent', 'issues'], properties: {
          equivalent: { type: 'boolean' }, issues: { type: 'array', items: { type: 'object', additionalProperties: false,
            required: ['field', 'reason'], properties: { field: { type: 'string' }, reason: { type: 'string' } } } },
        },
      } } },
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify({
        current_date_jst: input.currentDate, history: input.context.history ?? [], message: input.message,
        independent_semantics: input.facts, candidate: input.candidate,
      }) }],
    }),
  }).catch((error) => { throw new ChatQueryParserUnavailableError(`Semantic verification unavailable: ${String(error)}`) })
  if (!response.ok) throw await semanticUpstreamError(response, 'verifier')
  try {
    const payload = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string; refusal?: string | null } }> }
    const choice = payload.choices?.[0]
    if (choice?.finish_reason === 'length' || choice?.message?.refusal) throw new Error('Incomplete or refused semantic review')
    const verdict = verdictSchema.parse(JSON.parse(choice?.message?.content ?? ''))
    if (verdict.equivalent !== (verdict.issues.length === 0)) throw new Error('Inconsistent semantic review')
    const compact = (text: string) => text.normalize('NFKC').replace(/\s+/gu, '')
    const contract = input.candidate.query_contract
    const scopes = contract ? [contract, ...contract.requested_output.flatMap((output) => output.scope ? [output.scope] : [])] : []
    const omissions = input.facts.entity_mentions.flatMap((mention) => {
      // An inherited name is outside this latest-turn coverage check. The
      // separate semantic verdict still checks its conversational meaning.
      if (!compact(input.message).includes(compact(mention.mention))) return []
      if (!contract) return []
      const playerName = (value: string) => compact(value).replace(/(?:選手|投手|打者|さん|氏)$/u, '')
      const sameMention = (value: string) => mention.kind === 'team'
        ? resolveContractTeamMention(value) === resolveContractTeamMention(mention.mention)
        : mention.kind === 'player' ? playerName(mention.mention).length > 0 && playerName(value).includes(playerName(mention.mention))
        : compact(value).includes(compact(mention.mention))
      const preserved = scopes.some((scope) => scope.entities.some((entity) => entity.kind === mention.kind && sameMention(entity.mention)) ||
        (mention.kind === 'team' && scope.competition_scope.competitions.some(sameMention)) ||
        scope.predicates.some((predicate) => (Array.isArray(predicate.value) ? predicate.value : [predicate.value]).some((value) => typeof value === 'string' && sameMention(value))))
      return preserved ? [] : [`entities: Explicit ${mention.kind} condition ${mention.mention} from the latest message was omitted. Preserve its literal entity and role in the applicable operand.`]
    })
    const outputIssues: string[] = []
    if (contract) {
      const causal = contract.requested_output.some((output) => output.kind === 'causal_explanation')
      if (causal !== input.facts.requires_causal_explanation) outputIssues.push('requested_output: Preserve a causal explanation exactly when a cause or reason was requested. A factual comparison alone does not request a causal explanation.')
      const calendarOperands = contract.requested_output.map((output) => output.scope ?? contract)
        .filter((scope) => !['recent_appearances', 'latest_appearance'].includes(scope.temporal_scope.relative ?? ''))
      const cutoffYears = new Set(calendarOperands.flatMap((scope) => {
        const end = scope.temporal_scope.date_to
        return end ? [end.slice(0, 4)] : []
      }))
      const cutoffPeriods = new Set(calendarOperands.flatMap((scope) => scope.temporal_scope.date_to
        ? [`${scope.temporal_scope.date_from ?? ''}:${scope.temporal_scope.date_to}`] : []))
      if (input.candidate.policy === 'execute' && calendarOperands.length && input.facts.comparison_period !== 'none' &&
        (input.facts.comparison_period === 'season_to_date' ? cutoffYears.size < 2 : cutoffPeriods.size < 2)) outputIssues.push('temporal_scope: A same-period comparison needs a separate explicit end-date cutoff for each compared season. Preserve comparable calendar windows instead of replacing them with whole-year totals.')
      if (input.candidate.policy === 'execute' && input.facts.comparison_period === 'season_to_date' && contract.requested_output.some((output) => {
        if (!output.kind.endsWith('_statistics')) return false
        const time = (output.scope ?? contract).temporal_scope
        if (time.date_to === null) return true
        const year = Number(time.date_to.slice(0, 4))
        const yearScope = (time.years.length === 1 && time.years[0] === year) || (time.year_from === year && time.year_to === year)
        return time.date_from !== `${year}-01-01` && !(time.date_from === null && yearScope)
      })) outputIssues.push('temporal_scope: Cumulative season-to-date comparisons begin at each calendar year start and end at the corresponding cutoff. A single day or current-month-only range omits the earlier season records.')
    }
    return [...verdict.issues.map((issue) => `${issue.field}: ${issue.reason}`), ...omissions, ...outputIssues].slice(0, 12)
  } catch (error) { throw new ChatQueryParserUnavailableError(`Invalid semantic verification: ${String(error)}`) }
}
