import { queryContractJsonSchema, queryContractSchema, z } from '@npb/schemas'
import type { ChatQueryLlmConfig } from './chat-query-llm'
import { ChatQueryParserUnavailableError } from './chat-query-parser'
import type { ChatQueryParserContext } from './chat-query-parser-prompt'
import { verifySemanticAlignment } from './chat-semantic-alignment'
import { allStatisticMetrics } from './chat-statistic-metrics'
import { teamMentionCandidates } from '@npb/db'
import { competitionLeague } from './chat-competition-scope'

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
  'Entities identify named people, named clubs/leagues and named venues. Counts, universal quantifiers and output/group labels are not named entities. An all-club request leaves club entities empty and groups by team; an all-player request leaves player entities empty and groups by player.',
  'A league-scoped individual leaderboard requests batting_statistics/pitching_statistics, groups by player, and orders the requested metric. The named league is a scope constraint (competition_scope.competitions or kind team, since this schema has no league entity kind), not the statistic subject. Do not group by team or use team_statistics merely because a named league or club restricts the eligible players.',
  'Distinguish eligibility from opposition: a league whose players are ranked is a subject membership scope (team role subject or competition_scope), never team role opponent. Opponent means the teams faced in the recorded games and requires an explicit against/opposition condition in the question. Do not invent an opponent from a possessive league restriction.',
  'Club-level statistics must group by team. Do not substitute a list of individual players for club totals or club rates. Club batting average is the club hit total divided by the club at-bat total, not a mean of player averages.',
  'A club season record (wins, losses, draws, win rate, league rank or a standings table) requests team_statistics. Club wins are not the pitching wins of individual players. Use fields wins/losses/draws/win_rate/rank/games as requested, or empty fields for an unspecified club season record. A standings table groups by team and orders rank ascending. Completed per-game results remain game_results; never use them as a substitute for annual club records.',
  'A head-to-head record requests game_results with fields wins, losses, draws and aggregation count on games. Keep the subject club and opponent club distinct, with the full requested date bounds. A list of individual scores alone does not answer a head-to-head win/loss aggregate.',
  'Future fixture dates and next scheduled starts request game_schedule, never game_results or past pitching_records. Retain the requested clubs/players and future period. For a mixed past-record and future-schedule question preserve both outputs with their separate complete scopes: only the past operand carries its win/loss aggregation; only the future operand carries its future date bounds and date ordering. The archive can answer the past part and explain the schedule limitation separately. Use policy execute for this composition, not a single realtime refusal that discards the past request.',
  'For individual plays assign the stated actor role: batter for a player hitting, pitcher for a player pitching, runner for a player running. subject means participation in any role and must not replace a stated action role.',
  'Only explicit constraints and conditions actually inherited from history belong in the contract. An unspecified level is unspecified, NOT both. Use both only when the user explicitly requests both first-team and farm records.',
  'Each requested_output has optional scope. Emit scope=null when every output shares the root scope. When players have different club conditions, or periods/subjects must be compared separately, emit one output per operand with its own complete semantic scope (entities, temporal_scope, competition_scope, predicates, aggregation, grouping, ordering, completeness, context_references, unresolved_constraints). Do not combine unrelated clubs into a shared filter or sum comparison years into one total. Keep the root scope as the overall request and retain each local scope exactly. At most eight independently scoped outputs are executable.',
  'For a comparison of discrete seasons, each operand has one requested year. A single output with several years and no year grouping would sum the years and is not a comparison. Do not use it. Scope=null is required when a lone output merely repeats the root scope.',
  'A stated player, club and year are complete semantic conditions even before official membership is checked. Do not create unresolved_constraints asking to verify a stated membership or identity: those are mandatory downstream evidence checks, not missing user conditions. Do not repeat entity conditions in predicates, including inside output scopes.',
  'An execute contract must have unresolved_constraints=[] at the root and in every output scope. If a genuine semantic condition cannot be represented, preserve it under policy clarify instead of execute. A comparison of (Player A, Club A, Year A) with (Player B, Club B, Year B) is fully specified: output A has exactly the first tuple and output B exactly the second tuple, predicates=[], unresolved_constraints=[]. No baseball knowledge or membership confirmation is needed to represent those literal tuples.',
  'Do not repeat entities or temporal constraints in predicates. Predicates describe additional requested conditions. A text condition uses field result_text and operator contains. Do not add an implicit event_type predicate.',
  'A list of events requires fields gameDate, opponent, gameId, sourceUrl. Add other required fields only when explicitly requested. An unspecified ordering is an empty array.',
  'Event records describe individual plays. Their play classification is a result_text contains predicate with the record term as written by the user. Season totals such as home_runs, hits or wins are statistical metrics, not predicates of an individual play. Do not translate a requested play classification into a season-metric comparison.',
  'For a single year use years=[year] and null year_from/year_to. For a continuous range use years=[] and range bounds. Resolve relative dates against the supplied Japan date, retaining their relative description.',
  'For an entire NPB career use temporal_scope.relative="career" and no date/year bounds. A current-season request must resolve to the current Japan year. Never leave a stated relative period unresolved or replace a season request with a career total.',
  'Relative periods use the canonical enum supplied by the schema: current_season/previous_season for seasons, recent_appearances/latest_appearance for appearance-relative requests, and the calendar tokens for calendar-relative requests. Calendar tokens must also carry resolved date bounds. Do not emit an unstructured description instead of one of these tokens.',
  'For next_week use the Monday through Sunday of the week after the week containing current_date_jst, not the current week. For next_month use the first through last day of the following calendar month. Retain these tokens and the resolved bounds on schedule requests.',
  'For an exact date use equal date_from/date_to. A continuous date range uses its actual bounds. Do not silently replace a date range with one date.',
  'A calendar month or month/day without an explicit year uses the current NPB season (the year of current_date_jst), unless the conversation establishes another target year. Inherit that established year for a follow-up and record its temporal context reference. Resolve the full requested date range; never ask for a year solely because it was omitted. Preserve both clubs and any other conditions for a month-scoped matchup.',
  'Season and career totals are batting_statistics or pitching_statistics; individual game/appearance lines are batting_records or pitching_records. Requests for both require both outputs.',
  `Use the shared logical metric vocabulary for statistical fields. Batting: ${allStatisticMetrics('batting').map((metric) => metric.field).join(', ')}. Pitching: ${allStatisticMetrics('pitching').map((metric) => metric.field).join(', ')}. If a requested measure is unsupported, preserve it in unresolved_constraints instead of omitting it or substituting a default measure.`,
  'Recorded recent form or condition is executable historical performance, not news: request batting_records or pitching_records with relative recent_appearances. A singular latest/last appearance uses latest_appearance. Preserve an explicit last N in completeness bounded/limit=N; without an explicit N leave completeness unspecified/limit=null so the product default can be applied. Never fabricate calendar bounds or a current season for appearance-relative requests. A comparison preserves every player, each with the same appearance window.',
  'An opposing starting pitcher requested for a selected pitching appearance is the field opponentStarter on that pitching_records output. It is not another pitching_records output for the subject, not an opponent-team field, and not a conversation reference when its anchor is in this same question.',
  'When a recent-form/performance question does not specify batting or pitching, use appearance_records, not both batting_records and pitching_records. Do not choose a domain from knowledge of a player name: official position evidence selects the record domain after identity resolution. Explicit batting or pitching requests use the concrete corresponding record kind; both are requested only when both domains were actually asked for.',
  'A basic player introduction requests player_information (official identity and registration/profile facts). It does not request career batting/pitching totals. Add statistic outputs only when the user actually requests those statistics.',
  'Managers and coaches are staff, not players. A staff question uses policy staff_information with a null contract, or requested_output kind staff_information when composing it with other requested outputs. Never represent staff as player_information with a manager/coach field or a position/name predicate: the player dictionary contains no staff information. Keep supported player or team statistics as separate outputs in a mixed question.',
  'An unspecified player-statistic season follows the existing product default of the current NPB season; keep the actual request unspecified in the contract. Do not invent a league, competition, role, current team or last N games.',
  'List/all requests use completeness all with null limit. Top N uses top_n with N. Only explicitly requested ordering/grouping goes in ordering/grouping.',
  'Names, dates, competition and output conditions that cannot be represented unambiguously must remain visible in unresolved_constraints. Do not discard them to make execution possible.',
  'Use policy clarify for missing conversation anchors or necessary missing years; do not use clarify merely because a player mention may identify multiple people. A named player and a known output such as season statistics is executable without a year or team. Identity ambiguity is never insufficient_context.',
  'A clarification MUST still provide query_contract with the known output, every known entity, and the specific missing constraints in unresolved_constraints. Do not omit a recognizable player mention from that contract. All identity-only uncertainty goes to policy execute.',
  'When a pronoun or relative game reference has no usable conversation antecedent, leave that unknown entity or date absent and explicitly identify the missing anchor in unresolved_constraints. A prior answer reporting no matching game does not establish its starting pitcher. Never invent a player, club or calendar interval to make that follow-up executable.',
  'Use news/realtime/prediction for unsupported news, live status or predictions; capabilities for questions about available functionality; staff_information for manager/coaching information; outside_npb for non-NPB topics. Only these unsupported policies have a null query_contract.',
  'For policy clarify use clarification_reason. subject is an optional literal phrase copied from the user message, never a generated fact. For execution query_contract must be present and domain npb.',
].join('\n')

