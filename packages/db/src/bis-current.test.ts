import { describe, expect, it } from 'vitest'
import { BisFetchHttpError } from './bis-current'

describe('BisFetchHttpError', () => {
  it('preserves the HTTP status for expected missing-page handling', () => {
    const error = new BisFetchHttpError(404, 'https://npb.jp/bis/teams/results_g_03.html')

    expect(error.status).toBe(404)
    expect(error.message).toContain('(HTTP 404)')
  })
})
