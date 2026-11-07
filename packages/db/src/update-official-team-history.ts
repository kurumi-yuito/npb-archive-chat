import path from 'node:path'
import { findWorkspaceRoot } from '@npb/crawler'
import { BIS_TEAMS, type UpdateBisCurrentArgs } from './bis-current'
import { captureOfficialTeamHistory } from './official-team-history'
import { createObjectStorage } from './object-storage'
import { migrateDatabase } from './migrations'
import { openDatabase } from './sqlite'

/** Refresh source captures in an explicit staging DB; publication is a separate step. */
export async function runOfficialTeamHistoryUpdate(args: UpdateBisCurrentArgs) {
  if (!args.year || !Number.isInteger(args.year) || !args.sqlitePath) throw new Error('Official club history requires explicit --year and --sqlite-path')
  const workspaceRoot = args.workspaceRoot ?? await findWorkspaceRoot(process.cwd())
  const sqlitePath = path.resolve(workspaceRoot, args.sqlitePath)
  const teams = BIS_TEAMS.filter((team) => !args.team || team.teamId === args.team || team.teamName === args.team)
  if (!teams.length) throw new Error(`Unknown official club: ${args.team}`)
  if (args.dryRun) return { year: args.year, sqlitePath, teams: teams.length, snapshots: 0, rows: 0, dryRun: true, published: false }
  const storage = createObjectStorage({ mode: args.storage ?? 'local', workspaceRoot, bucket: args.r2Bucket, prefix: args.r2Prefix, endpoint: args.r2Endpoint })
  const database = openDatabase(sqlitePath)
  try {
    migrateDatabase(database)
    let snapshots = 0, rows = 0
    for (const team of teams) {
      if ((args.delayMs ?? 500) > 0) await new Promise((resolve) => setTimeout(resolve, args.delayMs ?? 500))
      const captured = await captureOfficialTeamHistory({ database, storage, team, targetYear: args.year })
      snapshots++
      rows += captured.rows.length
    }
    return { year: args.year, sqlitePath, teams: teams.length, snapshots, rows, dryRun: false, published: false }
  } finally { database.close() }
}
