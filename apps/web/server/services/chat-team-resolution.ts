import { teamMentionCandidates } from '@npb/db'
import { normalizeTeamName } from './chat-query-normalizer'
import { competitionLeague } from './chat-competition-scope'

/** Resolve the semantic club constraint separately from basic text cleanup.
 * The original mention remains unchanged in the Query Contract. */
export function resolveContractTeamMention(value: string): string {
  const normalized = normalizeTeamName(value) ?? ''
  const league = competitionLeague(normalized)
  if (league) return league
  const candidates = teamMentionCandidates(normalized)
  return candidates.length === 1 ? candidates[0]! : normalized
}
