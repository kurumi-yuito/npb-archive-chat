import { chatResponseCoreSchema, chatStructuredQuerySchema, normalizePlayerNameKey, type ChatRequest, type ChatResponseCore, type ChatStructuredQuery, type QueryContract } from '@npb/schemas'
import type { ChatQueryService } from '@npb/db'
import { matchesGameTeamFilter } from '@npb/db'
import { compileQueryContract, identityFiltersForContract, subjectNameField, QueryContractCompileError } from './chat-contract-compiler'
import { normalizeChatStructuredQuery, normalizeFreeText } from './chat-query-normalizer'
import { formatChatAnswer, formatClarificationAnswer, publicExecutionMetadata } from './chat-answer-formatter'
import { buildPlannerOutput } from './chat-planner'
import { buildChatExecutionMetadata } from './chat-executor'
import { validateQueryContractExecution, requirementsForContract } from './chat-query-contract'
import { inferDataRequirements, chatExecutionRepositorySchema } from './chat-query-plan'
import { searchCompleteEventEvidence, validateEventEvidence, verifyOfficialHomeRunTotal, EventEvidenceError } from './chat-event-evidence'
import type { PlayerResolution } from './player-resolution'
import type { SemanticRequest } from './chat-semantic-llm'

type SemanticParser = (message: string, context: { history?: ChatRequest['history'] }) => Promise<SemanticRequest>
type ResolvedEntity = { entity: QueryContract['entities'][number]; resolution: PlayerResolution }

