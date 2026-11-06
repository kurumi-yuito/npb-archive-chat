import type { ChatQueryService, PitchingLineRow } from '@npb/db'
import { matchesGameTeamFilter } from '@npb/db'
import type { ChatResponseCore } from '@npb/schemas'
import { QueryContractCompileError } from './chat-contract-compiler'

/** Follow the selected appearance's game ID, never a second unanchored search. */
export async function searchOpponentStarters(service: Pick<ChatQueryService, 'searchGameDetails' | 'searchEvents'>, appearances: PitchingLineRow[]) {
  const events: ChatResponseCore['results']['events'] = []
  const games: ChatResponseCore['results']['gameDetails'] = []
  const descriptions: string[] = []
  if (appearances.length > 20) throw new QueryContractCompileError(['appearance_context_cost_limit'])
  for (const appearance of appearances) {
    const details = await service.searchGameDetails({ game_id: appearance.gameId, limit: 2 })
    const game = details.length === 1 && details[0]!.gameId === appearance.gameId && details[0]!.date === appearance.gameDate ? details[0]! : null
    if (!game) {
      descriptions.push(`${appearance.gameDate}の相手先発は、試合情報を照合できず確認できません。`)
      continue
    }
    const home = matchesGameTeamFilter(game.homeTeamName, appearance.team)
    const away = matchesGameTeamFilter(game.awayTeamName, appearance.team)
    if (home === away) throw new QueryContractCompileError(['appearance_game_team_mismatch'])
    games.push(game)
    const notes = await service.searchEvents({ game_id: game.gameId, event_subtype: 'starting_pitcher', limit: 3 })
    if (notes.length > 2) throw new QueryContractCompileError(['starter_evidence_conflict'])
    if (notes.some((row) => row.gameId !== game.gameId || row.gameDate !== game.date || row.eventSubtype !== 'starting_pitcher')) {
      throw new QueryContractCompileError(['starter_evidence_scope_mismatch'])
    }
    // A top-half starter defends for the home club; bottom-half for the away club.
    const opponents = notes.filter((row) => row.half === (home ? 'bottom' : 'top') && row.inning === 1 && row.pitcherName)
    const unique = [...new Map(opponents.map((row) => [row.pitcherName, row])).values()]
    if (unique.length !== 1) {
      descriptions.push(`${appearance.gameDate}の相手先発は、公式試合経過の先発記録から一意に確認できません。`)
      continue
    }
    const starter = unique[0]!
    if (!starter.sourceUrl || !/^https:\/\/npb\.jp\//u.test(starter.sourceUrl)) throw new QueryContractCompileError(['starter_official_source_required'])
    events.push(starter)
    descriptions.push(`${appearance.gameDate}の相手先発は${starter.pitcherName}（${home ? game.awayTeamName : game.homeTeamName}）です。`)
  }
  return { events, games, description: descriptions.join('\n') }
}
