import type { D1Database } from '@cloudflare/workers-types'
import { createQueryDatabaseFromD1 } from './d1-query-database'
export class DataPublicationChangedError extends Error {
  constructor() { super('データ更新が完了しました。もう一度お試しください。') }
}

/** Do not return an answer assembled across two published data generations. */
export async function captureDataPublication(database?: D1Database): Promise<() => Promise<void>> {
  if (!database) return async () => {}
  const query = createQueryDatabaseFromD1(database, 'other')
  const read = async () => (await query.prepare(
    "SELECT metadata_value FROM normalized_runtime_metadata WHERE metadata_key='sync_generation'",
  ).get() as { metadata_value: string } | null)?.metadata_value ?? 'legacy'
  const generation = await read()
  return async () => {
    if (await read() !== generation) throw new DataPublicationChangedError()
  }
}
