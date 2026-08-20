import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BisFetchHttpError, resolveBisCurrentSqlitePath } from './bis-current'

describe('BisFetchHttpError', () => {
  it('preserves the HTTP status for expected missing-page handling', () => {
    const error = new BisFetchHttpError(404, 'https://npb.jp/bis/teams/results_g_03.html')

    expect(error.status).toBe(404)
    expect(error.message).toContain('(HTTP 404)')
  })
})

describe('resolveBisCurrentSqlitePath', () => {
  it('resolves workflow-relative SQLite paths from the workspace root', () => {
    expect(resolveBisCurrentSqlitePath('/workspace/repo', 2026, {
      sqlitePath: 'data/npb-2026.sqlite',
    })).toBe(path.resolve('/workspace/repo/data/npb-2026.sqlite'))
  })

  it('preserves an absolute SQLite path', () => {
    expect(resolveBisCurrentSqlitePath('/workspace/repo', 2024, {
      sqlitePath: '/tmp/npb-2024.sqlite',
    })).toBe('/tmp/npb-2024.sqlite')
  })
})
