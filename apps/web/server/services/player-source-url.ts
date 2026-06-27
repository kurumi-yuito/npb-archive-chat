export type SourceUrlResolutionStatus = 'resolved' | 'empty'

export type SourceUrlResolutionKind = 'player_profile' | 'provenance'

export type SourceUrlResolutionMetadata = {
  input: string
  normalizedSourceUrl: string
  playerId: string | null
  kind: SourceUrlResolutionKind
  status: SourceUrlResolutionStatus
}

export type SourceUrlResolution = {
  sourceUrl: string | null
  playerId: string | null
  metadata: SourceUrlResolutionMetadata
}

export function normalizeSourceUrl(input: string): string {
  return input.trim().replace(/#.*$/u, '')
}

export function resolveSourceUrl(input: string): SourceUrlResolution {
  const normalizedSourceUrl = normalizeSourceUrl(input)
  const playerId = inferPlayerIdFromSourceUrl(normalizedSourceUrl)
  const kind: SourceUrlResolutionKind = playerId ? 'player_profile' : 'provenance'
  return {
    sourceUrl: normalizedSourceUrl || null,
    playerId,
    metadata: {
      input,
      normalizedSourceUrl,
      playerId,
      kind,
      status: normalizedSourceUrl ? 'resolved' : 'empty',
    },
  }
}

function inferPlayerIdFromSourceUrl(sourceUrl: string): string | null {
  const match = sourceUrl.match(/\/players\/([^/]+)\.html$/u)
  return match?.[1] ?? null
}
