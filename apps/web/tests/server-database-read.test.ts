import type { H3Event } from 'h3'
import { expect, it, vi } from 'vitest'
import { getServerDatabase } from '../server/utils/server-database'

it('validates the required schema once across concurrent requests and retries failed validation', async () => {
  let valid = false
  const all = vi.fn(async () => ({ results: valid ? [
    { key: 'schema_version', value: 'phase5-normalized-v1' },
    { key: 'runtime_contract', value: 'normalized-only' },
  ] : [] }))
  const prepare = vi.fn(() => ({ bind: () => ({ all }) }))
  const event = { context: { cloudflare: { env: { NPB_DB: { prepare } } } } } as unknown as H3Event
  await expect(getServerDatabase(event, '')).rejects.toThrow('normalized D1 runtime schema')
  valid = true
  await Promise.all([getServerDatabase(event, ''), getServerDatabase(event, '')])
  await getServerDatabase(event, '')
  expect(all).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(prepare.mock.calls)).not.toContain('sqlite_master')
})