/** Semantic extraction -> identity -> compilation -> execution. No question rewrites. */
export function createContractChatService(databaseService: ChatQueryService, parse: SemanticParser) {
  return { async answerQuestion(message: string, options: { history?: ChatRequest['history'] } = {}): Promise<ChatResponseCore> {
    const executedRepositories = new Set<string>()
    const queryService = new Proxy(databaseService, { get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver)
      return typeof value === 'function' ? (...args: unknown[]) => {
        executedRepositories.add(String(key))
        return Reflect.apply(value, target, args)
      } : value
    } })
    const request = await parse(message, options)
    if (request.policy !== 'execute') return policyResponse(message, request)
    const contract = request.query_contract!
    const identities = await resolveContractPlayers(queryService, contract)
    const unresolved = identities.find(({ resolution }) => resolution.status !== 'resolved')
    if (unresolved) {
      const resolution = unresolved.resolution
      const choices = resolution.candidates.map((candidate) => `${candidate.name}${candidate.primary_team ? `（${candidate.primary_team}）` : ''}`).join('、')
      return chatResponseCoreSchema.parse({ message, structured_query: null,
        answer: { summary: resolution.status === 'ambiguous'
          ? `どの${resolution.input}ですか。候補：${choices}。フルネームまたは球団・年度を指定してください。`
          : `${resolution.input}は、指定された条件の公式選手情報から特定できませんでした。名前・球団・年度をご確認ください。`,
          query_contract: contract, result_count: 0, resolved_player: resolution, source_urls: [] },
        results: emptyResults(), sources: [],
      })
    }
    const operations = compileQueryContract(contract)
    const responses: ChatResponseCore[] = []
    for (const operation of operations) {
      const query = applyResolvedIds(normalizeChatStructuredQuery(operation.query), identities)
      const operationContract = query.query_contract!
      // Identity IDs are additional proof; the original mention and scopes remain unchanged.
      const available = operation.output.kind === 'player_information'
        ? ['player_profiles', 'source_snapshots'] as const : inferDataRequirements(query)
      const issues = validateQueryContractExecution(operationContract, query, [...available])
      if (issues.length) throw new QueryContractCompileError(issues)
      const results = emptyResults()
      let completeness
      switch (query.intent) {
        case 'search_events': {
          results.events = operationContract.completeness.mode === 'all'
            ? await searchCompleteEventEvidence(queryService, query.filters)
            : await queryService.searchEvents(query.filters)
          const invalid = results.events.flatMap((row) => validateEventEvidence(row as Parameters<typeof validateEventEvidence>[0], query.filters))
          if (invalid.length) throw new EventEvidenceError([...new Set(invalid)])
          if (operationContract.completeness.mode === 'all') completeness = await verifyOfficialHomeRunTotal(queryService, query.filters, results.events as Awaited<ReturnType<typeof queryService.searchEvents>>)
          break
        }
        case 'search_games': results.games = await queryService.searchGames(query.filters); break
        case 'search_batting': results.batting = await queryService.searchBattingLines(query.filters); break
        case 'search_pitching': results.pitching = await queryService.searchPitchingLines(query.filters); break
        case 'search_roster': results.roster = await queryService.searchRosterEntries(query.filters); break
        case 'player_affiliation':
          if (operation.output.kind === 'player_information') results.playerInformation = await queryService.searchPlayerInformation(query.filters)
          else results.affiliations = await queryService.searchPlayerAffiliations({ ...query.filters, dictionaryOnly: true })
          break
        case 'game_detail': results.gameDetails = await queryService.searchGameDetails(query.filters); break
        case 'aggregate_batting': results.aggregates = await queryService.aggregateBattingLines(query.filters); break
        case 'aggregate_pitching': results.aggregates = await queryService.aggregatePitchingLines(query.filters); break
        case 'aggregate_events': results.aggregates = await queryService.aggregateEvents(query.filters); break
        case 'aggregate_games': results.aggregates = await queryService.aggregateGameResults(query.filters); break
        case 'award_winners': results.awards = await queryService.searchAwardWinners({ year: query.filters.year!, award_type: query.filters.award_type ?? 'rookie_of_the_year' }); break
        case 'off_topic': throw new QueryContractCompileError(['unexpected_off_topic_execution'])
      }
      const gameIds = [...new Set([
        ...results.events.map((row) => row.gameId), ...results.games.map((row) => row.gameId),
        ...results.batting.map((row) => row.gameId), ...results.pitching.map((row) => row.gameId),
        ...results.roster.map((row) => row.gameId), ...results.affiliations.map((row) => row.gameId), ...results.gameDetails.map((row) => row.gameId),
      ])].filter((id): id is string => typeof id === 'string' && !id.startsWith('bis:'))
      const sources: ChatResponseCore['sources'] = []
      for (let start = 0; start < gameIds.length; start += 100) {
        sources.push(...await queryService.listSourceSnapshotsByGameIds(gameIds.slice(start, start + 100)))
      }
      const player = identities.length === 1 ? identities[0]!.resolution : null
      const metadata = buildChatExecutionMetadata(query, player, buildPlannerOutput(query, false), identities.map(({ resolution }) => resolution))
      metadata.repositories = [...executedRepositories].flatMap((name) => {
        const parsed = chatExecutionRepositorySchema.safeParse(name)
        return parsed.success ? [parsed.data] : []
      })
      if (operation.output.kind === 'player_information') metadata.dataRequirements = ['player_profiles', 'official_statistics', 'source_snapshots']
      const profileAffiliation = results.affiliations.some((row) => row.sourceKind === 'official_profile')
      const answer: ChatResponseCore['answer'] = profileAffiliation ? {
        summary: `${player?.name ?? results.affiliations[0]!.playerName}の公式年度記録に基づく所属です。\n${results.affiliations.map((row) => `${row.year}年：${row.team}`).join('\n')}\n現在の契約状況は年度記録だけでは確認できません。`,
        result_count: results.affiliations.length, source_urls: [...new Set(results.affiliations.flatMap((row) => row.sourceUrl ? [row.sourceUrl] : []))],
        resolved_player: player, execution_metadata: publicExecutionMetadata(metadata),
      } : formatChatAnswer({ question: message, structuredQuery: query, results, sources, playerResolution: player, executionMetadata: metadata })
      answer.query_contract = contract
      if (operation.output.kind === 'player_information') {
        const profiles = results.playerInformation ?? []
        answer.summary = profiles.length ? profiles.map((profile) => {
          const latestYear = Math.max(...profile.registrations.map((row) => row.year), ...profile.affiliations.map((row) => row.year))
          const registrations = profile.registrations.filter((row) => row.year === latestYear)
          const details = registrations.length ? registrations.map((row) => `${row.team}${row.position ? `・${row.position}` : ''}`).join('、')
            : profile.affiliations.filter((row) => row.year === latestYear).map((row) => row.team).join('、')
          const statistics = (profile.statistics ?? []).map((row) => {
            const fields = row.kind === 'batting' ? ['試合', '打率', '本塁打', '打点'] : ['登板', '勝利', '敗北', '防御率']
            const values = fields.flatMap((field) => /^\d*(?:\.\d+)?$/u.test(row.metrics[field] ?? '') && /\d/u.test(row.metrics[field] ?? '') ? [`${field} ${row.metrics[field]}`] : [])
            return values.length ? `${row.year}年度・${row.team}の公式${row.kind === 'batting' ? '打撃' : '投手'}成績：${values.join('、')}。` : ''
          }).filter(Boolean)
          return `${profile.name}の公式プロフィールです。${details ? `\n${latestYear}年度の公式記録・選手一覧：${details}。` : '\n年度別の所属情報は確認できませんでした。'}${statistics.length ? `\n${statistics.join('\n')}` : ''}`
        }).join('\n\n') : '指定された選手の公式プロフィール情報は収録データから確認できませんでした。'
        answer.result_count = profiles.length
        answer.source_urls = [...new Set(profiles.flatMap((row) => [...row.sourceUrls, ...(row.statistics ?? []).map((statistic) => statistic.sourceUrl)]))]
        answer.suggested_questions = []
      }
      if (results.awards?.length) {
        answer.summary = results.awards.map((row) => `${row.year}年の${row.league}新人王は${row.playerName}（${row.team}）です。`).join('\n')
        answer.result_count = results.awards.length
        answer.source_urls = [...new Set(results.awards.map((row) => row.sourceUrl))]
      }
      if (completeness) {
        answer.evidence_validation = completeness
        answer.source_urls = [...new Set([...answer.source_urls, ...completeness.source_urls])]
        if (completeness.official_total_status === 'unavailable') answer.summary += '\n収録済みの該当記録は全件取得しました。公式年度集計との件数照合は未確認です。'
      }
      responses.push(chatResponseCoreSchema.parse({ message, structured_query: query, answer, results, sources }))
    }
    const first = responses[0]!
    if (responses.length === 1) return first
    const merged = emptyResults()
    for (const response of responses) {
      for (const key of Object.keys(merged) as Array<keyof typeof merged>) {
        const rows = [...(merged[key] ?? []), ...(response.results[key] ?? [])]
        // Preserve distinct verified rows; this is only transport deduplication across operators.
        Object.assign(merged, { [key]: [...new Map(rows.map((row) => [JSON.stringify(row), row])).values()] })
      }
    }
    return chatResponseCoreSchema.parse({ ...first,
      structured_query: { ...first.structured_query, query_contract: contract }, results: merged,
      sources: responses.flatMap((response) => response.sources),
      answer: { ...first.answer, summary: responses.map((response) => response.answer.summary).join('\n\n'),
        result_count: responses.reduce((sum, response) => sum + response.answer.result_count, 0),
        source_urls: [...new Set(responses.flatMap((response) => response.answer.source_urls))],
        execution_metadata: first.answer.execution_metadata ? { ...first.answer.execution_metadata, query_contract: contract, data_requirements: requirementsForContract(contract) } : undefined,
      },
    })
  } }
}

