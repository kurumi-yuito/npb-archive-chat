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
  'An introduction requires identity/profile facts. A request for batting and pitching requires both. Club comparisons require every named club; they are not individual-player leaderboards.',
  'Distinguish unsupported external news/live status/predictions from recorded past performance, recent completed games, historical comparisons and standings. Words about recency alone do not make a request news or live status.',
  'Resolve relative dates against current_date_jst. Current-season or unspecified player-season statistics use the current NPB year; explicitly requested dates and years take precedence. A month-only historical aggregate needs its year clarified unless history supplies it.',
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
