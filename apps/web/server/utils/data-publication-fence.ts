import type { D1Database } from '@cloudflare/workers-types'
export class DataPublicationChangedError extends Error {
  constructor() { super('データ更新が完了しました。もう一度お試しください。') }
}

/** Do not return an answer assembled across two published data generations. */
export async function captureDataPublication(database?: D1Database): Promise<() => Promise<void>> {
  if (!database) return async () => {}
  const read = async () => (await database.prepare(
    "SELECT metadata_value FROM normalized_runtime_metadata WHERE metadata_key='sync_generation'",
  ).first<{ metadata_value: string }>())?.metadata_value ?? 'legacy'
  const generation = await read()
  return async () => {
    if (await read() !== generation) throw new DataPublicationChangedError()
  }
}
