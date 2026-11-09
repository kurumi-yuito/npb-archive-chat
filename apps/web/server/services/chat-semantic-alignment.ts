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
  'Club season wins/losses/draws/win rate/league rank/standings require team_statistics, not individual pitching_statistics or a list of game_results. A standings table has one official row per club in the requested league/year, ordered by league rank. A request for individual winning pitchers remains pitching_statistics and groups by player.',
  'Head-to-head records need a win/loss/draw aggregate of game_results with both subject and opponent preserved. A list of individual game scores without the requested aggregate is incomplete.',
  'In this semantic grammar, game_results with requested fields wins/losses/draws and aggregation count on games explicitly requests the win/loss/draw breakdown. The aggregation field names the records being counted; it does not erase or override the requested output fields. Do not misclassify this complete breakdown as a request for the number of games alone. A games-count-only output without the wins/losses/draws fields remains incomplete when the user requested a head-to-head record.',
  'A numeric or universal club/player set is not a proper-name entity. All-club statistics have no named club filter and group by team; individual club rates must not be represented as player leaderboards.',
  'The entity schema has no separate league kind. A named league may be represented as a team entity or as a competition constraint; in either form it restricts eligible clubs/players. It does not itself change the aggregation subject. For an individual leaderboard, require batting_statistics/pitching_statistics with grouping player; a league entity alongside that grouping is a scope filter, not a request for club totals. Reject grouping team or team_statistics when the user requested individual leaders.',
  'Distinguish unsupported external news/live status/predictions from recorded past performance, recent completed games, historical comparisons and standings. Words about recency alone do not make a request news or live status.',
  'Recent player form uses batting_records or pitching_records and relative recent_appearances; a single last/latest appearance uses latest_appearance. Preserve an explicit N as bounded completeness, otherwise leave the limit unspecified for the product default. Do not add current-year bounds to an appearance-relative request, including a player whose last NPB appearance was in an earlier season.',
  'The opponentStarter field on pitching_records requests the opposing starting pitcher in the selected appearance game. A second subject pitching_records output or only an opponent-team field does not represent that requirement. A same-question game anchor does not require conversation history.',
  'For generic recent form without an explicit batting/pitching domain, appearance_records preserves that unspecified domain for official-position resolution. Do not accept both concrete record kinds merely because the user said performance; both domains must actually have been requested.',
  'Resolve relative dates against current_date_jst. An omitted year, including calendar-month or month/day questions, defaults to the current NPB season unless the conversation establishes a different target year. Explicit or inherited years take precedence. Reject a missing-year clarification based solely on an omitted year, and reject dates outside the requested month or invented years unrelated to this default or conversation.',
  'Player-name ambiguity alone is not a reason to clarify at this stage. Official identity resolution handles it after parsing. Preserve literal name spans without honorifics.',
  'A non-execute policy must match the actual requested function, not an isolated word. A null contract must not hide a supported historical request.',
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
