import { z } from 'zod'

export const officialPlayerHistoryRowSchema = z.object({
  kind: z.enum(['batting', 'pitching']), scope: z.enum(['team_season', 'season_total', 'career']),
  year: z.number().int().min(1936).nullable(), team: z.string().min(1).nullable(), metrics: z.record(z.string()),
  seasonLabel: z.string().max(32).nullable().optional(),
}).strict().superRefine((row, context) => {
  if (row.scope === 'career' ? row.year !== null || row.team !== null : row.year === null || (row.scope === 'team_season' ? row.team === null : row.team !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Statistic row scope and year/team disagree' })
  }
})

export const officialPlayerHistoryEvidenceSchema = z.object({
  version: z.literal(1), playerId: z.string().min(1), fullName: z.string().min(1), sourceUrl: z.string().url(),
  fetchedAt: z.string().datetime(), contentHash: z.string().regex(/^[a-f0-9]{64}$/u), rawKey: z.string().min(1),
  basisText: z.string().nullable(), rows: z.array(officialPlayerHistoryRowSchema),
}).strict().refine((evidence) => evidence.sourceUrl === `https://npb.jp/bis/players/${evidence.playerId}.html`, 'Official profile ID and source URL disagree')
export type OfficialPlayerHistoryEvidence = z.infer<typeof officialPlayerHistoryEvidenceSchema>
export type OfficialPlayerHistoryRow = z.infer<typeof officialPlayerHistoryRowSchema>

const additive = {
  batting: ['試合', '打席', '打数', '得点', '安打', '二塁打', '三塁打', '本塁打', '塁打', '打点', '盗塁', '盗塁刺', '犠打', '犠飛', '四球', '死球', '三振', '併殺打'],
  pitching: ['登板', '勝利', '敗北', 'セーブ', 'H', 'HP', '完投', '完封勝', '無四球', '打者', '安打', '本塁打', '四球', '死球', '三振', '暴投', 'ボーク', '失点', '自責点'],
} as const

/** Select a year's official subtotal when present; never add it to its team stints. */
export function annualPlayerHistoryRows(rows: OfficialPlayerHistoryRow[], kind: OfficialPlayerHistoryRow['kind']): OfficialPlayerHistoryRow[] {
  const annual = rows.filter((row) => row.kind === kind && row.scope !== 'career')
  const periodKey = (row: OfficialPlayerHistoryRow) => `${row.year}:${row.seasonLabel ?? row.year}`
  return [...new Set(annual.map(periodKey))].flatMap((period) => {
    const group = annual.filter((row) => periodKey(row) === period)
    const totals = group.filter((row) => row.scope === 'season_total')
    if (totals.length > 1) throw new Error('Duplicate annual profile subtotal')
    const chosen = totals.length ? totals : group
    if (new Set(chosen.map((row) => row.team)).size !== chosen.length) throw new Error('Duplicate annual profile stint')
    return chosen
  })
}

function integer(text: string | undefined): number {
  if (!text || !/^\d+$/u.test(text)) throw new Error('Invalid official additive statistic')
  return Number(text)
}

export function officialInningsOuts(text: string): number {
  const normalized = text.normalize('NFKC').replace(/\s+/gu, '')
  // A '+' appearance records no additional out. Keep its source notation in
  // metrics; reconciliation still checks the exact published career outs.
  if (normalized === '+') return 0
  const match = normalized.match(/^(\d+)(?:\.([012]))?\+?$/u)
  if (!match) throw new Error('Invalid official innings notation')
  return Number(match[1]) * 3 + Number(match[2] ?? 0)
}

/** Independently reconcile annual rows to the published NPB career footer. */
export function verifiedPlayerCareerRows(evidence: OfficialPlayerHistoryEvidence): OfficialPlayerHistoryRow[] {
  const verified: OfficialPlayerHistoryRow[] = []
  for (const kind of ['batting', 'pitching'] as const) {
    const totals = evidence.rows.filter((row) => row.kind === kind && row.scope === 'career')
    if (!totals.length) continue
    if (totals.length !== 1) throw new Error('Conflicting official career totals')
    const total = totals[0]!
    const annual = annualPlayerHistoryRows(evidence.rows, kind)
    if (!annual.length) throw new Error('Career total lacks annual evidence')
    const required = kind === 'batting' ? ['試合', '打数', '安打', '本塁打'] : ['登板', '勝利', '投球回']
    if (required.some((field) => !(field in total.metrics))) throw new Error('Career total lacks required metrics')
    for (const field of additive[kind]) {
      if (!(field in total.metrics)) continue
      if (!required.includes(field) && annual.some((row) => !/^\d+$/u.test(row.metrics[field] ?? ''))) continue
      if (annual.reduce((sum, row) => sum + integer(row.metrics[field]), 0) !== integer(total.metrics[field])) throw new Error(`Official career total mismatch: ${kind}:${field}`)
    }
    if (kind === 'pitching' && annual.reduce((sum, row) => sum + officialInningsOuts(row.metrics.投球回 ?? ''), 0) !== officialInningsOuts(total.metrics.投球回 ?? '')) throw new Error('Official career innings mismatch')
    verified.push(total)
  }
  return verified
}
