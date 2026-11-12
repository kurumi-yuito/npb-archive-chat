import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { queryContractSchema, type QueryContract } from '@npb/schemas'
import { createSingleDatabaseQueryService } from '@npb/db'
import { openDatabase } from '../../../packages/db/src/sqlite'
import { migrateDatabase } from '../../../packages/db/src/migrations'
import { sqliteDatabaseToQuery } from '../../../packages/db/src/query-driver'
import { captureOfficialPlayerProfile } from '../../../packages/db/src/official-player-profile'
import type { ObjectStorage } from '../../../packages/db/src/object-storage'
import { createContractChatService } from '../server/services/chat-contract-service'

const meaning = queryContractSchema.parse(JSON.parse(readFileSync(new URL('../../../docs/eval-query-contracts.json', import.meta.url), 'utf8')).cases[0].meaning)
const contract: QueryContract = { ...meaning, requested_output: [{ kind: 'pitching_statistics', fields: ['wins'] }],
  entities: [{ kind: 'player', role: 'subject', mention: '検証太郎' }], predicates: [], aggregation: [{ operation: 'sum', field: 'wins' }],
  temporal_scope: { ...meaning.temporal_scope, years: [], relative: 'career' } }
const html = `<title>検証 太郎（阪神） | 個人年度別成績</title><meta property="og:url" content="http://npb.jp/bis/players/proof-id.html"><time>2026年シーズン終了時</time>
<table><tr><th>年度</th><th>所属球団</th><th>登板</th><th>勝利</th><th>投球回</th><th>防御率</th></tr>
<tr><td>2025</td><td>阪神</td><td>10</td><td>2</td><td>30 .1</td><td>2.00</td></tr>
<tr><td>2026</td><td>阪神</td><td>11</td><td>3</td><td>40 .2</td><td>2.00</td></tr>
<tr><th></th><th>通 算</th><th>21</th><th>5</th><th>71</th><th>2.00</th></tr></table>`

