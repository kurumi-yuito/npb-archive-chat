import path from 'node:path'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { findWorkspaceRoot } from '@npb/crawler'
import { officialPlayerHistoryEvidenceSchema, verifiedPlayerCareerRows } from '@npb/schemas'
import { captureOfficialPlayerProfile } from './official-player-profile'
import { createObjectStorage, parseStorageArg, type StorageArgs } from './object-storage'
import { openDatabase } from './sqlite'
import { migrateDatabase } from './migrations'

type Args = StorageArgs & { sqlitePath?: string; workspaceRoot?: string; playerIds: string[]; delayMs: number; limit?: number; dryRun?: boolean; resumeCapturedSince?: string }
export function parseOfficialPlayerProfilesArgs(argv: string[]): Args {
  const remaining = [...argv]
  const result: Args = { playerIds: [], delayMs: 500 }
  while (remaining.length) {
    const argument = remaining.shift()!
    if (argument === '--') continue
    if (parseStorageArg(argument, () => remaining.shift(), result)) continue
    const equal = argument.indexOf('=')
    const key = equal >= 0 ? argument.slice(0, equal) : argument
    const value = () => equal >= 0 ? argument.slice(equal + 1) : remaining.shift()
    if (key === '--dry-run') result.dryRun = true
    else if (key === '--sqlite-path') result.sqlitePath = value()
    else if (key === '--workspace-root') result.workspaceRoot = value()
    else if (key === '--resume-captured-since') {
      const since = value()
      if (!since || !Number.isFinite(Date.parse(since))) throw new Error('Invalid resume timestamp')
      result.resumeCapturedSince = new Date(since).toISOString()
    }
    else if (key === '--player-id') { const id = value(); if (!id) throw new Error('Missing --player-id'); result.playerIds.push(id) }
    else if (key === '--limit' || key === '--delay-ms') {
      const number = Number(value())
      if (!Number.isInteger(number) || number < (key === '--limit' ? 1 : 0)) throw new Error(`Invalid ${key}`)
      if (key === '--limit') result.limit = number
      else result.delayMs = number
    } else throw new Error(`Unknown official profile argument: ${argument}`)
  }
  if (!result.sqlitePath) throw new Error('Official profiles require an explicit --sqlite-path')
  return result
}

export async function runOfficialPlayerProfilesUpdate(args: Args) {
  const workspaceRoot = args.workspaceRoot ?? await findWorkspaceRoot(process.cwd())
  const sqlitePath = path.resolve(workspaceRoot, args.sqlitePath!)
  if (!existsSync(sqlitePath)) throw new Error('Initialize the local source DB before capturing official profiles')
  const database = openDatabase(sqlitePath)
  try {
    migrateDatabase(database)
    const discovered = database.prepare(`SELECT player_id FROM player_profiles UNION SELECT player_id FROM current_team_roster WHERE player_id IS NOT NULL ORDER BY player_id`).all() as Array<{ player_id: string }>
    const ids = [...new Set(args.playerIds.length ? args.playerIds : discovered.map((row) => row.player_id))].slice(0, args.limit)
    if (args.dryRun) return { sqlitePath, selected: ids.length, fetched: 0, failures: [], dryRun: true }
    const storage = createObjectStorage({ mode: args.storage ?? 'local', workspaceRoot, bucket: args.r2Bucket, prefix: args.r2Prefix, endpoint: args.r2Endpoint })
    let fetched = 0
    let skipped = 0
    const failures: Array<{ playerId: string; reason: string }> = []
    for (const playerId of ids) {
      if (args.resumeCapturedSince) {
        try {
          const profile = database.prepare('SELECT metadata,fetched_at,full_name FROM player_profiles WHERE player_id=?').get(playerId) as { metadata: string; fetched_at: string; full_name: string } | undefined
          const evidence = officialPlayerHistoryEvidenceSchema.parse(JSON.parse(profile?.metadata ?? '{}').official_profile_evidence)
          if (evidence.playerId === playerId && evidence.fullName === profile?.full_name && evidence.fetchedAt === profile.fetched_at && evidence.fetchedAt >= args.resumeCapturedSince) {
            verifiedPlayerCareerRows(evidence)
            const raw = await storage.getText(evidence.rawKey)
            if (raw && createHash('sha256').update(raw).digest('hex') === evidence.contentHash) { skipped++; continue }
          }
        } catch { /* An incomplete checkpoint must be captured again. */ }
      }
      if (args.delayMs) await new Promise((resolve) => setTimeout(resolve, args.delayMs))
      try {
        await captureOfficialPlayerProfile({ playerId, database, storage })
        fetched++
      } catch (error) {
        const failure = { playerId, reason: String(error) }
        failures.push(failure)
        process.stderr.write(`${JSON.stringify({ failure })}\n`)
      }
      if ((fetched + failures.length + skipped) % 25 === 0) process.stderr.write(`${JSON.stringify({ selected: ids.length, fetched, failed: failures.length, skipped })}\n`)
    }
    return { sqlitePath, selected: ids.length, fetched, skipped, failures, dryRun: false }
  } finally { database.close() }
}
