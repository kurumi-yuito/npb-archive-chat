import { describe, expect, it } from 'vitest'
import { buildAliases, normalizeAliases, resolveAlias } from '../server/services/player-alias'

describe('player-alias', () => {
  it('builds normalized alias candidates with display-name prefixes for CJK names', () => {
    expect(buildAliases('  山田太郎  ')).toEqual(['山田太郎', '山田太', '山田'])
  })

  it('normalizes alias candidate lists', () => {
    expect(normalizeAliases([' 山田太郎 ', '山田太郎', undefined, ''])).toEqual(['山田太郎'])
  })

  it('keeps metadata on the public resolveAlias facade', () => {
    const result = resolveAlias('  山田太郎  ')

    expect(result.metadata).toMatchObject({
      input: '  山田太郎  ',
      normalizedInput: '山田太郎',
      aliases: ['山田太郎', '山田太', '山田'],
      fallbackAliases: ['山田太', '山田'],
      status: 'resolved',
    })
  })

  it('does not add display-name prefixes for short or non-CJK inputs', () => {
    expect(resolveAlias('Yamada')).toMatchObject({
      aliases: ['Yamada'],
      metadata: {
        status: 'resolved',
        fallbackAliases: [],
      },
    })
    expect(resolveAlias('藤浪')).toMatchObject({
      aliases: ['藤浪'],
      metadata: {
        status: 'resolved',
        fallbackAliases: [],
      },
    })
  })
})
