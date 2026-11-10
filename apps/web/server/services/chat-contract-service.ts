import { chatResponseCoreSchema, chatStructuredQuerySchema, normalizePlayerNameKey, type ChatRequest, type ChatResponseCore, type ChatStructuredQuery, type QueryContract } from '@npb/schemas'
import type { ChatQueryService } from '@npb/db'
import { matchesGameTeamFilter } from '@npb/db'
import { compileQueryContract, contractForOutput, identityFiltersForContract, subjectNameField, QueryContractCompileError } from './chat-contract-compiler'
import { normalizeChatStructuredQuery, normalizeFreeText } from './chat-query-normalizer'
import { formatChatAnswer, formatClarificationAnswer, publicExecutionMetadata } from './chat-answer-formatter'
import { buildPlannerOutput } from './chat-planner'
import { buildChatExecutionMetadata } from './chat-executor'
import { validateQueryContractExecution, requirementsForContract } from './chat-query-contract'
import { inferDataRequirements, chatExecutionRepositorySchema } from './chat-query-plan'
import { searchCompleteEventEvidence, validateEventEvidence, verifyOfficialHomeRunTotal, EventEvidenceError } from './chat-event-evidence'
import type { PlayerResolution } from './player-resolution'
import type { SemanticRequest } from './chat-semantic-llm'
import { formatContractStatistics, formatScopedStatisticComparison, formatTeamStatisticComparison } from './chat-statistic-answer'
import { officialProfileMetricStats, searchOfficialCareerEvidence } from './chat-career-evidence'
import { searchOpponentStarters } from './chat-appearance-context'
import { formatContractTeamStatistics } from './chat-team-statistic-answer'

type SemanticParser = (message: string, context: { history?: ChatRequest['history'] }) => Promise<SemanticRequest>
type ResolvedEntity = { entity: QueryContract['entities'][number]; resolution: PlayerResolution }

