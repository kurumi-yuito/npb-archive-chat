import { describe, expect, it } from 'vitest'
import { normalizeSourceUrl, resolveSourceUrl } from '../server/services/player-source-url'

describe('player-source-url', () => {
  it('normalizes source urls as provenance and extracts player ids from profile urls', () => {
    const result = resolveSourceUrl(' https://npb.jp/bis/players/41045137.html#profile ')

    expect(normalizeSourceUrl(' https://npb.jp/bis/players/41045137.html#profile ')).toBe(
      'https://npb.jp/bis/players/41045137.html',
    )
    expect(result).toMatchObject({
      sourceUrl: 'https://npb.jp/bis/players/41045137.html',
      playerId: '41045137',
      metadata: {
        input: ' https://npb.jp/bis/players/41045137.html#profile ',
        normalizedSourceUrl: 'https://npb.jp/bis/players/41045137.html',
        playerId: '41045137',
        kind: 'player_profile',
        status: 'resolved',
      },
    })
  })

  it('keeps non-player urls as provenance without inventing player ids', () => {
    const result = resolveSourceUrl('https://npb.jp/scores/2025/0815/b-l-17/playbyplay.html#playbyplay-not-downloaded')

    expect(result).toMatchObject({
      sourceUrl: 'https://npb.jp/scores/2025/0815/b-l-17/playbyplay.html',
      playerId: null,
      metadata: {
        kind: 'provenance',
        status: 'resolved',
      },
    })
  })

  it('returns empty metadata for blank input', () => {
    expect(resolveSourceUrl('   ')).toMatchObject({
      sourceUrl: null,
      playerId: null,
      metadata: {
        normalizedSourceUrl: '',
        kind: 'provenance',
        status: 'empty',
      },
    })
  })
})