export async function resolveContractPlayers(service: Pick<ChatQueryService, 'searchPlayerCandidates'>, contract: QueryContract): Promise<ResolvedEntity[]> {
  const scope = identityFiltersForContract(contract)
  const resolutions: ResolvedEntity[] = []
  for (const entity of contract.entities.filter((entity) => entity.kind === 'player')) {
    const input = normalizeFreeText(entity.mention) ?? entity.mention
    const datedTeam = Boolean(scope.team && (scope.year || scope.year_from || scope.year_to))
    const raw = await service.searchPlayerCandidates({ ...scope, name: input, aliases: [input],
      scopeToEvidence: datedTeam, dictionaryOnly: true, searchDomain: 'all', includeEvents: false, limit: 51,
    })
    let candidates = raw.filter((candidate) => candidate.player_id)
    const aliasMatches = candidates.filter((candidate) => candidate.matched_aliases?.some((alias) => compact(alias) === compact(input)))
    const nonPrefixAliases = aliasMatches.filter((candidate) => !compact(candidate.name).startsWith(compact(input)))
    const surname = candidates.filter((candidate) => candidate.name.normalize('NFKC').trim().split(/[\s\u3000]+/u)[0] === input.normalize('NFKC'))
    const exact = candidates.filter((candidate) => compact(candidate.name) === compact(input))
    if (exact.length) candidates = [...new Map([...exact, ...nonPrefixAliases].map((candidate) => [candidate.player_id, candidate])).values()]
    else if (surname.length) candidates = [...new Map([...surname, ...nonPrefixAliases].map((candidate) => [candidate.player_id, candidate])).values()]
    else candidates = candidates.filter((candidate) => compact(candidate.name).startsWith(compact(input)) || aliasMatches.includes(candidate))
    if (datedTeam) candidates = candidates.filter((candidate) => candidate.years.some((year) =>
      (!scope.year || year === scope.year) && (!scope.year_from || year >= scope.year_from) && (!scope.year_to || year <= scope.year_to) &&
      (contract.temporal_scope.years.length === 0 || contract.temporal_scope.years.includes(year))) && candidate.teams.some((team) => matchesGameTeamFilter(team, scope.team!)))
    candidates = [...new Map(candidates.map((candidate) => [candidate.player_id, candidate])).values()]
    const unique = candidates.length === 1 && raw.length < 51 ? candidates[0]! : null
    resolutions.push({ entity, resolution: {
      input: entity.mention, status: unique ? 'resolved' : candidates.length ? 'ambiguous' : 'not_found',
      player_id: unique?.player_id ?? null, name: unique?.name ?? null, primary_team: unique?.primary_team ?? null, candidates,
    } })
  }
  return resolutions
}