export function createSemanticQueryLlm(config: ChatQueryLlmConfig, dependencies: { fetch?: typeof fetch; timeoutMs?: number; onRequest?: () => void; onParsed?: (request: SemanticRequest) => void; onReview?: (review: { attempt: number; issues: string[] }) => void } = {}) {
  const fetchFn = dependencies.fetch ?? fetch
  return async (message: string, context: ChatQueryParserContext = {}): Promise<SemanticRequest> => {
    const signal = AbortSignal.timeout(dependencies.timeoutMs ?? 15_000)
    const currentDate = japanDate()
    let feedback: string | undefined
    let previousCandidate: SemanticRequest | undefined
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
            ...(feedback && previousCandidate ? [{ role: 'assistant', content: JSON.stringify(previousCandidate) }] : []),
            ...(feedback ? [{ role: 'user', content: `The prior output failed schema or semantic alignment validation: ${feedback}. Correct the identified mismatches against the original question and history. Preserve unaffected output fields, entities and constraints from the prior candidate; do not replace a specific requested metric with empty/default fields or invent facts.` }] : []),
          ],
        }),
      }).catch((error) => { throw new ChatQueryParserUnavailableError(`Semantic parsing unavailable: ${String(error)}`) })
      if (!response.ok) throw new ChatQueryParserUnavailableError(`Semantic parser upstream HTTP ${response.status}`)
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
      try {
        const parsed = semanticRequestSchema.parse(JSON.parse(payload.choices?.[0]?.message?.content ?? ''))
        previousCandidate = parsed
        if (parsed.policy === 'execute' && (parsed.domain !== 'npb' || !parsed.query_contract)) throw new Error('Execution requires an NPB semantic contract')
        const operands = parsed.query_contract?.requested_output.map((output) => ({ output, scope: output.scope ?? parsed.query_contract! })) ?? []
        if (parsed.policy === 'execute' && ((parsed.query_contract?.unresolved_constraints.length ?? 0) > 0 || operands.some(({ scope }) => scope.unresolved_constraints.length > 0))) {
          throw new Error('Execution cannot retain unresolved semantic conditions. Explicit player/club/year tuples are complete search constraints; official identity and membership checks happen downstream and must not be invented as semantic blockers. Preserve genuinely unrepresentable conditions under clarification, never silently erase them.')
        }
        const entities = [...(parsed.query_contract?.entities ?? []), ...operands.flatMap(({ scope }) => scope.entities)]
        const clubPlayers = entities.filter((entity) => entity.kind === 'player' &&
          (competitionLeague(entity.mention) || teamMentionCandidates(entity.mention).length > 0))
        if (clubPlayers.length) throw new Error(`The official club/league catalog identifies these mentions as clubs or leagues, not players: ${clubPlayers.map((entity) => entity.mention).join(', ')}. Preserve the literal mention as kind team or the corresponding competition constraint. Do not pass it to player identity resolution.`)
        if (operands.some(({ output, scope }) => output.kind === 'pitching_statistics' &&
          !scope.entities.some((entity) => entity.kind === 'player') && scope.entities.some((entity) => entity.kind === 'team') &&
          !scope.grouping.includes('player'))) throw new Error('Distinguish the statistic subject: club season wins/losses/rank require team_statistics; a ranking of individual pitchers requires grouping by player. Preserve the requested subject instead of substituting individual pitcher rows for a club record.')
        const compact = (text: string) => text.normalize('NFKC').replace(/\s+/gu, '')
        const conversation = [message, ...(context.history ?? []).map((item) => item.content)].map(compact)
        const ungrounded = entities.filter((entity) => !conversation.some((text) => text.includes(compact(entity.mention))))
        if (ungrounded.length) throw new Error(`Entity mentions must be literal name spans from the question or history, without invented characters, punctuation, expanded names or annotations: ${ungrounded.map((entity) => entity.mention).join(', ')}. Universal/count phrases belong to scope and grouping, not named entities.`)
        if (operands.some(({ output }) => output.kind === 'event_records')) {
          const eventFields = new Set(['result_text', 'inning', 'half', 'event_type', 'event_subtype', 'outs', 'balls', 'strikes', 'score_difference'])
          const incompatible = operands.filter(({ output }) => output.kind === 'event_records').flatMap(({ scope }) => scope.predicates).filter((predicate) => !eventFields.has(predicate.field))
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
