import { describe, expect, it } from 'vitest'
import {
  parseUpdateDailyArgs,
  resolveDailyDateRange,
} from './update-daily'

describe('update-daily', () => {
  it('parses update:daily CLI args', () => {
    expect(
      parseUpdateDailyArgs([
        '--from=2025-04-05',
        '--to',
        '2025-04-07',
        '--strict',
        '--dry-run',
        '--sqlite-dir=./data',
        '--workspace-root=/tmp/workspace',
        '--delay-ms=10',
        '--user-agent=test-agent',
      ]),
    ).toEqual({
      date: undefined,
      from: '2025-04-05',
      to: '2025-04-07',
      days: undefined,
      strict: true,
      dryRun: true,
      includeBisCurrent: false,
      sqlitePath: undefined,
      sqliteDir: './data',
      workspaceRoot: '/tmp/workspace',
      delayMs: 10,
      userAgent: 'test-agent',
    })
  })

  it('uses the last three JST dates by default', () => {
    expect(
      resolveDailyDateRange({
        now: new Date('2026-05-02T16:00:00.000Z'),
      }),
    ).toEqual({
      from: '2026-05-01',
      to: '2026-05-03',
    })
  })

  it('resolves --days as an inclusive JST range ending today', () => {
    expect(
      resolveDailyDateRange({
        days: 5,
        now: new Date('2026-05-03T00:00:00.000Z'),
      }),
    ).toEqual({
      from: '2026-04-29',
      to: '2026-05-03',
    })
  })

  it('rejects conflicting date selectors', () => {
    expect(() => resolveDailyDateRange({ date: '2025-04-05', days: 2 })).toThrow(
      /cannot be combined/,
    )
    expect(() => resolveDailyDateRange({ from: '2025-04-06', to: '2025-04-05' })).toThrow(
      /after --to/,
    )
  })
})
