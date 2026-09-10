import { describe, expect, it } from 'vitest'
import { measureD1, withD1ReadAudit } from '../server/utils/d1-read-audit'

describe('D1 row read accounting', () => {
  it('isolates overlapping requests and counts rows, including write reads', async () => {
    const reports: unknown[] = []
    await Promise.all([3, 7].map((rows) => withD1ReadAudit(async () => {
      await measureD1('meta', 'INSERT INTO bucket VALUES (?)', ['private-id'], async () => {
        await Promise.resolve()
        return { meta: { rows_read: rows } }
      })
      await measureD1('other', 'SELECT generation', [], async () => ({ meta: { rows_read: 1 } }))
    }, (report) => reports.push(report))))
    expect(reports).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowsRead: { meta: 3, repository: 0, other: 1 }, total: 4, unknown: 0 }),
      expect.objectContaining({ rowsRead: { meta: 7, repository: 0, other: 1 }, total: 8, unknown: 0 }),
    ]))
    expect(JSON.stringify(reports)).not.toContain('private-id')
  })

  it('does not report a failed or unmeasured query as zero reads', async () => {
    let report: unknown
    await expect(withD1ReadAudit(async () => {
      await measureD1('repository', 'SELECT value', [], async () => { throw new Error('quota') })
    }, (value) => { report = value })).rejects.toThrow('quota')
    expect(report).toMatchObject({ rowsRead: { meta: 0, repository: null, other: 0 }, total: null, unknown: 1 })
  })
})
