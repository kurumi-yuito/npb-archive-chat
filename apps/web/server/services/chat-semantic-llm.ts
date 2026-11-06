import { queryContractJsonSchema, queryContractSchema, z } from '@npb/schemas'
import type { ChatQueryLlmConfig } from './chat-query-llm'
import { ChatQueryParserUnavailableError } from './chat-query-parser'
import type { ChatQueryParserContext } from './chat-query-parser-prompt'
import { verifySemanticAlignment } from './chat-semantic-alignment'

const policies = ['execute', 'clarify', 'news', 'realtime', 'prediction', 'capabilities', 'outside_npb', 'staff_information'] as const
const reasons = ['missing_history', 'history_target_unavailable', 'insufficient_context', 'missing_year'] as const
const semanticRequestSchema = z.object({
  domain: z.enum(['npb', 'non_npb', 'undetermined']),
  query_contract: queryContractSchema.nullable(),
  policy: z.enum(policies),
  clarification_reason: z.enum(reasons).nullable(),
  subject: z.string().nullable(),
}).strict()
export type SemanticRequest = z.infer<typeof semanticRequestSchema>

const systemPrompt = [
  'Extract the meaning of an NPB question and its conversation references. Return only the specified structured semantic request.',
  'You do not select database intents, tables, repository functions, or filters. A deterministic compiler does that afterwards. Never emit physical executor fields or resolved player IDs.',
  'Preserve player mentions as written. Do not expand a surname into a full name. Identity and ambiguity are resolved from official records afterwards; an ambiguous surname still uses policy execute.',
  'An entity mention is the name span only: exclude honorifics and role nouns such as 選手, 投手, さん, 氏. Preserve the actual name text and do not infer missing given names.',
  'For individual plays assign the stated actor role: batter for a player hitting, pitcher for a player pitching, runner for a player running. subject means participation in any role and must not replace a stated action role.',
  'Only explicit constraints and conditions actually inherited from history belong in the contract. An unspecified level is unspecified, NOT both. Use both only when the user explicitly requests both first-team and farm records.',
  'Do not repeat entities or temporal constraints in predicates. Predicates describe additional requested conditions. A text condition uses field result_text and operator contains. Do not add an implicit event_type predicate.',
  'A list of events requires fields gameDate, opponent, gameId, sourceUrl. Add other required fields only when explicitly requested. An unspecified ordering is an empty array.',
  'Event records describe individual plays. Their play classification is a result_text contains predicate with the record term as written by the user. Season totals such as home_runs, hits or wins are statistical metrics, not predicates of an individual play. Do not translate a requested play classification into a season-metric comparison.',
  'For a single year use years=[year] and null year_from/year_to. For a continuous range use years=[] and range bounds. Resolve relative dates against the supplied Japan date, retaining their relative description.',
  'For an entire NPB career use temporal_scope.relative="career" and no date/year bounds. A current-season request must resolve to the current Japan year. Never leave a stated relative period unresolved or replace a season request with a career total.',
  'For an exact date use equal date_from/date_to. A continuous date range uses its actual bounds. Do not silently replace a date range with one date.',
  'Season and career totals are batting_statistics or pitching_statistics; individual game/appearance lines are batting_records or pitching_records. Requests for both require both outputs.',
  'A basic player introduction requests player_information (official identity and registration/profile facts). It does not request career batting/pitching totals. Add statistic outputs only when the user actually requests those statistics.',
  'An unspecified player-statistic season follows the existing product default of the current NPB season; keep the actual request unspecified in the contract. Do not invent a league, competition, role, current team or last N games.',
  'List/all requests use completeness all with null limit. Top N uses top_n with N. Only explicitly requested ordering/grouping goes in ordering/grouping.',
  'Names, dates, competition and output conditions that cannot be represented unambiguously must remain visible in unresolved_constraints. Do not discard them to make execution possible.',
  'Use policy clarify for missing conversation anchors or necessary missing years; do not use clarify merely because a player mention may identify multiple people. A named player and a known output such as season statistics is executable without a year or team. Identity ambiguity is never insufficient_context.',
  'A clarification MUST still provide query_contract with the known output, every known entity, and the specific missing constraints in unresolved_constraints. Do not omit a recognizable player mention from that contract. All identity-only uncertainty goes to policy execute.',
  'Use news/realtime/prediction for unsupported news, live status or predictions; capabilities for questions about available functionality; staff_information for manager/coaching information; outside_npb for non-NPB topics. Only these unsupported policies have a null query_contract.',
  'For policy clarify use clarification_reason. subject is an optional literal phrase copied from the user message, never a generated fact. For execution query_contract must be present and domain npb.',
].join('\n')

