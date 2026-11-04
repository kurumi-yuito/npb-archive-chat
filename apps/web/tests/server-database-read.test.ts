import type { H3Event } from 'h3'
import { expect, it, vi } from 'vitest'
import { getServerDatabase, getServerMetaDatabase } from '../server/utils/server-database'

it('validates the required schema once within a request and retries failed validation', async () => {
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

it('uses the current request binding for both metadata and search operations', async () => {
  const binding = (label: string) => ({ prepare: vi.fn(() => ({ bind: () => ({ all: async () => ({ results: [
    { key: 'schema_version', value: 'phase5-normalized-v1' }, { key: 'runtime_contract', value: 'normalized-only' }, { label },
  ] }) }) })) })
  const first = binding('first'); const second = binding('second')
  const event = (db: ReturnType<typeof binding>) => ({ context: { cloudflare: { env: { NPB_DB: db, NPB_META_DB: db } } } }) as unknown as H3Event
  const a = event(first); const b = event(second)
  const firstMeta = await getServerMetaDatabase(a, '')
  const secondMeta = await getServerMetaDatabase(b, '')
  expect(secondMeta).not.toBe(firstMeta)
  expect(await secondMeta.prepare('SELECT label').all()).toContainEqual({ label: 'second' })
  const firstSearch = await getServerDatabase(a, '')
  const secondSearch = await getServerDatabase(b, '')
  expect(secondSearch).not.toBe(firstSearch)
  expect(await secondSearch.prepare('SELECT label').all()).toContainEqual({ label: 'second' })
})
