import path from 'node:path'
import { findWorkspaceRoot } from '@npb/crawler'
import { BIS_TEAMS, type UpdateBisCurrentArgs } from './bis-current'
import { collectOfficialStatistics, discoverOfficialStatisticPages } from './official-statistics'
import { createObjectStorage } from './object-storage'
import { migrateDatabase } from './migrations'
import { openDatabase } from './sqlite'

export async function runOfficialStatisticsUpdate(args: UpdateBisCurrentArgs) {
  const year = args.year
  if (!year || !Number.isInteger(year) || year < 1936 || year > 2200) throw new Error('Official statistics require an explicit valid --year')
  const workspaceRoot = args.workspaceRoot ?? await findWorkspaceRoot(process.cwd())
  const sqlitePath = args.sqlitePath ?? path.join(workspaceRoot, args.sqliteDir ?? 'data', `npb-${year}.sqlite`)
  const teams = BIS_TEAMS.filter((team) => !args.team || team.teamId === args.team || team.teamName === args.team)
  if (!teams.length) throw new Error(`Unknown official team: ${args.team}`)
  const storage = createObjectStorage({ mode: args.storage ?? 'local', workspaceRoot, bucket: args.r2Bucket, prefix: args.r2Prefix, endpoint: args.r2Endpoint })
  const fetchPage = async (url: string) => {
    if ((args.delayMs ?? 500) > 0) await new Promise((resolve) => setTimeout(resolve, args.delayMs ?? 500))
    const response = await fetch(url, { headers: { 'user-agent': args.userAgent ?? 'npb-archive-chat/0.1 (+https://npb.jp/)' }, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Official link discovery HTTP ${response.status}: ${url}`)
    if (response.url !== url) throw new Error(`Unexpected official discovery redirect: ${response.url}`)
    return response.text()
  }
  const pages = []
  for (const team of teams) pages.push(...await discoverOfficialStatisticPages({ year, ...team, teamIndexUrl: `https://npb.jp/bis/teams/index_${team.teamId}.html` }, fetchPage))
  if (args.dryRun) return { year, sqlitePath, dryRun: true, pages, snapshots: 0, rows: 0 }
  const database = openDatabase(sqlitePath)
  try {
    migrateDatabase(database)
    let snapshots = 0
    let rows = 0
    for (const page of pages) {
      if ((args.delayMs ?? 500) > 0) await new Promise((resolve) => setTimeout(resolve, args.delayMs ?? 500))
      const result = await collectOfficialStatistics({ database, storage, pages: [page] })
      snapshots += result.snapshots
      rows += result.rows
    }
    return { year, sqlitePath, dryRun: false, pages, snapshots, rows }
  } finally { database.close() }
}