/** Semantic extraction -> identity -> compilation -> execution. No question rewrites. */
export function createContractChatService(databaseService: ChatQueryService, parse: SemanticParser) {
  return { async answerQuestion(message: string, options: { history?: ChatRequest['history']; selectedPlayer?: ChatRequest['selected_player'] } = {}): Promise<ChatResponseCore> {
    const executedRepositories = new Set<string>()
    const queryService = new Proxy(databaseService, { get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver)
      return typeof value === 'function' ? (...args: unknown[]) => {
        executedRepositories.add(String(key))
        return Reflect.apply(value, target, args)
      } : value
    } })
    const request = await parse(message, { history: options.history })
    if (request.policy !== 'execute') return policyResponse(message, request)
    const contract = request.query_contract!
    if (contract.requested_output.length === 1 && contract.requested_output[0]!.kind === 'game_schedule') {
      return chatResponseCoreSchema.parse({ message, structured_query: null, results: emptyResults(), sources: [], answer: {
        summary: '未来の試合日程・登板予定は収録対象外のため、収録済み記録からは確認できません。NPB公式サイトの試合日程をご確認ください。\nhttps://npb.jp/games/',
        query_contract: contract, result_count: 0, source_urls: ['https://npb.jp/games/'],
      } })
    }
    if (contract.requested_output.length === 1 && contract.requested_output[0]!.kind === 'staff_information') {
      return chatResponseCoreSchema.parse({ message, structured_query: null, results: emptyResults(), sources: [], answer: {
        summary: '監督・コーチの情報は収録対象外です。公式球団情報をご確認ください。',
        query_contract: contract, result_count: 0, source_urls: [],
      } })
    }
    if (contract.requested_output.some((output) => output.scope || ['game_schedule', 'staff_information'].includes(output.kind))) {
      if (contract.requested_output.length > 8) throw new QueryContractCompileError(['scoped_operation_budget_exceeded'])
      const responses: ChatResponseCore[] = []
      for (const output of contract.requested_output) {
        const effective = contractForOutput(contract, output)
        const response = await createContractChatService(databaseService, async () => ({ ...request, query_contract: effective })).answerQuestion(message, options)
        const subjects = effective.entities.filter((entity) => entity.role !== 'opponent').map((entity) => entity.mention).join('・')
        const time = effective.temporal_scope
        const period = time.years.length ? `${time.years.join('・')}年` : time.date_from || time.date_to
          ? `${time.date_from ?? ''}〜${time.date_to ?? ''}` : time.year_from || time.year_to ? `${time.year_from ?? ''}〜${time.year_to ?? ''}年` : ''
        response.answer.summary = `${[period, subjects].filter(Boolean).join('・')}：\n${response.answer.summary}`
        responses.push(response)
      }
      const resolutions = responses.flatMap((response) => response.answer.resolved_player ? [response.answer.resolved_player] : [])
      return mergeContractResponses(contract, responses, resolutions)
    }
    const identities = await resolveContractPlayers(queryService, contract, options.selectedPlayer)
    const unresolved = identities.find(({ resolution }) => resolution.status !== 'resolved')
    if (unresolved) {
      const supplemental = options.selectedPlayer ? null : await latestVerifiedSeasonResponse(queryService, contract, message, unresolved)
      if (supplemental) return supplemental
      const resolution = unresolved.resolution
      const choices = resolution.candidates.map((candidate) => `${candidate.name}（${[candidate.primary_team, ...(candidate.positions ?? []), ...(candidate.uniform_numbers ?? []).map((number) => `背番号${number}`)].filter(Boolean).join('・')}）`).join('、')
      return chatResponseCoreSchema.parse({ message, structured_query: null,
        answer: { summary: resolution.status === 'ambiguous'
          ? `どの${resolution.input}ですか。候補：${choices}。候補を選択してください。`
          : `${resolution.input}は、指定された条件の公式選手情報から特定できませんでした。名前・球団・年度をご確認ください。`,
          query_contract: contract, result_count: 0, resolved_player: resolution, source_urls: [...new Set(resolution.candidates.flatMap((candidate) => candidate.source_urls ?? []))] },
        results: emptyResults(), sources: [],
      })
    }
    let operations
    try {
      operations = contract.requested_output.some((output) => output.kind === 'appearance_records')
        ? await planGenericAppearances(queryService, contract, identities) : compileQueryContract(contract)
    } catch (error) {
      if (!(error instanceof QueryContractCompileError) || !error.issues.some((issue) => ['appearance_role_ambiguous', 'appearance_role_evidence_required'].includes(issue))) throw error
      return chatResponseCoreSchema.parse({ message, structured_query: null, results: emptyResults(), sources: [], answer: {
        summary: `${identities.map(({ resolution }) => resolution.name ?? resolution.input).join('・')}について、打撃成績と投手成績のどちらを確認しますか。公式の守備位置・年度記録だけでは、要求する成績の種類を一意に確定できません。`,
        query_contract: { ...contract, unresolved_constraints: [...contract.unresolved_constraints, 'appearance_statistic_domain'] }, result_count: 0, source_urls: [],
      } })
    }
    const responses: ChatResponseCore[] = []
    for (const operation of operations) {
      const query = applyResolvedIds(normalizeChatStructuredQuery(operation.query), identities)
      const operationContract = query.query_contract!
      const opponentStarterRequested = operation.output.kind === 'pitching_records' && operation.output.fields.includes('opponentStarter')
      // Identity IDs are additional proof; the original mention and scopes remain unchanged.
      const available = operation.output.kind === 'player_information'
        ? ['player_profiles', 'source_snapshots'] as const : operation.output.kind === 'team_statistics'
          ? ['official_team_statistics', 'source_snapshots'] as const : inferDataRequirements(query)
      const issues = validateQueryContractExecution(operationContract, query, [...available, ...(opponentStarterRequested ? ['game_details', 'events'] as const : [])])
      if (issues.length) throw new QueryContractCompileError(issues)
      const results = emptyResults()
      let completeness
      const career = operationContract.temporal_scope.relative === 'career' && identities.length === 1 &&
        ['batting_statistics', 'pitching_statistics'].includes(operation.output.kind)
        ? await searchOfficialCareerEvidence(queryService, { contract: operationContract,
          domain: operation.output.kind === 'batting_statistics' ? 'batting' : 'pitching',
          playerId: identities[0]!.resolution.player_id!, playerName: identities[0]!.resolution.name ?? identities[0]!.entity.mention }) : null
      if (career) results.aggregates = career.rows
      else switch (query.intent) {
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
      const appearanceContext = opponentStarterRequested ? await searchOpponentStarters(queryService, results.pitching) : null
      if (appearanceContext) {
        results.events.push(...appearanceContext.events)
        results.gameDetails.push(...appearanceContext.games)
      }
      const incompleteStatisticIdentity = results.aggregates.some((row) => row.stats.evidenceStatus === 'official_identity_incomplete')
      const gameIds = [...new Set([
        ...results.events.map((row) => row.gameId), ...results.games.map((row) => row.gameId),
        ...results.batting.map((row) => row.gameId), ...results.pitching.map((row) => row.gameId),
        ...results.roster.map((row) => row.gameId), ...results.affiliations.map((row) => row.gameId), ...results.gameDetails.map((row) => row.gameId),
        ...results.aggregates.flatMap((row) => {
          if (typeof row.stats.evidenceGameIds !== 'string') return []
          const ids: unknown = JSON.parse(row.stats.evidenceGameIds)
          if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) throw new QueryContractCompileError(['invalid_game_aggregate_evidence'])
          return ids as string[]
        }),
      ])].filter((id): id is string => typeof id === 'string' && !id.startsWith('bis:'))
      const sources: ChatResponseCore['sources'] = []
      for (let start = 0; start < gameIds.length; start += 100) {
        sources.push(...await queryService.listSourceSnapshotsByGameIds(gameIds.slice(start, start + 100)))
      }
      const operationIdentities = identities.filter(({ entity }) => operationContract.entities.some((candidate) => candidate.kind === 'player' && candidate.role === entity.role && candidate.mention === entity.mention))
      const player = operationIdentities.length === 1 ? operationIdentities[0]!.resolution : null
      const metadata = buildChatExecutionMetadata(query, player, buildPlannerOutput(query, false), identities.map(({ resolution }) => resolution))
      if (opponentStarterRequested) metadata.dataRequirements = requirementsForContract(operationContract)
      if (contract.requested_output.some((output) => output.kind === 'appearance_records')) metadata.dataRequirements = [...new Set([...metadata.dataRequirements, 'player_profiles' as const])]
      metadata.repositories = [...executedRepositories].flatMap((name) => {
        const parsed = chatExecutionRepositorySchema.safeParse(name)
        return parsed.success ? [parsed.data] : []
      })
      if (operation.output.kind === 'player_information') metadata.dataRequirements = ['player_profiles', 'official_statistics', 'source_snapshots']
      if (operation.output.kind === 'team_statistics') metadata.dataRequirements = ['official_team_statistics', 'source_snapshots']
      if (career) metadata.dataRequirements = ['player_profiles', 'official_statistics', 'source_snapshots']
      if (incompleteStatisticIdentity || results.aggregates.some((row) => row.stats.evidenceStatus === 'official_complete_scope')) metadata.dataRequirements = ['official_statistics', 'source_snapshots']
      const profileAffiliation = results.affiliations.some((row) => row.sourceKind === 'official_profile' || row.sourceKind === 'official_registration')
      const statisticUrls = [...new Set(results.aggregates.flatMap((row) => {
        if (typeof row.stats.sourceUrls !== 'string') return []
        const urls: unknown = JSON.parse(row.stats.sourceUrls)
        if (!Array.isArray(urls) || !urls.every((url) => typeof url === 'string' && /^https:\/\/npb\.jp\/bis\//u.test(url))) throw new QueryContractCompileError(['invalid_statistic_sources'])
        return urls as string[]
      }))]
      const statisticSummary = incompleteStatisticIdentity ? null : operation.output.kind === 'team_statistics' ? formatContractTeamStatistics(operationContract, results.aggregates) : formatContractStatistics({ contract: operationContract, query, rows: results.aggregates, playerName: player?.name ?? undefined,
        careerVerified: career?.verified, asOf: career?.basisText })
      const answer: ChatResponseCore['answer'] = incompleteStatisticIdentity ? {
        summary: `${player?.name ?? '指定対象'}の指定条件に対応する公式成績表は取得できましたが、同名の記録と選手IDの対応に未確認の部分があります。未確認の行を除いた数値を完全な成績としては回答できません。`,
        result_count: 0, source_urls: statisticUrls, resolved_player: player, execution_metadata: publicExecutionMetadata(metadata),
      } : statisticSummary !== null ? {
        summary: statisticSummary, result_count: results.aggregates.length,
        source_urls: [...new Set([...sources.map((row) => row.source_url), ...(career?.sourceUrls ?? []), ...statisticUrls])],
        resolved_player: player, execution_metadata: publicExecutionMetadata(metadata),
      } : profileAffiliation ? {
        summary: `${player?.name ?? results.affiliations[0]!.playerName}の公式年度記録・登録公示に基づく所属です。\n${[...new Set(results.affiliations.map((row) => `${row.year}年：${row.team}`))].join('\n')}\n現在の契約状況は年度記録だけでは確認できません。`,
        result_count: results.affiliations.length, source_urls: [...new Set(results.affiliations.flatMap((row) => row.sourceUrl ? [row.sourceUrl] : []))],
        resolved_player: player, execution_metadata: publicExecutionMetadata(metadata),
      } : formatChatAnswer({ question: message, structuredQuery: query, results, sources, playerResolution: player, executionMetadata: metadata })
      answer.query_contract = contract
      if (incompleteStatisticIdentity) results.aggregates = []
      if (player?.name && ['recent_appearances', 'latest_appearance'].includes(operationContract.temporal_scope.relative ?? '')) {
        answer.summary = `${player.name.replace(/\s+/gu, '')}：${answer.summary}`
      }
      if (appearanceContext?.description) {
        answer.summary += `\n${appearanceContext.description}`
        answer.source_urls = [...new Set([...answer.source_urls, ...appearanceContext.events.flatMap((row) => row.sourceUrl ? [row.sourceUrl] : [])])]
      }
      if (statisticSummary !== null) {
        if (operationContract.temporal_scope.relative === 'career' && !career?.verified) {
          // Partial appearance archives cannot establish an NPB career total.
          results.aggregates = []
          answer.result_count = 0
          answer.source_urls = player?.player_id ? [`https://npb.jp/bis/players/${player.player_id}.html`] : []
        }
      }
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
          return `${profile.name}の${profile.profileAvailable === false ? '公式年度登録公示で確認できる選手情報' : '公式プロフィール'}です。${details ? `\n${latestYear}年度の公式記録・選手一覧：${details}。` : '\n年度別の所属情報は確認できませんでした。'}${statistics.length ? `\n${statistics.join('\n')}` : ''}${profile.profileAvailable === false ? '\n年度の登録公示は、現在の契約継続を示すものではありません。' : ''}`
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
        if (completeness.official_total_status === 'incomplete') answer.summary += `\n公式戦の確認記録は${completeness.official_observed_count}件、公式年度集計は${completeness.official_total}本です。${(completeness.discrepancies ?? []).map((row) => `${row.year}年は${row.observed}件／公式${row.official_total}本`).join('、')}。完全な一覧とは確認できません。`
        if (completeness.other_competitions_count) answer.summary += `\n別の試合種別の確認記録を${completeness.other_competitions_count}件含みます。これらは公式戦の年度集計の照合対象外です。`
        if (completeness.unclassified_count) answer.summary += `\n${completeness.unclassified_count}件の試合種別が未確認のため、完全性は確定していません。`
      }
      responses.push(chatResponseCoreSchema.parse({ message, structured_query: query, answer, results, sources }))
    }
    return mergeContractResponses(contract, responses, identities.map(({ resolution }) => resolution))
  } }
}

