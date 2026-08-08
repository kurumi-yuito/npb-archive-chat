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
