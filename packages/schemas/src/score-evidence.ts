export function parseScoreTotal(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(number) && Number.isInteger(number) && number >= 0 ? number : null
}

/** A missing total is not a scoreless game. Shared by API and browser rendering. */
export function readKnownGameScore(value: string | null | undefined): { awayTeam: string; homeTeam: string; awayRuns: number; homeRuns: number } | null {
  if (!value) return null
  const object = (input: unknown): Record<string, unknown> => input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  try {
    const parsed = object(JSON.parse(value)), away = object(parsed.away), home = object(parsed.home)
    const legacy = parsed.runs !== undefined
    const awayTeam = legacy ? parsed.away_team : away.team, homeTeam = legacy ? parsed.home_team : home.team
    const awayRuns = parseScoreTotal(legacy ? object(parsed.runs).away : object(away.totals).runs)
    const homeRuns = parseScoreTotal(legacy ? object(parsed.runs).home : object(home.totals).runs)
    if (typeof awayTeam !== 'string' || !awayTeam.trim() || typeof homeTeam !== 'string' || !homeTeam.trim() || awayRuns === null || homeRuns === null) return null
    return { awayTeam, homeTeam, awayRuns, homeRuns }
  } catch { return null }
}
