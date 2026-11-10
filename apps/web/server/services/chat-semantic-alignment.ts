import { z } from '@npb/schemas'
import type { ChatQueryLlmConfig } from './chat-query-llm'
import type { ChatQueryParserContext } from './chat-query-parser-prompt'
import type { SemanticRequest } from './chat-semantic-llm'
import { ChatQueryParserUnavailableError } from './chat-query-parser'

const verdictSchema = z.object({ equivalent: z.boolean(), issues: z.array(z.object({ field: z.string().min(1), reason: z.string().min(1) }).strict()) }).strict()
const prompt = [
  'Independently verify whether a candidate NPB semantic request faithfully represents the supplied user question and conversation. Return only the specified JSON verdict.',
  'Review meaning, not prose quality, SQL feasibility, database coverage, or baseball facts. Do not resolve player IDs or expand surnames.',
  'Reject missing or added subjects, output types, measures, actor roles, dates, periods, team/opponent conditions, competition levels, grouping, ordering, limits, or all-record completeness.',
  'For a follow-up, verify the exact referenced entity, game, measure and period against conversation history. A missing anchor requires clarification; an existing anchor must not be treated as missing.',
  'An output.scope, when present, is the complete scope of that individual operand and overrides the common root scope. Verify each operand against the question: player-to-club associations and comparison periods must stay separate. Do not reject correctly scoped operands because the root contains the union of all players, clubs or years. Do reject scopes that omit a requested operand or erase an unresolved constraint.',
  'For comparisons of discrete seasons, a single output covering several years without year grouping is a total across those years, not a faithful comparison. Reject it. Named player/club/year conditions do not require semantic unresolved_constraints merely because official identity or membership still needs verification; reject those invented obstacles and duplicate entity predicates.',
  'An introduction requires identity/profile facts. A request for batting and pitching requires both. Club comparisons require every named club; they are not individual-player leaderboards.',
  'Managers/coaches require policy staff_information or output kind staff_information. Always reject player_information for staff, even if its fields include manager/coach or it has a position/name predicate restricting it to a manager: the player source cannot represent staff. This is an output-type mismatch, not a missing predicate that can repair a player query.',
  'Club season wins/losses/draws/win rate/league rank/standings require team_statistics, not individual pitching_statistics or a list of game_results. A standings table has one official row per club in the requested league/year, ordered by league rank. A request for individual winning pitchers remains pitching_statistics and groups by player.',
  'Head-to-head records need a win/loss/draw aggregate of game_results with both subject and opponent preserved. A list of individual game scores without the requested aggregate is incomplete.',
  'Future fixtures or next scheduled starts require game_schedule, not past game_results/pitching_records. In mixed past-record and future-schedule requests require both outputs with independent periods and reductions. A schedule capability limitation does not justify dropping the supported historical operand. A game_schedule contract under execute is a valid semantic representation even though the archive returns a capability limitation for that operand.',
  'In this semantic grammar, game_results with requested fields wins/losses/draws and aggregation count on games explicitly requests the win/loss/draw breakdown. The aggregation field names the records being counted; it does not erase or override the requested output fields. Do not misclassify this complete breakdown as a request for the number of games alone. A games-count-only output without the wins/losses/draws fields remains incomplete when the user requested a head-to-head record.',
  'A numeric or universal club/player set is not a proper-name entity. All-club statistics have no named club filter and group by team; individual club rates must not be represented as player leaderboards.',
  'The entity schema has no separate league kind. A named league may be represented as a team entity or as a competition constraint; in either form it restricts eligible clubs/players. It does not itself change the aggregation subject. For an individual leaderboard, require batting_statistics/pitching_statistics with grouping player; a league entity alongside that grouping is a scope filter, not a request for club totals. Reject grouping team or team_statistics when the user requested individual leaders.',
  'Check entity roles independently of grouping: in a league-scoped individual leaderboard, the league restricts player membership and must use team role subject or competition_scope. Team role opponent instead asks about performance against that league and materially changes the records. Reject opponent unless the question explicitly asks about opposition; a correct output kind and grouping do not repair an incorrect role.',
  'Distinguish unsupported external news/live status/predictions from recorded past performance, recent completed games, historical comparisons and standings. Words about recency alone do not make a request news or live status.',
  'Recent player form uses batting_records or pitching_records and relative recent_appearances; a single last/latest appearance uses latest_appearance. Preserve an explicit N as bounded completeness, otherwise leave the limit unspecified for the product default. Do not add current-year bounds to an appearance-relative request, including a player whose last NPB appearance was in an earlier season.',
  'The opponentStarter field on pitching_records requests the opposing starting pitcher in the selected appearance game. A second subject pitching_records output or only an opponent-team field does not represent that requirement. A same-question game anchor does not require conversation history.',
  'For generic recent form without an explicit batting/pitching domain, appearance_records preserves that unspecified domain for official-position resolution. Do not accept both concrete record kinds merely because the user said performance; both domains must actually have been requested.',
  'Resolve relative dates against current_date_jst. An omitted year, including calendar-month or month/day questions, defaults to the current NPB season unless the conversation establishes a different target year. Explicit or inherited years take precedence. Reject a missing-year clarification based solely on an omitted year, and reject dates outside the requested month or invented years unrelated to this default or conversation.',
  'next_week means Monday through Sunday of the following calendar week, not the current week; next_month means the following calendar month. Check resolved date bounds accordingly.',
  'Player-name ambiguity alone is not a reason to clarify at this stage. Official identity resolution handles it after parsing. Preserve literal name spans without honorifics.',
  'A non-execute policy must match the actual requested function, not an isolated word. A null contract must not hide a supported historical request.',
  'For news/realtime/prediction/staff_information/outside_npb/capabilities, judge whether the policy correctly classifies the requested function. These policies intentionally need no executable contract. Lack of a database grammar for forecasting, coaching information or external topics is not a semantic defect in a correctly classified unsupported policy. Never require a prediction to be represented as historical statistics.',
  'For policy clarify, a contract must preserve all known conditions and identify the genuinely missing anchor in unresolved_constraints. Unknown entities must remain absent: a pronoun without a usable conversation antecedent cannot supply a player, club, game or date. Do not reject a clarification for omitting precisely that unknown information, and do not require inventing it. If the conversation reports no matching game or no identified player, it does not establish a starting-pitcher or player anchor for the next turn. A literal named entity still must be retained.',
  'Use equivalent=true only when there is no material mismatch; issues must then be empty. Otherwise equivalent=false with concrete field paths and missing or misrepresented constraints. Do not supply a replacement interpretation or unsupported facts.',
].join('\n')

