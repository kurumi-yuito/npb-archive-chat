import { describe, expect, it, vi } from 'vitest'
import type { ChatStructuredQuery, PlayerCandidate } from '@npb/schemas'
import type { ChatQueryService } from '@npb/db'
import {
  resolvePlayer,
  resolveCurrentPlayer,
  resolveHistoricalPlayer,
  resolvePlayers,
  buildIdentityResolutionMetadata,
  resolveAlias,
  resolveSourceUrl,
} from '../server/services/player-identity'

function createQueryService(candidates: PlayerCandidate[]): ChatQueryService {
  return {
    searchPlayerCandidates: vi.fn().mockResolvedValue(candidates),
  } as unknown as ChatQueryService
}

describe('player-identity facade', () => {
  it('resolves alias candidates through the facade without changing ranking behavior', async () => {
    const queryService = createQueryService([
      {
        player_id: 'yamada',
        name: '山田太郎',
        primary_team: 'ヤクルト',
        roles: ['batter'],
        teams: ['ヤクルト'],
        years: [2025],
      },
    ])
    const structuredQuery: ChatStructuredQuery = {
      intent: 'search_batting',
      filters: {
        player_name: '山田太郎',
        team: 'ヤクルト',
      },
    }

    const result = await resolvePlayer(queryService, structuredQuery)

    expect(queryService.searchPlayerCandidates).toHaveBeenCalledWith(expect.objectContaining({
      name: '山田太郎',
        aliases: ['山田太郎'],
    }))
    expect(result.resolution?.player_id).toBe('yamada')
    expect(result.resolution?.status).toBe('resolved')
  })

  it('wraps existing player resolution results with identity metadata', async () => {
    const queryService = createQueryService([
      {
        player_id: 'yamamura',
        name: '山村',
        primary_team: 'ロッテ',
        roles: ['batter'],
        teams: ['ロッテ'],
        years: [2025],
      },
    ])
    const structuredQuery: ChatStructuredQuery = {
      intent: 'search_batting',
      filters: {
        player_name: '山村',
        team: 'ロッテ',
      },
    }

    const result = await resolvePlayer(queryService, structuredQuery)

    expect(result.resolution?.player_id).toBe('yamamura')
    expect(result.resolution?.identityResolution).toMatchObject({
      path: 'candidate_search',
      field: 'player_name',
      input: '山村',
      status: 'resolved',
      playerId: 'yamamura',
      candidateCount: 1,
      candidatePlayerIds: ['yamamura'],
      candidateNames: ['山村'],
      hasTeamFilter: true,
      hasYearFilter: false,
    })
  })

  it('uses an explicit surname boundary in a profile to exclude longer different surnames', async () => {
    const queryService = createQueryService([
      {
        player_id: 'maki-shugo',
        name: '牧 秀悟',
        primary_team: 'DeNA',
        roles: ['profile', 'batter'],
        teams: ['DeNA'],
        years: [2026],
      },
      {
        player_id: 'makihara',
        name: '牧原大',
        primary_team: 'ソフトバンク',
        roles: ['batter'],
        teams: ['ソフトバンク'],
        years: [2026],
      },
      {
        player_id: 'makino',
        name: '牧野',
        primary_team: '中日',
        roles: ['batter'],
        teams: ['中日'],
        years: [2026],
      },
    ])

    const result = await resolvePlayer(queryService, {
      intent: 'aggregate_batting',
      filters: { player_name: '牧', year: 2026 },
    })

    expect(result.resolution).toMatchObject({
      status: 'resolved',
      player_id: 'maki-shugo',
      name: '牧 秀悟',
    })
  })

  it('does not satisfy a full name with a unique surname-only candidate', async () => {
    const queryService = createQueryService([{
      player_id: 'different-murakami',
      name: '村上',
      primary_team: '阪神',
      roles: ['batter'],
      teams: ['阪神'],
      years: [2026],
    }])

    const result = await resolvePlayer(queryService, {
      intent: 'aggregate_batting',
      filters: { player_name: '村上宗隆', year: 2026 },
    })

    expect(result.resolution).toMatchObject({
      input: '村上宗隆',
      status: 'not_found',
    })
  })

  it('resolves a verified full-name alias only through its known historical team', async () => {
    const queryService = createQueryService([
      {
        player_id: 'murakami-munetaka',
        name: '村上',
        primary_team: '東京ヤクルトスワローズ',
        roles: ['batter'],
        teams: ['東京ヤクルトスワローズ'],
        years: [2019, 2020, 2021, 2022, 2023, 2024, 2025],
      },
      {
        player_id: 'different-murakami',
        name: '村上',
        primary_team: '阪神タイガース',
        roles: ['batter'],
        teams: ['阪神タイガース'],
        years: [2026],
      },
    ])

    const result = await resolveHistoricalPlayer(queryService, {
      intent: 'aggregate_batting',
      filters: { player_name: '村上宗隆', year_from: 2019, year_to: 2025 },
    })

    expect(result.resolution).toMatchObject({
      input: '村上宗隆',
      player_id: 'murakami-munetaka',
      status: 'resolved',
    })
  })

  it('merges exact historical surname rows into one canonical profile across transfers', async () => {
    const queryService = createQueryService([
      {
        player_id: 'fujinami',
        name: '藤浪 晋太郎',
        primary_team: 'DeNA',
        roles: ['profile', 'pitcher'],
        teams: ['DeNA'],
        years: [2025, 2026],
      },
      {
        player_id: null,
        name: '藤浪',
        primary_team: '阪神',
        roles: ['pitcher'],
        teams: ['阪神'],
        years: [2016, 2017, 2018, 2019, 2020, 2021, 2022],
      },
      {
        player_id: null,
        name: '藤浪',
        primary_team: 'DeNA',
        roles: ['pitcher'],
        teams: ['DeNA'],
        years: [2025],
      },
    ])

    const result = await resolvePlayer(queryService, {
      intent: 'aggregate_pitching',
      filters: { pitcher_name: '藤浪' },
    })

    expect(result.resolution).toMatchObject({
      status: 'resolved',
      player_id: 'fujinami',
      name: '藤浪 晋太郎',
      candidates: [expect.objectContaining({
        player_id: 'fujinami',
        teams: ['DeNA', '阪神'],
      })],
    })
  })

  it('resolves multiple players through the facade', async () => {
    const queryService = createQueryService([
      {
        player_id: 'yamamura',
        name: '山村',
        primary_team: 'ロッテ',
        roles: ['batter'],
        teams: ['ロッテ'],
        years: [2025],
      },
    ])

    const results = await resolvePlayers(queryService, [
      {
        intent: 'search_batting',
        filters: { player_name: '山村', team: 'ロッテ' },
      },
      {
        intent: 'search_batting',
        filters: { player_name: '山村', team: 'ロッテ' },
      },
    ])

    expect(results).toHaveLength(2)
    expect(results[0]?.resolution?.identityResolution.path).toBe('candidate_search')
    expect(results[1]?.resolution?.identityResolution.path).toBe('candidate_search')
  })

  it('builds identity metadata for explicit player ids without changing resolution rules', () => {
    const metadata = buildIdentityResolutionMetadata(
      {
        intent: 'search_batting',
        filters: {
          player_id: '12345',
          player_name: '山村',
          year: 2025,
        },
      },
      null,
    )

    expect(metadata).toMatchObject({
      path: 'explicit_player_id',
      field: 'player_name',
      input: '山村',
      status: 'skipped',
      playerId: '12345',
      hasYearFilter: true,
      context: {
        scope: 'unspecified',
        team: null,
        season: 2025,
        hasTeamFilter: false,
        hasYearFilter: true,
      },
    })
  })

  it('annotates current player resolution metadata with current scope', async () => {
    const queryService = createQueryService([
      {
        player_id: 'yamamura',
        name: '山村',
        primary_team: 'ロッテ',
        roles: ['batter'],
        teams: ['ロッテ'],
        years: [2025],
      },
    ])

    const result = await resolveCurrentPlayer(queryService, {
      intent: 'search_batting',
      filters: {
        player_name: '山村',
        team: 'ロッテ',
      },
    })

    expect(result.resolution?.identityResolution.context).toMatchObject({
      scope: 'current',
      team: 'ロッテ',
      season: null,
      hasTeamFilter: true,
      hasYearFilter: false,
    })
  })

  it('annotates historical player resolution metadata with historical scope', async () => {
    const queryService = createQueryService([
      {
        player_id: 'yamamura',
        name: '山村',
        primary_team: 'ロッテ',
        roles: ['batter'],
        teams: ['ロッテ'],
        years: [2025],
      },
    ])

    const result = await resolveHistoricalPlayer(queryService, {
      intent: 'search_batting',
      filters: {
        player_name: '山村',
        team: 'ロッテ',
        year: 2025,
      },
    })

    expect(result.resolution?.identityResolution.context).toMatchObject({
      scope: 'historical',
      team: 'ロッテ',
      season: 2025,
      hasTeamFilter: true,
      hasYearFilter: true,
    })
  })

  it('exports alias resolution for downstream callers', () => {
    const alias = resolveAlias('山田太郎')

    expect(alias.aliases).toEqual(['山田太郎'])
    expect(alias.metadata.status).toBe('resolved')
  })

  it('exports source url resolution for downstream callers', () => {
    const result = resolveSourceUrl('https://npb.jp/bis/players/41045137.html#profile')

    expect(result.playerId).toBe('41045137')
    expect(result.metadata.kind).toBe('player_profile')
  })
})
