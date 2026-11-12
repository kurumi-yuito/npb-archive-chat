import { queryContractJsonSchema, queryContractSchema, z } from '@npb/schemas'
import { chatCompletionModelParameters, type ChatQueryLlmConfig } from './chat-query-llm'
import { ChatQueryParserUnavailableError } from './chat-query-parser'
import type { ChatQueryParserContext } from './chat-query-parser-prompt'
import { verifySemanticAlignment } from './chat-semantic-alignment'
import { extractSemanticFacts, isArchiveDomainMention, type SemanticFacts } from './chat-semantic-facts'
import { allStatisticMetrics } from './chat-statistic-metrics'
import { teamMentionCandidates } from '@npb/db'
import { competitionLeague } from './chat-competition-scope'
import { isPlayerExclusion } from './chat-statistic-predicates'
import { semanticUpstreamError } from './chat-semantic-upstream-error'

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
  'A club’s rank within a named league uses that club as subject and the league as competition_scope. The league is a membership scope, not an opposing club. Keep an actual head-to-head request as game_results rather than whole-season team_statistics.',
  'Explicit club totals or club rates group by team. Do not substitute individual players for those totals/rates. Club batting average is total hits divided by total at-bats, not a mean of player averages. A club’s batting/pitching player statistics without an explicit team-total/rate request instead uses batting_statistics/pitching_statistics grouped by player with that club as membership scope; do not substitute whole-club wins/losses for its pitcher statistics.',
  'When the user delegates selection of a balanced batter using batting average, on-base percentage and slugging, preserve all three requested fields and use OPS descending as the transparent combined comparison measure. Include ops in the displayed fields; do not invent a missing-context clarification just because the user delegated the selection rule. An explicitly specified evaluation formula takes precedence.',
  'A club season record (wins, losses, draws, win rate, league rank or a standings table) requests team_statistics. Club wins are not the pitching wins of individual players. Use fields wins/losses/draws/win_rate/rank/games as requested, or empty fields for an unspecified club season record. A standings table groups by team and orders rank ascending. Completed per-game results remain game_results; never use them as a substitute for annual club records.',
  'A question asking why performance or standings changed requests causal_explanation. This output preserves the request for reasons; the archive will explain that results alone cannot establish causes. When the question also specifies a factual comparison, preserve separate statistical operands for each requested club/player/period alongside causal_explanation. Do not omit the causal request, encode it as an unresolved statistical predicate, assert that the alleged change happened, or replace the entire comparison with a refusal.',
  'Only an explicit request for reasons, causes or explanatory analysis requires causal_explanation. Asking whether a number is higher/lower, more/fewer, better/worse, or how two values compare is a quantitative comparison, not a request for causes. Represent it with the statistic operands alone; do not add causal_explanation or a causal refusal simply because the values or periods differ.',
  'A request for the result of one dated game needs per-game score/result fields. Do not replace it with wins/losses/draws fields, which request an aggregate record across a set of games. Aggregate win/loss fields require an actual win/loss-total request.',
  'A head-to-head record requests game_results with fields wins, losses, draws and aggregation count on games. Keep the subject club and opponent club distinct, with the full requested date bounds. A list of individual scores alone does not answer a head-to-head win/loss aggregate.',
  'A recent club win/loss record uses game_results with wins and losses, the named club as subject, and recent_appearances. Preserve an explicit game count as the window. Do not substitute whole-season totals or individual player appearances.',
  'The overall winner or final outcome of a championship series requests series_result (fields winner/loser/wins/losses/draws as needed), one official outcome per year, with the series name in competition_scope. Do not substitute individual game winners, count games to determine a champion, or encode a championship series as a regular league season. Do not insert the eventual winner as an entity: it is the unknown requested result. An ordinary regular-season three-game card remains game_results; regular-season club standings remain team_statistics. A list of historical champions groups by year and may order by year. Preserve any explicitly requested team, player or unsupported restriction rather than silently dropping it.',
  'Future fixture dates and next scheduled starts request game_schedule, never game_results or past pitching_records. Retain the requested clubs/players and future period. For a mixed past-record and future-schedule question preserve both outputs with their separate complete scopes: only the past operand carries its win/loss aggregation; only the future operand carries its future date bounds and date ordering. The archive can answer the past part and explain the schedule limitation separately. Use policy execute for this composition, not a single realtime refusal that discards the past request.',
  'For individual plays assign the stated actor role: batter for a player hitting, pitcher for a player pitching, runner for a player running. subject means participation in any role and must not replace a stated action role.',
  'An actual direct matchup between two named players requests event_records and predicate relationship eq direct_matchup. Preserve explicitly stated batter/pitcher roles and each associated club (team role batter/pitcher); otherwise leave the two player roles as subject. The executor checks both possible batting/pitching directions without inferring roles from names. Opposing-team participation or being mentioned in the same game is not evidence of a direct at-bat. Do not replace the pair with game_results.',
  'Only explicit constraints and conditions actually inherited from history belong in the contract. An unspecified level is unspecified, NOT both. Use both only when the user explicitly requests both first-team and farm records.',
  'Separate requested operands from background assertions. A third player or dated game mentioned only as background does not become another matchup operand or restrict the requested career matchup to that date. Retain such literal context in context_references when relevant, rather than adding it to the executable entities/date filters. Apply it as a filter only when the user actually links the requested lookup to that game.',
  'NPB, 日本プロ野球 and プロ野球 identify the archive domain, not an extra named league or competition filter. Preserve domain=npb with competitions=[] unless an actual league, series or game competition is specified. Do not create team entities for the archive domain name.',
  'A request for a full/detailed statistical line, even when it names example metrics followed by など, asks for the complete supported metric set rather than just those examples. Use all supported fields for that statistic domain. An exact request for only named measures remains restricted to those measures.',
  'Batting-order, fielding-position and starting-lineup usage are recorded appearance conditions, not player-profile positions. A latest dated batting-line query for an unnamed player in a club can use batting_records with latest_appearance and the stated battingOrder/position conditions. A count or leaderboard of uses by player is batting_statistics with games and the same conditions, not a list of batting_records or generic appearance_records.',
  'A maximum or top-N request ranks the counting statistic without adding a positive-count threshold. A ranking alone can include zero values. A population explicitly restricted to players with at least one occurrence requires that statistic > 0, independently of displaying the measure. Combine an actual eligibility restriction with a named-player exclusion using AND. Explicit zero/at-least/at-most conditions retain their stated operators and values. Distinguish a ranking by a measure from a list restricted to people who recorded a nonzero measure.',
  'A named subject’s statistic count is an output measure and may legitimately be zero. Asking how many of that statistic the subject recorded does not impose a positive-count eligibility predicate. Use predicates=[] unless the user actually restricts the eligible population or explicitly states a numeric threshold. Preserve this distinction in follow-ups and comparisons as well.',
  'A follow-up asking for other players in the same club excludes the previously identified player. Preserve that named exclusion as a predicate with field player_name, operator ne, and the literal player name from history. A positive statistic condition alone does not preserve other/except. Keep the club and established evidence season. The excluded player will be resolved to an official ID before filtering; never invent an ID.',
  'Resolve follow-up ellipsis from the statistic actually displayed in the preceding answer. If the requested current season was unavailable and a verified earlier season was explicitly displayed as supplemental evidence, an unqualified comparison to last year compares that displayed evidence season with its preceding season. A substitution such as then Club B Player B keeps that displayed measure and season unless the user specifies a new one. Preserve each player-to-club association from the conversation in its own complete output scope, including a later comparison of those players. Do not attach both clubs to a shared player filter or forget an explicit club in the latest user turn. Explicitly repeated current-season or calendar conditions always take precedence.',
  'Each requested_output has optional scope. Emit scope=null when every output shares the root scope. When players have different club conditions, or periods/subjects must be compared separately, emit one output per operand with its own complete semantic scope (entities, temporal_scope, competition_scope, predicates, aggregation, grouping, ordering, completeness, context_references, unresolved_constraints). Do not combine unrelated clubs into a shared filter or sum comparison years into one total. Keep the root scope as the overall request and retain each local scope exactly. At most eight independently scoped outputs are executable.',
  'For a comparison of discrete seasons, each operand has one requested year. A single output with several years and no year grouping would sum the years and is not a comparison. Do not use it. Scope=null is required when a lone output merely repeats the root scope.',
  'A stated player, club and year are complete semantic conditions even before official membership is checked. Do not create unresolved_constraints asking to verify a stated membership or identity: those are mandatory downstream evidence checks, not missing user conditions. Do not repeat entity conditions in predicates, including inside output scopes.',
  'An execute contract must have unresolved_constraints=[] at the root and in every output scope. If a genuine semantic condition cannot be represented, preserve it under policy clarify instead of execute. A comparison of (Player A, Club A, Year A) with (Player B, Club B, Year B) is fully specified: output A has exactly the first tuple and output B exactly the second tuple, predicates=[], unresolved_constraints=[]. No baseball knowledge or membership confirmation is needed to represent those literal tuples.',
  'Do not repeat entities or temporal constraints in predicates. Predicates describe additional requested conditions. A text condition uses field result_text and operator contains. Do not add an implicit event_type predicate.',
  'An explicitly requested foreign-player registration restriction is predicate player_category eq 外国人. Preserve it under execute rather than guessing eligibility from a name or birthplace. The archive reports when official registration-category evidence is unavailable; do not silently remove the restriction or replace it with all players.',
  'A list of events requires fields gameDate, opponent, gameId, sourceUrl. Add other required fields only when explicitly requested. An unspecified ordering is an empty array.',
  'Event records describe individual plays. Their play classification is a result_text contains predicate with the record term as written by the user. Season totals such as home_runs, hits or wins are statistical metrics, not predicates of an individual play. Do not translate a requested play classification into a season-metric comparison.',
  'For a single year use years=[year] and null year_from/year_to. For a continuous range use years=[] and range bounds. Resolve relative dates against the supplied Japan date, retaining their relative description.',
  'For an entire NPB career use temporal_scope.relative="career" and no date/year bounds. A current-season request must resolve to the current Japan year. Never leave a stated relative period unresolved or replace a season request with a career total.',
  'Relative periods use the canonical enum supplied by the schema: current_season/previous_season for seasons, recent_appearances/latest_appearance for appearance-relative requests, and the calendar tokens for calendar-relative requests. Calendar tokens must also carry resolved date bounds. Do not emit an unstructured description instead of one of these tokens.',
  'For next_week use the Monday through Sunday of the week after the week containing current_date_jst, not the current week. For next_month use the first through last day of the following calendar month. Retain these tokens and the resolved bounds on schedule requests.',
  'For an exact date use equal date_from/date_to. A continuous date range uses its actual bounds. Do not silently replace a date range with one date.',
  'For an affiliation question, an unqualified current/now asks for the current NPB season affiliation: use the current year and current_season, not a single game date. The answer distinguishes annual registration evidence from a verified current contract. Preserve an explicitly specified calendar date or contract/live-status request; do not silently convert those to annual evidence.',
  'A last-year comparison alone does not request the same calendar cutoff. When the preceding answer displayed a whole-season value, compare the displayed season with its preceding whole season. Add corresponding date bounds only for an explicit same-point request or a genuinely bounded period established in history.',
  'A calendar month or month/day without an explicit year uses the current NPB season (the year of current_date_jst), unless the conversation establishes another target year. Inherit that established year for a follow-up and record its temporal context reference. Resolve the full requested date range; never ask for a year solely because it was omitted. Preserve both clubs and any other conditions for a month-scoped matchup.',
  'Season and career totals are batting_statistics or pitching_statistics; individual game/appearance lines are batting_records or pitching_records. Requests for both require both outputs.',
  'A requested 得点圏打率 is batting_statistics with field battingAverageWithRunnersInScoringPosition, preserving the requested ranking and limit under policy execute. It is a supported semantic request even though the archive cannot compute that situational metric; the answer will explicitly distinguish its ordinary-average alternative. Do not add missing-context constraints or silently replace the requested metric while extracting.',
  'For a generic player season/career 成績 request with no batting/pitching measure, use player_statistics with empty fields. Do not substitute both batting_statistics and pitching_statistics, invent a metric, or infer a domain from the player name. Official identity resolution occurs first; official position/annual evidence then selects the statistic domain. Explicit requests for both retain both concrete outputs. Generic recent form uses appearance_records.',
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
  'When no output type can be identified because a complaint/pronoun has no usable history, use policy clarify and requested_output=[{kind:unresolved_request,fields:[]}]. This placeholder records the missing request without inventing game_details or player records. Retain known output types whenever the question actually names one. unresolved_request never executes.',
  'In a clarification, requested_output still describes what the latest user requested, including the requested participant roles and fields. An unavailable reference prevents resolving that request; it does not change the requested output into the previous answer’s output kind.',
  'A comparison at the same point of different years preserves one explicit calendar end-date cutoff per year, resolved from current_date_jst or the reference period in history. Use independently scoped outputs when needed. Keep those calendar cutoffs even after a season has ended; complete-season coverage is checked downstream.',
  'For cumulative season statistics, a same-point comparison uses each calendar year start through its corresponding cutoff. A month-only range does not preserve cumulative season wins or other season-to-date measures. independent_semantics contains constraints extracted separately without seeing a candidate; retain those constraints while constructing the complete contract.',
  'If a prior answer verifies that a requested fixture does not exist, the fixture date and both club mentions remain known. A follow-up about that fixture uses policy clarify with those same team entities and exact date, preserving the missing valid game as unresolved. Do not move the clubs into an opponent predicate or describe the conversation itself as unavailable. If a subsequent player reference has no identified antecedent, preserve the requested statistic output and mark the player reference unresolved without inventing a name.',
  'When a pronoun or relative game reference has no usable conversation antecedent, leave that unknown entity or date absent and explicitly identify the missing anchor in unresolved_constraints. A prior answer reporting no matching game does not establish its starting pitcher. Never invent a player, club or calendar interval to make that follow-up executable.',
  'Use news/realtime/prediction for unsupported news, live status or predictions; capabilities for questions about available functionality; staff_information for manager/coaching information; outside_npb for non-NPB topics. Only these unsupported policies have a null query_contract.',
  'For policy clarify use clarification_reason. For execute and clarify set subject=null; known subjects belong in query_contract.entities. For unsupported-topic policies subject is a literal topic span, never a generated fact. For execution query_contract must be present and domain npb.',
  'For outside_npb, subject is required: copy the literal external topic or competition name from the question/history so the capability answer identifies what is unsupported. Do not leave the topic as an unnamed generic field and do not classify a requested NPB historical operand as outside merely because another operand is external.',
].join('\n')