/** A separate structured review; deterministic evidence checks remain necessary after this stage. */
export async function verifySemanticAlignment(config: ChatQueryLlmConfig, input: {
  message: string; context: ChatQueryParserContext; candidate: SemanticRequest; currentDate: string;
  fetch: typeof fetch; signal: AbortSignal; onRequest?: () => void
}): Promise<string[]> {
  input.onRequest?.()
  // Workers' native fetch must be called as a standalone function, not as a
  // method of the dependency container (which supplies an invalid receiver).
  const fetchFn = input.fetch
  const response = await fetchFn(`${config.baseUrl.replace(/\/$/u, '')}/chat/completions`, {
    method: 'POST', signal: input.signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, temperature: 0, max_completion_tokens: 1000,
      response_format: { type: 'json_schema', json_schema: { name: 'npb_semantic_alignment', strict: true, schema: {
        type: 'object', additionalProperties: false, required: ['equivalent', 'issues'], properties: {
          equivalent: { type: 'boolean' }, issues: { type: 'array', items: { type: 'object', additionalProperties: false,
            required: ['field', 'reason'], properties: { field: { type: 'string' }, reason: { type: 'string' } } } },
        },
      } } },
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify({
        current_date_jst: input.currentDate, history: input.context.history ?? [], message: input.message, candidate: input.candidate,
      }) }],
    }),
  }).catch((error) => { throw new ChatQueryParserUnavailableError(`Semantic verification unavailable: ${String(error)}`) })
  if (!response.ok) throw new ChatQueryParserUnavailableError(`Semantic verifier upstream HTTP ${response.status}`)
  try {
    const payload = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string; refusal?: string | null } }> }
    const choice = payload.choices?.[0]
    if (choice?.finish_reason === 'length' || choice?.message?.refusal) throw new Error('Incomplete or refused semantic review')
    const verdict = verdictSchema.parse(JSON.parse(choice?.message?.content ?? ''))
    if (verdict.equivalent !== (verdict.issues.length === 0)) throw new Error('Inconsistent semantic review')
    return verdict.issues.map((issue) => `${issue.field}: ${issue.reason}`).slice(0, 12)
  } catch (error) { throw new ChatQueryParserUnavailableError(`Invalid semantic verification: ${String(error)}`) }
}