function mergeContractResponses(contract: QueryContract, responses: ChatResponseCore[], resolutions: PlayerResolution[]): ChatResponseCore {
    const first = responses[0]!
    if (responses.length === 1 && !contract.requested_output.some((output) => output.scope)) return first
    const merged = emptyResults()
    for (const response of responses) {
      for (const key of Object.keys(merged) as Array<keyof typeof merged>) {
        const rows = [...(merged[key] ?? []), ...(response.results[key] ?? [])]
        // Preserve distinct verified rows; this is only transport deduplication across operators.
        Object.assign(merged, { [key]: [...new Map(rows.map((row) => [JSON.stringify(row), row])).values()] })
      }
    }
    const metadata = responses.find((response) => response.answer.execution_metadata)?.answer.execution_metadata
    const scopedComparison = formatScopedStatisticComparison(contract, responses)
    return chatResponseCoreSchema.parse({ ...first,
      structured_query: first.structured_query ? { ...first.structured_query, query_contract: contract } : null, results: merged,
      sources: responses.flatMap((response) => response.sources),
      answer: { ...first.answer, summary: contract.requested_output.every((output) => output.kind === 'team_statistics')
        ? formatContractTeamStatistics(contract, merged.aggregates)
        : formatTeamStatisticComparison(contract, merged.aggregates, responses.map((response) => response.answer.summary)) ??
          [responses.map((response) => response.answer.summary).join('\n\n'), scopedComparison].filter(Boolean).join('\n'),
        query_contract: contract,
        resolved_player: resolutions.length === 1 ? resolutions[0]! : null,
        result_count: responses.reduce((sum, response) => sum + response.answer.result_count, 0),
        source_urls: [...new Set(responses.flatMap((response) => response.answer.source_urls))],
        execution_metadata: metadata ? { ...metadata, query_contract: contract,
          data_requirements: [...new Set(responses.flatMap((response) => response.answer.execution_metadata?.data_requirements ?? []))],
          repositories: [...new Set(responses.flatMap((response) => response.answer.execution_metadata?.repositories ?? []))],
          resolved_players: resolutions,
          scoped_query_contracts: contract.requested_output.some((output) => output.scope)
            ? responses.flatMap((response) => response.answer.query_contract ? [response.answer.query_contract] : []) : undefined,
        } : undefined,
      },
    })
}