export function createSemanticQueryLlm(config: ChatQueryLlmConfig, dependencies: { fetch?: typeof fetch; timeoutMs?: number; onRequest?: () => void; onParsed?: (request: SemanticRequest) => void; onReview?: (review: { attempt: number; issues: string[] }) => void } = {}) {
  const fetchFn = dependencies.fetch ?? fetch
  return async (message: string, context: ChatQueryParserContext = {}): Promise<SemanticRequest> => {
    const signal = AbortSignal.timeout(dependencies.timeoutMs ?? 15_000)
    const currentDate = japanDate()
    let feedback: string | undefined
    for (let attempt = 0; attempt < 2; attempt++) {
      dependencies.onRequest?.()
      const response = await fetchFn(`${config.baseUrl.replace(/\/$/u, '')}/chat/completions`, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, temperature: 0, max_completion_tokens: 2500,
          response_format: { type: 'json_schema', json_schema: { name: 'npb_semantic_request', strict: true, schema: {
            type: 'object', additionalProperties: false,
            properties: {
              domain: { type: 'string', enum: ['npb', 'non_npb', 'undetermined'] },
              query_contract: { anyOf: [queryContractJsonSchema, { type: 'null' }] },
              policy: { type: 'string', enum: policies },
              clarification_reason: { type: ['string', 'null'], enum: [...reasons, null] },
              subject: { type: ['string', 'null'] },
            }, required: ['domain', 'query_contract', 'policy', 'clarification_reason', 'subject'],
          } } },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify({ current_date_jst: currentDate, history: context.history ?? [], message }) },
            ...(feedback ? [{ role: 'user', content: `The prior output failed schema or semantic alignment validation: ${feedback}. Preserve the meaning of the original question and history; correct the representation and policy without inventing facts.` }] : []),
          ],
        }),
      }).catch((error) => { throw new ChatQueryParserUnavailableError(`Semantic parsing unavailable: ${String(error)}`) })
      if (!response.ok) throw new ChatQueryParserUnavailableError(`Semantic parser upstream HTTP ${response.status}`)
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
      try {
        const parsed = semanticRequestSchema.parse(JSON.parse(payload.choices?.[0]?.message?.content ?? ''))
        if (parsed.policy === 'execute' && (parsed.domain !== 'npb' || !parsed.query_contract)) throw new Error('Execution requires an NPB semantic contract')
        if (parsed.query_contract?.requested_output.some((output) => output.kind === 'event_records')) {
          const eventFields = new Set(['result_text', 'inning', 'half', 'event_type', 'event_subtype', 'outs', 'balls', 'strikes', 'score_difference'])
          const incompatible = parsed.query_contract.predicates.filter((predicate) => !eventFields.has(predicate.field))
          if (incompatible.length) throw new Error(`An individual play has no statistical-total predicate ${incompatible.map((predicate) => predicate.field).join(', ')}. Preserve the requested play classification as result_text contains, using the user's record term. Preserve all other explicit conditions.`)
        }
        if (parsed.policy === 'clarify' && !parsed.clarification_reason) throw new Error('Clarification requires a reason')
        if (parsed.policy === 'clarify' && !parsed.query_contract?.unresolved_constraints.length) throw new Error('Clarification requires a semantic contract preserving known entities and output, with specific missing constraints. A named-player statistics request is executable; missing year/team and surname ambiguity are handled by product defaults and the official identity resolver.')
        if (parsed.subject && ![message, ...(context.history ?? []).map((item) => item.content)].some((text) => text.includes(parsed.subject!))) throw new Error('Subject must be copied from the conversation')
        const alignmentIssues = await verifySemanticAlignment(config, { message, context, candidate: parsed, currentDate,
          fetch: fetchFn, signal, onRequest: dependencies.onRequest })
        dependencies.onReview?.({ attempt: attempt + 1, issues: alignmentIssues })
        if (alignmentIssues.length) throw new Error(`Meaning does not match the question: ${alignmentIssues.join('; ')}`)
        dependencies.onParsed?.(parsed)
        return parsed
      } catch (error) {
        if (error instanceof ChatQueryParserUnavailableError) throw error
        feedback = String(error).slice(0, 1200)
      }
    }
    throw new ChatQueryParserUnavailableError(`Invalid semantic output: ${feedback}`)
  }
}

function japanDate(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
