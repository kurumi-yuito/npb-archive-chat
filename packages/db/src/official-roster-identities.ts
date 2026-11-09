import { createHash } from 'node:crypto'
import { parseBisTeamRosterHtml } from '@npb/parser'
import type { SqliteDatabase } from './sqlite'
import type { ObjectStorage } from './object-storage'
import { verifiedOfficialRegistrationIdentities } from './official-registration-history'

export type OfficialRosterIdentity = { playerId: string; fullName: string; year: number; teamName: string }

/** Unversioned roster rows alone cannot establish the year: revalidate archived page identity. */
export async function verifiedOfficialRosterIdentities(database: SqliteDatabase, storage: ObjectStorage): Promise<OfficialRosterIdentity[]> {
  const snapshots = database.prepare(`SELECT source_key,year,team_id,source_url,raw_path FROM bis_source_snapshots WHERE source_type='team_roster'`).all() as Array<{ source_key: string; year: number; team_id: string; source_url: string; raw_path: string | null }>
  const result: OfficialRosterIdentity[] = await verifiedOfficialRegistrationIdentities(database, storage)
  for (const snapshot of snapshots) {
    const prefix = `bis:${snapshot.year}:${snapshot.team_id}:rst_${snapshot.team_id}:`
    if (!snapshot.source_key.startsWith(prefix)) continue
    const hash = snapshot.source_key.slice(prefix.length)
    if (!/^[a-f0-9]{64}$/u.test(hash)) continue
    if (snapshot.source_url !== `https://npb.jp/bis/teams/rst_${snapshot.team_id}.html` || snapshot.raw_path !== `data/raw/bis/${snapshot.year}/rst_${snapshot.team_id}/${hash}.html`) throw new Error('Roster source scope mismatch')
    const raw = await storage.getText(snapshot.raw_path.slice('data/'.length))
    if (!raw || createHash('sha256').update(raw).digest('hex') !== hash) throw new Error('Roster raw archive missing or changed')
    const names = database.prepare('SELECT DISTINCT team_name FROM current_team_roster WHERE year=? AND team_id=?').all(snapshot.year, snapshot.team_id) as Array<{ team_name: string }>
    if (names.length !== 1) throw new Error('Roster lacks a unique declared team name')
    const teamName = names[0]!.team_name
    const compact = (text: string) => text.normalize('NFKC').replace(/\s+/gu, '')
    const title = compact(raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? '')
    if (!title.includes(`${snapshot.year}年度選手一覧`) || !title.includes(compact(teamName))) throw new Error('Roster published year/team does not match stored scope')
    const entries = parseBisTeamRosterHtml(raw, { year: snapshot.year, teamId: snapshot.team_id, teamName, sourceUrl: snapshot.source_url })
    for (const entry of entries) if (entry.playerId) result.push({ playerId: entry.playerId, fullName: entry.playerName, year: entry.year, teamName: entry.teamName })
  }
  return result
}