/** Generic form requests retain an unspecified domain until official identity/position evidence is available. */
async function planGenericAppearances(service: ChatQueryService, contract: QueryContract, identities: ResolvedEntity[]) {
  if (!identities.length || !['recent_appearances', 'latest_appearance'].includes(contract.temporal_scope.relative ?? '')) {
    throw new QueryContractCompileError(['appearance_player_scope_required'])
  }
  const operations = []
  for (const identity of identities) {
    const profiles = await service.searchPlayerInformation({ ...identityFiltersForContract(contract), player_id: identity.resolution.player_id!, includeCareer: true })
    if (profiles.length !== 1 || profiles[0]!.playerId !== identity.resolution.player_id) throw new QueryContractCompileError(['appearance_role_evidence_required'])
    const profile = profiles[0]!
    const latestYear = Math.max(...profile.registrations.map((row) => row.year))
    const positions = [...new Set(profile.registrations.filter((row) => row.year === latestYear).map((row) => row.position).filter(Boolean))]
    let kind: 'batting_records' | 'pitching_records' | null = null
    if (positions.length === 1) {
      if (positions[0] === '投手') kind = 'pitching_records'
      else if (['捕手', '内野手', '外野手'].includes(positions[0]!)) kind = 'batting_records'
    }
    if (!positions.length) {
      const domains = [...new Set((profile.annualStatistics ?? []).filter((row) => row.sourceUrl === `https://npb.jp/bis/players/${profile.playerId}.html` &&
        Number(row.metrics[row.kind === 'batting' ? '試合' : '登板']) > 0).map((row) => row.kind))]
      if (domains.length === 1) kind = domains[0] === 'batting' ? 'batting_records' : 'pitching_records'
    }
    if (!kind) throw new QueryContractCompileError(['appearance_role_ambiguous'])
    const resolvedKind = kind
    // A generic appearance projection can resolve to a concrete projection
    // already present in the same scope. Fetch it once, preserving every
    // requested field instead of duplicating the query and answer paragraph.
    const projections = new Map<QueryContract['requested_output'][number]['kind'], QueryContract['requested_output'][number]>()
    for (const output of contract.requested_output) {
      const concrete = output.kind === 'appearance_records' ? { ...output, kind: resolvedKind } : output
      const previous = projections.get(concrete.kind)
      projections.set(concrete.kind, previous ? { ...previous, fields: [...new Set([...previous.fields, ...concrete.fields])] } : concrete)
    }
    const effective: QueryContract = { ...contract,
      entities: contract.entities.filter((entity) => entity.kind !== 'player' || entity === identity.entity),
      requested_output: [...projections.values()] }
    operations.push(...compileQueryContract(effective))
  }
  return operations
}