export function createSemanticQueryLlm(config: ChatQueryLlmConfig, dependencies: { fetch?: typeof fetch; timeoutMs?: number; onRequest?: () => void; onParsed?: (request: SemanticRequest) => void; onReview?: (review: { attempt: number; issues: string[]; candidate: SemanticRequest; facts: SemanticFacts }) => void } = {}) {
  const fetchFn = dependencies.fetch ?? fetch
  return async (message: string, context: ChatQueryParserContext = {}): Promise<SemanticRequest> => {
    // The bounded parse/review attempts share one request deadline.
    const signal = AbortSignal.timeout(dependencies.timeoutMs ?? 30_000)
    const currentDate = japanDate()
    const facts = await extractSemanticFacts(config, { message, context, currentDate,
      fetch: fetchFn, signal, onRequest: dependencies.onRequest })
    let feedback: string | undefined
    let previousCandidate: SemanticRequest | undefined
    for (let attempt = 0; attempt < 2; attempt++) {
      dependencies.onRequest?.()
      const response = await fetchFn(`${config.baseUrl.replace(/\/$/u, '')}/chat/completions`, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ ...chatCompletionModelParameters(config), max_completion_tokens: 2500,
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
            { role: 'user', content: JSON.stringify({ current_date_jst: currentDate, history: context.history ?? [], message, independent_semantics: facts }) },
            ...(feedback && previousCandidate ? [{ role: 'assistant', content: JSON.stringify(previousCandidate) }] : []),
            ...(feedback ? [{ role: 'user', content: `The prior output failed schema or semantic alignment validation: ${feedback}. Correct the identified mismatches against the original question and history. Preserve unaffected output fields, entities and constraints from the prior candidate; do not replace a specific requested metric with empty/default fields or invent facts.` }] : []),
          ],
        }),
      }).catch((error) => { throw new ChatQueryParserUnavailableError(`Semantic parsing unavailable: ${String(error)}`) })
      if (!response.ok) throw await semanticUpstreamError(response, 'parser')
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
      try {
        const parsed = semanticRequestSchema.parse(JSON.parse(payload.choices?.[0]?.message?.content ?? ''))
        if (parsed.policy === 'execute' || parsed.policy === 'clarify') parsed.subject = null
        previousCandidate = parsed
        if (parsed.policy === 'execute' && (parsed.domain !== 'npb' || !parsed.query_contract)) throw new Error('Execution requires an NPB semantic contract')
        const operands = parsed.query_contract?.requested_output.map((output) => ({ output, scope: output.scope ?? parsed.query_contract! })) ?? []
        if (operands.some(({ output, scope }) => output.kind === 'team_statistics' && scope.entities.some((entity) => entity.kind === 'team' && entity.role === 'opponent' && competitionLeague(entity.mention)))) {
          throw new Error('A club season rank within a league uses the league as a membership scope, not an opponent. Preserve the named club as subject and the league in competition_scope. An actual head-to-head result requires game_results.')
        }
        if (parsed.policy === 'execute' && ((parsed.query_contract?.unresolved_constraints.length ?? 0) > 0 || operands.some(({ scope }) => scope.unresolved_constraints.length > 0))) {
          throw new Error('Execution cannot retain unresolved semantic conditions. Explicit player/club/year tuples are complete search constraints; official identity and membership checks happen downstream and must not be invented as semantic blockers. Preserve genuinely unrepresentable conditions under clarification, never silently erase them.')
        }
        if (operands.some(({ output, scope }) => ['batting_statistics', 'pitching_statistics'].includes(output.kind) &&
          scope.entities.filter((entity) => entity.kind === 'player').length > 1 &&
          scope.entities.filter((entity) => entity.kind === 'team' && entity.role === 'subject').length > 1)) {
          throw new Error('A shared statistic scope cannot preserve multiple player-to-club associations. Represent each explicitly paired player and club in its own complete output scope, retaining its established year and metric. Do not apply the first club to all players or remove a club to bypass this requirement.')
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
        if (operands.some(({ scope }) => scope.competition_scope.competitions.some(isArchiveDomainMention) ||
          scope.entities.some((entity) => entity.kind === 'team' && isArchiveDomainMention(entity.mention)))) {
          throw new Error('The archive domain name belongs to domain=npb, not an extra competition filter or a named team. Preserve actual club, league and competition conditions separately.')
        }
        const ungrounded = entities.filter((entity) => !conversation.some((text) => text.includes(compact(entity.mention))))
        if (ungrounded.length) throw new Error(`Entity mentions must be literal name spans from the question or history, without invented characters, punctuation, expanded names or annotations: ${ungrounded.map((entity) => entity.mention).join(', ')}. Universal/count phrases belong to scope and grouping, not named entities.`)
        if (operands.some(({ scope }) => scope.predicates.some((predicate) => isPlayerExclusion(predicate) &&
          !conversation.some((text) => text.includes(compact(String(predicate.value))))))) throw new Error('Excluded player names must be literal spans from the question or conversation history.')
        if (operands.some(({ output }) => output.kind === 'event_records')) {
          const eventFields = new Set(['result_text', 'inning', 'half', 'event_type', 'event_subtype', 'outs', 'balls', 'strikes', 'score_difference'])
          const incompatible = operands.filter(({ output }) => output.kind === 'event_records').flatMap(({ scope }) => scope.predicates).filter((predicate) => !eventFields.has(predicate.field))
          if (incompatible.length) throw new Error(`An individual play has no statistical-total predicate ${incompatible.map((predicate) => predicate.field).join(', ')}. Preserve the requested play classification as result_text contains, using the user's record term. Preserve all other explicit conditions.`)
        }
        if (parsed.policy === 'clarify' && !parsed.clarification_reason) throw new Error('Clarification requires a reason')
        if (parsed.policy === 'clarify' && operands.some(({ scope }) => scope.predicates.some((predicate) => ['team', 'opponent', 'team_name', 'player_name'].includes(predicate.field)))) {
          throw new Error('Known player and club conditions in a clarification must remain literal entities with subject/opponent roles, not predicates. Retain the known fixture date even when the requested fixture was verified absent.')
        }
        if (parsed.policy === 'clarify' && !parsed.query_contract?.unresolved_constraints.length) throw new Error('Clarification requires a semantic contract preserving known entities and output, with specific missing constraints. A named-player statistics request is executable; missing year/team and surname ambiguity are handled by product defaults and the official identity resolver.')
        if (parsed.subject && ![message, ...(context.history ?? []).map((item) => item.content)].some((text) => text.includes(parsed.subject!))) throw new Error('Subject must be copied from the conversation')
        if (parsed.policy === 'outside_npb' && !parsed.subject?.trim()) throw new Error('An outside_npb answer requires a literal subject naming the external topic from the question or history.')
        const alignmentIssues = await verifySemanticAlignment(config, { message, context, candidate: parsed, currentDate, facts,
          fetch: fetchFn, signal, onRequest: dependencies.onRequest })
        dependencies.onReview?.({ attempt: attempt + 1, issues: alignmentIssues, candidate: parsed, facts })
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
