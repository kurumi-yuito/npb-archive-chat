import type { ChatSource } from '@npb/schemas'

/** playbyplay を最優先し、同一 game 内では index → box → roster の順 */
const SOURCE_KEY_ORDER: Record<ChatSource['source_key'], number> = {
  playbyplay: 0,
  index: 1,
  box: 2,
  roster: 3,
}

export function sortSourcesPlaybyplayFirst(sources: ChatSource[]): ChatSource[] {
  return [...sources].sort((a, b) => {
    const byKey = SOURCE_KEY_ORDER[a.source_key] - SOURCE_KEY_ORDER[b.source_key]
    if (byKey !== 0) return byKey
    return a.game_id.localeCompare(b.game_id)
  })
}
