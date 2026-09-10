import type { D1Database } from '@cloudflare/workers-types'
import { describe, expect, it, vi } from 'vitest'
import { captureDataPublication, DataPublicationChangedError } from '../server/utils/data-publication-fence'

describe('data publication fence', () => {
  it('accepts the same completed generation', async () => {
    const first = vi.fn().mockResolvedValue({ metadata_value: 'one' })
    const database = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [await first()].filter(Boolean) }) }) }) } as unknown as D1Database
    await expect((await captureDataPublication(database))()).resolves.toBeUndefined()
  })
  it('withholds an answer spanning publication, including initial migration', async () => {
    const first = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ metadata_value: 'one' })
    const database = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [await first()].filter(Boolean) }) }) }) } as unknown as D1Database
    await expect((await captureDataPublication(database))()).rejects.toBeInstanceOf(DataPublicationChangedError)
  })
  it('does not turn a database failure into an empty success', async () => {
    const first = vi.fn().mockResolvedValueOnce({ metadata_value: 'one' }).mockRejectedValueOnce(new Error('import unavailable'))
    const database = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [await first()].filter(Boolean) }) }) }) } as unknown as D1Database
    await expect((await captureDataPublication(database))()).rejects.toThrow('import unavailable')
  })
})
