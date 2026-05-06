import type { ChatSource } from '@npb/schemas'
import type { QueryDatabase } from '../query-driver'

export type SourceSnapshotRow = ChatSource

export async function listSourceSnapshotsByGameIds(
  database: QueryDatabase,
  gameIds: string[],
): Promise<SourceSnapshotRow[]> {
  if (gameIds.length === 0) {
    return []
  }

  const placeholders = gameIds.map(() => '?').join(', ')
  const rows = await database
    .prepare(
      `SELECT
        game_id AS game_id,
        source_key AS source_key,
        source_url AS source_url
      FROM source_snapshots
      WHERE game_id IN (${placeholders})
      ORDER BY game_id ASC, source_key ASC`,
    )
    .all(...gameIds)
  return rows as SourceSnapshotRow[]
}