function applyResolvedIds(query: ChatStructuredQuery, identities: ResolvedEntity[]): ChatStructuredQuery {
  const filters: Record<string, unknown> = { ...query.filters }
  const names: string[] = []
  const ids: string[] = []
  for (const { entity, resolution } of identities) {
    const eventOperation = query.intent === 'search_events' || query.intent === 'aggregate_events'
    const field = eventOperation ? (entity.role === 'batter' ? 'batter_name' : entity.role === 'pitcher' ? 'pitcher_name' : entity.role === 'runner' ? 'runner_name' : 'player_name') : subjectNameField(query.intent)
    if (typeof filters[field] === 'string' && compact(String(filters[field])) === compact(entity.mention)) filters[field.replace(/_name$/u, field === 'player_name' ? '_id' : '_player_id')] = resolution.player_id
    names.push(entity.mention)
    ids.push(resolution.player_id!)
  }
  if (names.length > 1 && Array.isArray(filters.player_names)) filters.player_ids = ids
  if (names.length > 1 && Array.isArray(filters.pitcher_names)) filters.pitcher_player_ids = ids
  return chatStructuredQuerySchema.parse({ ...query, filters })
}

function emptyResults(): ChatResponseCore['results'] {
  return { events: [], games: [], batting: [], pitching: [], roster: [], affiliations: [], gameDetails: [], aggregates: [], awards: [], playerInformation: [] }
}

function policyResponse(message: string, request: SemanticRequest): ChatResponseCore {
  const source = 'https://baseball.yahoo.co.jp/npb/'
  const summary = request.policy === 'clarify' ? formatClarificationAnswer({ action: 'clarify', reason: request.clarification_reason! })
    : request.policy === 'news' ? `ニュース・公示・契約などの最新情報には対応していません。スポーツナビをご確認ください。\n${source}`
      : request.policy === 'realtime' ? `試合速報などリアルタイム情報には対応していません。\n${source}`
        : request.policy === 'prediction' ? '優勝や将来の成績は、収録済みデータだけでは正確に予測できません。'
          : request.policy === 'capabilities' ? '一軍・二軍の収録済み試合結果、選手成績、所属情報、比較に対応しています。収録範囲外の最新情報は確認できません。'
            : request.policy === 'staff_information' ? '監督・コーチの情報は収録対象外です。公式球団情報をご確認ください。'
              : `${request.subject ?? 'その分野'}には対応していません。NPBの試合結果や選手成績についてご質問ください。`
  return chatResponseCoreSchema.parse({ message, structured_query: null, answer: { summary, ...(request.query_contract ? { query_contract: request.query_contract } : {}), result_count: 0, source_urls: ['news', 'realtime'].includes(request.policy) ? [source] : [] }, results: emptyResults(), sources: [] })
}

function compact(value: string): string { return normalizePlayerNameKey(value) }
