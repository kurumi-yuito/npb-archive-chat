import path from 'node:path'
import { findWorkspaceRoot } from '@npb/crawler'
import { emptyBisCurrentDataset } from '@npb/parser'
import { BIS_TEAMS, loadBisCurrentDataset, type UpdateBisCurrentArgs } from './bis-current'
import { captureOfficialRoster } from './official-roster'
import { createObjectStorage } from './object-storage'
import { migrateDatabase } from './migrations'
import { openDatabase } from './sqlite'

/** Current pages cannot establish historical membership or an active contract. */
export async function runOfficialRosterUpdate(args: UpdateBisCurrentArgs) {
  const year = args.year
  if (!year || !Number.isInteger(year)) throw new Error('Official roster requires an explicit --year')
  const workspaceRoot = args.workspaceRoot ?? await findWorkspaceRoot(process.cwd())
  const sqlitePath = args.sqlitePath ?? path.join(workspaceRoot, args.sqliteDir ?? 'data', `npb-${year}.sqlite`)
  const teams = BIS_TEAMS.filter((team) => !args.team || team.teamId === args.team || team.teamName === args.team)
  if (!teams.length) throw new Error(`Unknown official team: ${args.team}`)
  if (args.dryRun) return { year, sqlitePath, teams, dryRun: true }
  const storage = createObjectStorage({ mode: args.storage ?? 'local', workspaceRoot, bucket: args.r2Bucket, prefix: args.r2Prefix, endpoint: args.r2Endpoint })
  const dataset = emptyBisCurrentDataset(year)
  for (const team of teams) {
    if ((args.delayMs ?? 500) > 0) await new Promise((resolve) => setTimeout(resolve, args.delayMs ?? 500))
    const captured = await captureOfficialRoster({ year, team, storage })
    dataset.sourceSnapshots.push(captured.snapshot)
    dataset.currentTeamRoster.push(...captured.entries)
  }
  const database = openDatabase(sqlitePath)
  try {
    migrateDatabase(database)
    loadBisCurrentDataset(database, dataset)
    return { year, sqlitePath, teams: teams.length, snapshots: dataset.sourceSnapshots.length, rows: dataset.currentTeamRoster.length, dryRun: false }
  } finally { database.close() }
}
