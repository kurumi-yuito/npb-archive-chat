import { describe, it, expect } from 'vitest'
import { sortSourcesPlaybyplayFirst } from '../utils/chat-sources'

describe('sortSourcesPlaybyplayFirst', () => {
  it('orders playbyplay before other source keys', () => {
    const sorted = sortSourcesPlaybyplayFirst([
      { game_id: 'a', source_key: 'index', source_url: 'https://x/a/index' },
      { game_id: 'a', source_key: 'playbyplay', source_url: 'https://x/a/pbp' },
      { game_id: 'a', source_key: 'roster', source_url: 'https://x/a/roster' },
    ])
    expect(sorted.map((s) => s.source_key)).toEqual(['playbyplay', 'index', 'roster'])
  })

  it('sorts by game_id when source_key matches', () => {
    const sorted = sortSourcesPlaybyplayFirst([
      { game_id: 'b', source_key: 'playbyplay', source_url: 'https://x/b/pbp' },
      { game_id: 'a', source_key: 'playbyplay', source_url: 'https://x/a/pbp' },
    ])
    expect(sorted.map((s) => s.game_id)).toEqual(['a', 'b'])
  })
})
