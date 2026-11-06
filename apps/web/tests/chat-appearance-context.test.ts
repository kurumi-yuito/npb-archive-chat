import { describe, expect, it, vi } from 'vitest'
import type { ChatQueryService, EventRow, PitchingLineRow } from '@npb/db'
import { searchOpponentStarters } from '../server/services/chat-appearance-context'

const appearance: PitchingLineRow = { gameId: 'fixture', gameDate: '2025-06-01', team: '阪神', pitcherName: '対象',
  inningsPitched: '5.2', pitchCount: 90, strikeouts: 6, runs: 2, earnedRuns: 2, sourceKind: 'box' }
const game = { gameId: 'fixture', date: '2025-06-01', venue: '甲子園', competition: '公式戦', homeTeamName: '阪神タイガース', awayTeamName: '読売ジャイアンツ', matchupText: '', linescoreJson: '{}' }
const note = (half: 'top' | 'bottom', pitcherName: string): EventRow => ({ gameId: game.gameId, gameDate: game.date,
  sequence: half === 'top' ? 1 : 2, inning: 1, half, offenseTeam: half === 'top' ? game.awayTeamName : game.homeTeamName,
  eventType: 'game_note', eventSubtype: 'starting_pitcher', pitcherName, batterName: null, runnerName: null,
  resultText: `（先発投手）${pitcherName}`, eventAttributesJson: null, sourceUrl: 'https://npb.jp/scores/2025/0601/g-t-01/playbyplay.html' })
function repository(notes: EventRow[] = [note('top', '味方先発'), note('bottom', '相手先発')]) {
  return { searchGameDetails: vi.fn().mockResolvedValue([game]), searchEvents: vi.fn().mockResolvedValue(notes) }
}
describe('B11 appearance-dependent opponent starter evidence', () => {
  it.each([['阪神', '相手先発'], ['巨人', '味方先発']])('selects the opposite defending half for %s', async (team, name) => {
    const query = repository()
    const result = await searchOpponentStarters(query as unknown as ChatQueryService, [{ ...appearance, team }])
    expect(query.searchGameDetails).toHaveBeenCalledWith({ game_id: 'fixture', limit: 2 })
    expect(query.searchEvents).toHaveBeenCalledWith({ game_id: 'fixture', event_subtype: 'starting_pitcher', limit: 3 })
    expect(result.events).toHaveLength(1)
    expect(result.events[0]!.pitcherName).toBe(name)
    expect(result.description).toContain(`相手先発は${name}`)
  })
  it('reports missing official notes instead of substituting a reliever or the subject pitcher', async () => {
    const result = await searchOpponentStarters(repository([]) as unknown as ChatQueryService, [appearance])
    expect(result.events).toEqual([])
    expect(result.description).toContain('確認できません')
  })
  it('rejects an unrelated game returned by the second-stage repository', async () => {
    const wrong = { ...note('bottom', '別試合'), gameId: 'other' }
    await expect(searchOpponentStarters(repository([wrong]) as unknown as ChatQueryService, [appearance])).rejects.toThrow('starter_evidence_scope_mismatch')
  })
  it('refuses contradictory extra starters rather than hiding an internal result limit', async () => {
    await expect(searchOpponentStarters(repository([note('top', '甲'), note('bottom', '乙'), note('bottom', '丙')]) as unknown as ChatQueryService, [appearance])).rejects.toThrow('starter_evidence_conflict')
  })
})
