import type { QueryDatabase } from '../query-driver'

export type AwardWinnerRow = {
  year: number
  awardType: string
  league: string
  playerName: string
  team: string
  sourceUrl: string
}

export async function searchAwardWinners(
  database: QueryDatabase,
  filters: { year: number; award_type: string },
): Promise<AwardWinnerRow[]> {
  const rows = await database
    .prepare(
      `SELECT
        year,
        award_type AS awardType,
        league,
        player_name AS playerName,
        team_name AS team,
        source_url AS sourceUrl
      FROM award_facts
      WHERE year = ? AND award_type = ?
      ORDER BY CASE league WHEN 'セ・リーグ' THEN 0 WHEN 'パ・リーグ' THEN 1 ELSE 2 END, league ASC`,
    )
    .all(filters.year, filters.award_type)
  return rows as AwardWinnerRow[]
}

export async function getNormalizedRuntimeMetadata(
  database: QueryDatabase,
): Promise<Record<string, string>> {
  const rows = await database
    .prepare(
      `SELECT metadata_key AS key, metadata_value AS value
      FROM normalized_runtime_metadata`,
    )
    .all()
  return Object.fromEntries((rows as Array<{ key: string; value: string }>).map((row) => [row.key, row.value]))
}