describe('official career source to answer', () => {
  it('Q05 compares verified club career ERA from summed earned runs and outs', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const source = `<title>検証 太郎（巨人） | 個人年度別成績</title><meta property="og:url" content="http://npb.jp/bis/players/proof-id.html">
        <table><tr><th>年度</th><th>所属球団</th><th>登板</th><th>勝利</th><th>投球回</th><th>自責点</th><th>防御率</th></tr>
        <tr><td>2024</td><td>阪神</td><td>2</td><td>1</td><td>30 .1</td><td>10</td><td>2.97</td></tr>
        <tr><td>2025</td><td>阪神</td><td>1</td><td>0</td><td>0 .2</td><td>1</td><td>13.50</td></tr>
        <tr><td>2026</td><td>読売</td><td>3</td><td>1</td><td>10</td><td>10</td><td>9.00</td></tr>
        <tr><th></th><th>通算</th><th>6</th><th>2</th><th>41</th><th>21</th><th>4.61</th></tr></table>`
      await captureOfficialPlayerProfile({ playerId: 'proof-id', database,
        storage: { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage,
        fetch: vi.fn(async () => new Response(source)) as unknown as typeof fetch })
      const { version: _version, requested_output: _output, ...scope } = contract
      void _version; void _output
      const outputs = ['阪神', '巨人'].map((team) => ({ kind: 'pitching_statistics', fields: ['era'],
        scope: { ...scope, aggregation: [], entities: [...contract.entities, { kind: 'team', role: 'subject', mention: team }] } }))
      const requested = queryContractSchema.parse({ ...contract, aggregation: [], requested_output: outputs })
      const service = createSingleDatabaseQueryService(sqliteDatabaseToQuery(database))
      const aggregate = vi.spyOn(service, 'aggregatePitchingLines')
      const response = await createContractChatService(service, async () => ({ domain: 'npb', policy: 'execute',
        query_contract: requested, clarification_reason: null, subject: null })).answerQuestion('検証太郎の阪神と巨人時代の防御率を比較して')
      expect(aggregate).not.toHaveBeenCalled()
      expect(response.results.aggregates.map((row) => row.stats.era)).toEqual([11 * 9 / 31, 9])
      expect(response.answer.summary).toContain('防御率3.19')
      expect(response.answer.summary).toContain('防御率9.00')
      expect(response.answer.summary).toContain('最も低いのは阪神在籍期間（2024〜2025年）')
      expect(response.answer.summary).toContain('差は5.81')
      expect(response.answer.source_urls).toEqual(['https://npb.jp/bis/players/proof-id.html'])
    } finally { database.close() }
  })
  it('Q08 retains a club and every year including zero in a verified annual career projection', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const source = `<title>検証 太郎（巨人） | 個人年度別成績</title><meta property="og:url" content="http://npb.jp/bis/players/proof-id.html">
        <table><tr><th>年度</th><th>所属球団</th><th>試合</th><th>打数</th><th>安打</th><th>本塁打</th></tr>
        <tr><td>2024</td><td>阪神</td><td>2</td><td>8</td><td>1</td><td>0</td></tr>
        <tr><td>2025</td><td>阪神</td><td>3</td><td>12</td><td>3</td><td>2</td></tr>
        <tr><td>2026</td><td>読売</td><td>4</td><td>16</td><td>6</td><td>5</td></tr>
        <tr><th></th><th>通算</th><th>9</th><th>36</th><th>10</th><th>7</th></tr></table>`
      await captureOfficialPlayerProfile({ playerId: 'proof-id', database,
        storage: { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage,
        fetch: vi.fn(async () => new Response(source)) as unknown as typeof fetch })
      const requested: QueryContract = { ...contract, entities: [...contract.entities, { kind: 'team', role: 'subject', mention: '阪神' }],
        grouping: ['year'], aggregation: [], requested_output: [{ kind: 'batting_statistics', fields: ['homeRuns'] }] }
      const response = await createContractChatService(createSingleDatabaseQueryService(sqliteDatabaseToQuery(database)), async () => ({
        domain: 'npb', policy: 'execute', query_contract: requested, clarification_reason: null, subject: null,
      })).answerQuestion('検証太郎の阪神時代の年別本塁打数は？')
      expect(response.results.aggregates.map((row) => [row.stats.year, row.stats.homeRuns])).toEqual([[2024, 0], [2025, 2]])
      expect(response.answer.summary).toContain('2024年：検証太郎（阪神）：本塁打0本')
      expect(response.answer.summary).toContain('2025年：検証太郎（阪神）：本塁打2本')
      expect(response.answer.summary).not.toContain('2026年：')
      const bounded: QueryContract = { ...requested, entities: contract.entities, grouping: [],
        temporal_scope: { ...requested.temporal_scope, relative: null, year_from: 2024, year_to: 2025 },
        requested_output: [{ kind: 'batting_statistics', fields: ['battingAverage', 'homeRuns'] }] }
      const boundedService = createSingleDatabaseQueryService(sqliteDatabaseToQuery(database))
      const partialArchive = vi.spyOn(boundedService, 'aggregateBattingLines')
      const boundedResponse = await createContractChatService(boundedService, async () => ({ domain: 'npb', policy: 'execute',
        query_contract: bounded, clarification_reason: null, subject: null })).answerQuestion('検証太郎の2024年から2025年の通算打率と本塁打数')
      expect(partialArchive).not.toHaveBeenCalled()
      expect(boundedResponse.results.aggregates[0]?.stats).toMatchObject({ homeRuns: 2, battingAverage: 4 / 20, yearFrom: 2024, yearTo: 2025 })
      expect(boundedResponse.answer.summary).toContain('2024〜2025年度')
      expect(boundedResponse.answer.summary).toContain('打率0.200')
      const farm: QueryContract = { ...requested, competition_scope: { level: 'farm', competitions: [] } }
      const unavailable = await createContractChatService(createSingleDatabaseQueryService(sqliteDatabaseToQuery(database)), async () => ({
        domain: 'npb', policy: 'execute', query_contract: farm, clarification_reason: null, subject: null,
      })).answerQuestion('検証太郎の阪神時代の二軍の年別本塁打数は？')
      expect(unavailable.results.aggregates).toEqual([])
      expect(unavailable.answer.summary).toContain('算出できません')
    } finally { database.close() }
  })
  it('Q188 renders appearance counts and fractional career innings from the complete real official table', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const html = readFileSync(new URL('../../../packages/parser/src/__fixtures__/bis-player-nested-innings.html', import.meta.url), 'utf8')
      await captureOfficialPlayerProfile({ playerId: '01003821', database,
        storage: { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage,
        fetch: vi.fn(async () => new Response(html)) as unknown as typeof fetch })
      const requested: QueryContract = { ...contract, entities: [{ kind: 'player', role: 'subject', mention: '板東里視' }],
        requested_output: [{ kind: 'pitching_statistics', fields: ['games_pitched', 'innings_pitched'] }], aggregation: [] }
      const result = await createContractChatService(createSingleDatabaseQueryService(sqliteDatabaseToQuery(database)), async () => ({
        domain: 'npb', policy: 'execute', query_contract: requested, clarification_reason: null, subject: null,
      })).answerQuestion('板東里視のNPB通算の登板数と投球回を教えて')
      expect(result.answer.summary).toContain('登板579')
      expect(result.answer.summary).toContain('投球回1746回 1/3')
      expect(result.answer.source_urls).toEqual(['https://npb.jp/bis/players/01003821.html'])
    } finally { database.close() }
  })
  it('retains both verified batting and pitching requests in a last-season supplement', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const batting = `<table><tr><th>年度</th><th>所属球団</th><th>試合</th><th>打数</th><th>安打</th><th>本塁打</th></tr>
        <tr><td>2023</td><td>阪神</td><td>5</td><td>10</td><td>3</td><td>1</td></tr>
        <tr><td>2024</td><td>阪神</td><td>6</td><td>20</td><td>5</td><td>2</td></tr>
        <tr><th></th><th>通算</th><th>11</th><th>30</th><th>8</th><th>3</th></tr></table>`
      await captureOfficialPlayerProfile({ playerId: 'proof-id', database,
        storage: { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage,
        fetch: vi.fn(async () => new Response(html.replaceAll('2025', '2023').replaceAll('2026', '2024') + batting)) as unknown as typeof fetch,
        now: () => new Date('2026-11-04T00:00:00Z') })
      const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date()))
      const requested: QueryContract = { ...contract, requested_output: [{ kind: 'batting_statistics', fields: ['home_runs'] }, { kind: 'pitching_statistics', fields: ['wins'] }],
        aggregation: [], temporal_scope: { ...contract.temporal_scope, years: [year], relative: null } }
      const service = createSingleDatabaseQueryService(sqliteDatabaseToQuery(database))
      const chat = createContractChatService(service, async () => ({ domain: 'npb', policy: 'execute', query_contract: requested, clarification_reason: null, subject: null }))
      const result = await chat.answerQuestion('検証太郎の今季の打撃・投手成績')
      expect(result.answer.query_contract).toEqual(requested)
      expect(result.answer.scope_fallback?.effective_contract.requested_output).toEqual(requested.requested_output)
      expect(result.results.aggregates).toHaveLength(2)
      expect(result.answer.summary).toContain('本塁打2本')
      expect(result.answer.summary).toContain('勝利数は3勝です')
      expect(result.results.aggregates.every((row) => row.stats.year === 2024)).toBe(true)
    } finally { database.close() }
  })
  it.each([[true, null], [false, null], [false, 'current_season'], [true, 'current_season']] as const)('labels the last verified NPB season separately while retaining the requested scope (explicit year: %s, relative: %s)', async (explicitYear, relative) => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      const earlier = html.replaceAll('2025', '2023').replaceAll('2026', '2024')
      await captureOfficialPlayerProfile({ playerId: 'proof-id', database,
        storage: { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage,
        fetch: vi.fn(async () => new Response(earlier)) as unknown as typeof fetch, now: () => new Date('2026-11-04T00:00:00Z') })
      const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date()))
      const requested: QueryContract = { ...contract, temporal_scope: { ...contract.temporal_scope, years: explicitYear ? [year] : [], relative } }
      const service = createSingleDatabaseQueryService(sqliteDatabaseToQuery(database))
      const chat = createContractChatService(service, async () => ({ domain: 'npb', policy: 'execute', query_contract: requested, clarification_reason: null, subject: null }))
      const result = await chat.answerQuestion('検証太郎の今季の勝利数')
      expect(result.answer.query_contract).toEqual(requested)
      expect(result.answer.scope_fallback, JSON.stringify(result.answer)).toMatchObject({ requested_year: year, evidence_year: 2024, reason: 'latest_verified_npb_season' })
      expect(result.answer.summary).toContain(`${year}年度のNPB成績は確認できません`)
      expect(result.answer.summary).toContain('最終在籍年度（2024年）')
      expect(result.results.aggregates[0]!.stats).toMatchObject({ wins: 3, year: 2024 })
      expect(result.answer.source_urls).toEqual(['https://npb.jp/bis/players/proof-id.html'])
      expect(result.answer.scope_fallback?.effective_contract.temporal_scope.relative).toBeNull()
      const scoped = { ...requested, entities: [...requested.entities, { kind: 'team' as const, role: 'subject' as const, mention: 'DeNA' }] }
      const teamChat = createContractChatService(service, async () => ({ domain: 'npb', policy: 'execute', query_contract: scoped, clarification_reason: null, subject: null }))
      const rejected = await teamChat.answerQuestion('DeNAの検証太郎の今季の勝利数')
      expect(rejected.answer.scope_fallback).toBeUndefined()
      expect(rejected.results.aggregates).toHaveLength(0)
    } finally { database.close() }
  })
  it('checks prior-year club evidence before mixing historical namesakes into a current-season supplement', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      for (const [playerId, source] of [
        ['proof-id', html.replaceAll('2025', '2024').replaceAll('2026', '2025')],
        ['older-id', html.replaceAll('proof-id', 'older-id').replaceAll('太郎', '次郎').replaceAll('2025', '2010').replaceAll('2026', '2011')],
      ]) {
        await captureOfficialPlayerProfile({ playerId: playerId!, database,
          storage: { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage,
          fetch: vi.fn(async () => new Response(source)) as unknown as typeof fetch, now: () => new Date('2026-11-04T00:00:00Z') })
      }
      const requested: QueryContract = { ...contract, entities: [{ kind: 'player', role: 'subject', mention: '検証' },
        { kind: 'team', role: 'subject', mention: '阪神' }], aggregation: [],
        temporal_scope: { ...contract.temporal_scope, years: [2026], relative: null } }
      const service = createSingleDatabaseQueryService(sqliteDatabaseToQuery(database))
      const response = await createContractChatService(service, async () => ({ domain: 'npb', policy: 'execute',
        query_contract: requested, clarification_reason: null, subject: null })).answerQuestion('阪神の検証の今季の勝利数')
      expect(response.answer.scope_fallback).toMatchObject({ requested_year: 2026, evidence_year: 2025 })
      expect(response.answer.resolved_player?.player_id).toBe('proof-id')
      expect(response.results.aggregates[0]!.stats.wins).toBe(3)
      expect(response.answer.query_contract).toEqual(requested)
    } finally { database.close() }
  })
  it('uses the reconciled footer and its source without scanning appearance facts or describing an unrequested ERA', async () => {
    const database = openDatabase()
    try {
      migrateDatabase(database)
      await captureOfficialPlayerProfile({ playerId: 'proof-id', database,
        storage: { putText: vi.fn().mockResolvedValue('stored') } as unknown as ObjectStorage,
        fetch: vi.fn(async () => new Response(html)) as unknown as typeof fetch, now: () => new Date('2026-11-04T00:00:00Z') })
      const driver = sqliteDatabaseToQuery(database)
      const queries: string[] = []
      const service = createSingleDatabaseQueryService({ ...driver, prepare(sql) { queries.push(sql); return driver.prepare(sql) } })
      const chat = createContractChatService(service, async () => ({ domain: 'npb', policy: 'execute', query_contract: contract, clarification_reason: null, subject: null }))
      const result = await chat.answerQuestion('検証太郎のNPB通算勝利数')
      expect(result.answer.summary).toContain('検証太郎：勝利数は5勝です')
      expect(result.answer.summary).toContain('2026年シーズン終了時')
      expect(result.answer.summary).toContain('NPB以外のリーグでの成績は対象外')
      expect(result.answer.summary).not.toContain('防御率')
      expect(result.answer.source_urls).toContain('https://npb.jp/bis/players/proof-id.html')
      expect(result.results.aggregates[0]!.stats.wins).toBe(5)
      expect(queries.some((sql) => /\b(?:pitching_lines|pitching_line_facts|batting_lines|batting_line_facts)\b/u.test(sql))).toBe(false)
      expect(result.answer.execution_metadata?.repositories).toContain('searchPlayerInformation')
      expect(result.answer.execution_metadata?.repositories).not.toContain('aggregatePitchingLines')
    } finally { database.close() }
  })
})