/** Preserve the requested scope, and label a verified earlier NPB season as supplemental evidence. */
async function latestVerifiedSeasonResponse(service: ChatQueryService, contract: QueryContract, message: string, unresolved: ResolvedEntity): Promise<ChatResponseCore | null> {
  if (contract.requested_output.length > 1) {
    if (!contract.requested_output.every((output) => ['batting_statistics', 'pitching_statistics'].includes(output.kind))) return null
    const parts: ChatResponseCore[] = []
    for (const output of contract.requested_output) {
      const part = await latestVerifiedSeasonResponse(service, { ...contract, requested_output: [output] }, message, unresolved)
      if (!part?.answer.scope_fallback) return null
      parts.push(part)
    }
    const first = parts[0]!, scope = first.answer.scope_fallback!
    if (parts.some((part) => part.answer.scope_fallback!.evidence_year !== scope.evidence_year)) return null
    const results = emptyResults()
    results.aggregates = parts.flatMap((part) => part.results.aggregates)
    return chatResponseCoreSchema.parse({ ...first, results, answer: { ...first.answer, query_contract: contract,
      scope_fallback: { ...scope, effective_contract: { ...scope.effective_contract, requested_output: contract.requested_output } },
      summary: parts.map((part) => part.answer.summary).join('\n\n'), result_count: results.aggregates.length,
      source_urls: [...new Set(parts.flatMap((part) => part.answer.source_urls))] } })
  }
  const time = contract.temporal_scope
  const requestedYear = (time.years.length === 1 ? time.years[0] : time.year_from === time.year_to ? time.year_from : null) ?? identityFiltersForContract(contract).year
  const currentYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date()))
  const output = contract.requested_output[0]
  if (unresolved.resolution.status !== 'not_found' || requestedYear !== currentYear || contract.entities.filter((entity) => entity.kind === 'player').length !== 1 ||
    contract.entities.some((entity) => entity.kind !== 'player' && !(entity.kind === 'team' && entity.role === 'subject')) ||
    contract.requested_output.length !== 1 || !output || !['batting_statistics', 'pitching_statistics'].includes(output.kind) ||
    time.date_from !== null || time.date_to !== null || (time.relative !== null && time.relative !== 'current_season') || contract.predicates.length ||
    contract.competition_scope.level === 'farm' || contract.competition_scope.competitions.length) return null
  const historicalContract: QueryContract = { ...contract, requested_output: [{ kind: 'player_information', fields: ['name'] }],
    temporal_scope: { ...time, years: [], year_from: null, year_to: null, relative: null } }
  const historical = (await resolveContractPlayers(service, historicalContract))[0]
  if (!historical || historical.resolution.status !== 'resolved' || !historical.resolution.player_id) return null
  const player = historical.resolution
  const profiles = await service.searchPlayerInformation({ player_id: player.player_id!, player_name: player.name ?? player.input, includeCareer: true })
  if (profiles.length !== 1 || profiles[0]!.playerId !== player.player_id) return null
  const profile = profiles[0]!, domain = output.kind === 'batting_statistics' ? 'batting' : 'pitching'
  const records = (profile.annualStatistics ?? []).filter((row) => row.kind === domain && row.sourceUrl === `https://npb.jp/bis/players/${player.player_id}.html`)
  const latestYear = Math.max(...records.map((row) => row.year))
  if (!Number.isInteger(latestYear) || latestYear >= requestedYear) return null
  const latest = records.filter((row) => row.year === latestYear)
  // A multi-stint/period season needs a separate reducer, never an arbitrary row.
  if (latest.length !== 1) return null
  const record = latest[0]!, stats = officialProfileMetricStats(domain, record.metrics)
  const team = identityFiltersForContract(contract).team
  if (team && (!record.team || !matchesGameTeamFilter(record.team, team))) return null
  if (!Number.isInteger(stats.games) || stats.games! < 0) return null
  const effective: QueryContract = { ...contract, temporal_scope: { ...time, years: [latestYear], year_from: null, year_to: null, relative: null } }
  const operations = compileQueryContract(effective)
  if (operations.length !== 1) return null
  const query = applyResolvedIds(operations[0]!.query, [historical])
  const results = emptyResults()
  results.aggregates = [{ kind: domain, label: profile.name, total: stats.games!, stats: { ...stats, playerId: profile.playerId, year: latestYear, team: record.team } }]
  const summary = formatContractStatistics({ contract: effective, query, rows: results.aggregates, playerName: profile.name })
  if (!summary) return null
  return chatResponseCoreSchema.parse({ message, structured_query: null, results, sources: [], answer: {
    query_contract: contract, scope_fallback: { requested_year: requestedYear, evidence_year: latestYear, reason: 'latest_verified_npb_season', effective_contract: effective },
    summary: `${profile.name.replace(/\s+/gu, '')}の${requestedYear}年度のNPB成績は確認できません。参考として、公式プロフィールで確認できる最終在籍年度（${latestYear}年）の記録です。${summary.replaceAll('\n', ' ')}`,
    result_count: 1, source_urls: [record.sourceUrl], resolved_player: player,
  } })
}

