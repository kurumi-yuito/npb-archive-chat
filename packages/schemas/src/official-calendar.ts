import { z } from 'zod'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const integer = z.number().int().nonnegative()
const common = {
  version: z.literal(1),
  year: z.number().int().min(1936).max(2200),
  calendarFrom: date,
  calendarTo: date,
}
export const officialCalendarFactsSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('season'), calendarUrls: z.array(z.string().url()).min(1),
    standings: z.array(z.object({ team: z.string().min(1), league: z.enum(['central', 'pacific']),
      games: integer, wins: integer, losses: integer, draws: integer, winRate: z.number().min(0).max(1) }).strict()).length(12),
  }).strict(),
  z.object({ ...common, kind: z.literal('month'), month: z.number().int().min(1).max(12),
    dates: z.array(date).min(28).max(31),
    games: z.array(z.object({ date, sourceUrl: z.string().url(), homeTeam: z.string().min(1), awayTeam: z.string().min(1),
      status: z.enum(['completed', 'cancelled']), homeRuns: integer.nullable(), awayRuns: integer.nullable() }).strict()),
  }).strict(),
])
export type OfficialCalendarFacts = z.infer<typeof officialCalendarFactsSchema>
