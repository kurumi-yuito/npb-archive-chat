import { z } from 'zod'
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** A published competition outcome, distinct from one game's winner. */
export const officialSeriesResultSchema = z.object({
  year: z.number().int().min(1950).max(2200), competition: z.string().min(1), level: z.enum(['first', 'farm']),
  winnerName: z.string().min(1), loserName: z.string().min(1),
  winnerWins: count, loserWins: count, draws: count,
  games: z.array(z.object({ winnerSideRuns: count, loserSideRuns: count, literalScore: z.string().min(1) }).strict()).min(1),
}).strict().superRefine((row, context) => {
  const compact = (value: string) => value.normalize('NFKC').replace(/\s+/gu, '')
  const wins = row.games.filter((game) => game.winnerSideRuns > game.loserSideRuns).length
  const losses = row.games.filter((game) => game.winnerSideRuns < game.loserSideRuns).length
  if (compact(row.winnerName) === compact(row.loserName) || row.winnerWins !== wins || row.loserWins !== losses ||
    row.draws !== row.games.length - wins - losses || wins <= losses) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Series outcome and played scores disagree' })
  for (const game of row.games) {
    const score = /^(\d+)[xX]?-(\d+)[xX]?$/u.exec(compact(game.literalScore))
    if (!score || Number(score[1]) !== game.winnerSideRuns || Number(score[2]) !== game.loserSideRuns) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Series literal score differs from its numeric projection' })
  }
})

export type OfficialSeriesResult = z.infer<typeof officialSeriesResultSchema>