export async function resolveContractPlayers(service: Pick<ChatQueryService, 'searchPlayerCandidates'>, contract: QueryContract, selection?: ChatRequest['selected_player']): Promise<ResolvedEntity[]> {
  const scope = identityFiltersForContract(contract)
  const resolutions: ResolvedEntity[] = []
  for (const entity of contract.entities.filter((entity) => entity.kind === 'player')) {
    const input = normalizeFreeText(entity.mention) ?? entity.mention
    const datedTeam = Boolean(scope.team && (scope.year || scope.year_from || scope.year_to))
    const raw = await service.searchPlayerCandidates({ ...scope, name: input, aliases: [input],
      scopeToEvidence: datedTeam, dictionaryOnly: true, searchDomain: 'all', includeEvents: false, limit: 51,
    })
    let candidates = raw.filter((candidate) => candidate.player_id)
    const aliasMatches = candidates.filter((candidate) => candidate.matched_aliases?.some((alias) => compact(alias).startsWith(compact(input))))
    const nonPrefixAliases = aliasMatches.filter((candidate) => !compact(candidate.name).startsWith(compact(input)))
    const exactNonPrefixAliases = nonPrefixAliases.filter((candidate) => candidate.matched_aliases?.some((alias) => compact(alias) === compact(input)))
    const surname = candidates.filter((candidate) => candidate.name.normalize('NFKC').trim().split(/[\s\u3000]+/u)[0] === input.normalize('NFKC'))
    const exact = candidates.filter((candidate) => compact(candidate.name) === compact(input))
    if (exact.length) candidates = [...new Map([...exact, ...exactNonPrefixAliases].map((candidate) => [candidate.player_id, candidate])).values()]
    else if (surname.length) candidates = [...new Map([...surname, ...nonPrefixAliases].map((candidate) => [candidate.player_id, candidate])).values()]
    else candidates = candidates.filter((candidate) => compact(candidate.name).startsWith(compact(input)) || aliasMatches.includes(candidate))
    if (datedTeam) candidates = candidates.filter((candidate) => candidate.years.some((year) =>
      (!scope.year || year === scope.year) && (!scope.year_from || year >= scope.year_from) && (!scope.year_to || year <= scope.year_to) &&
      (contract.temporal_scope.years.length === 0 || contract.temporal_scope.years.includes(year))) && candidate.teams.some((team) => matchesGameTeamFilter(team, scope.team!)))
    candidates = [...new Map(candidates.map((candidate) => [candidate.player_id, candidate])).values()]
    const selected = Boolean(selection && compact(selection.mention) === compact(entity.mention))
    if (selected) candidates = candidates.filter((candidate) => candidate.player_id === selection!.player_id)
    const unique = candidates.length === 1 && (selected || raw.length < 51) ? candidates[0]! : null
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
