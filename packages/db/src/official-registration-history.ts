import { createHash } from 'node:crypto'
import { normalizePlayerNameKey } from '@npb/schemas'
import { parseOfficialRegistrationHistory, type RegistrationPageScope, type RegistrationHistoryEntry } from '@npb/parser'
import type { SqliteDatabase } from './sqlite'
import { withTransaction } from './sqlite'
import type { ObjectStorage } from './object-storage'
import type { OfficialRosterIdentity } from './official-roster-identities'

const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const playerKey = (scope: RegistrationPageScope, hash: string, entry: RegistrationHistoryEntry) => `registration:${scope.kind}:${hash}:${entry.rowIndex}:${entry.playerId}`

async function verifyDiscovery(storage: ObjectStorage, discovery: { url: string; rawKey: string; contentHash: string }, scope: RegistrationPageScope) {
  const url = new URL(discovery.url)
  if (url.origin !== 'https://npb.jp' || url.pathname !== `/announcement/${scope.year}/` || url.search || url.hash ||
    !/^[a-f0-9]{64}$/u.test(discovery.contentHash) || discovery.rawKey !== `raw/official-registration-discovery/${discovery.contentHash}.html`) throw new Error('Invalid registration discovery archive')
  const raw = await storage.getText(discovery.rawKey)
  const title = raw?.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1]?.replace(/\s+/gu, '') ?? ''
  if (!raw || !title.includes(`${scope.year}年度`) || digest(raw) !== discovery.contentHash || ![...raw.matchAll(/\bhref\s*=\s*["']([^"']+)["']/giu)].some((item) => {
    try { return new URL(item[1]!, discovery.url).href === scope.sourceUrl } catch { return false }
  })) throw new Error('Registration discovery link proof missing')
}

export async function captureOfficialRegistrationHistory(input: {
  database: SqliteDatabase; storage: ObjectStorage; scope: RegistrationPageScope;
  discovery: { url: string; rawKey: string; contentHash: string; fetchedAt: string };
  fetch?: typeof fetch; now?: () => Date
}) {
  const { scope } = input
  await verifyDiscovery(input.storage, input.discovery, scope)
  const response = await (input.fetch ?? fetch)(scope.sourceUrl, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'npb-archive-chat/0.1 (+https://npb.jp/)' } })
  if (!response.ok || (response.url && response.url !== scope.sourceUrl)) throw new Error(`Official registration fetch failed: HTTP ${response.status}`)
  const html = await response.text(), fetchedAt = (input.now?.() ?? new Date()).toISOString()
  const parsed = parseOfficialRegistrationHistory(html, scope)
  const contentHash = digest(html), captureId = digest(`${scope.sourceUrl}\n${contentHash}\n${fetchedAt}`)
  const sourceKey = `registration:${scope.year}:${scope.teamId}:${scope.kind}:${contentHash}`
  const prefix = `official-registration/${scope.year}/${scope.teamId}/${scope.kind}`
  const rawKey = `raw/${prefix}/${contentHash}.html`, structuredKey = `structured/${prefix}/${captureId}.json`
  const record = { scope, source: { sourceKey, sourceUrl: scope.sourceUrl, fetchedAt, contentHash, rawKey, captureId }, discovery: input.discovery, ...parsed }
  await input.storage.putText(rawKey, html, 'text/html; charset=utf-8')
  await input.storage.putText(structuredKey, JSON.stringify(record, null, 2), 'application/json; charset=utf-8')
  const eligible = parsed.entries.filter((entry) => entry.playerId && entry.membershipInYear === true)
  withTransaction(input.database, () => {
    input.database.prepare(`INSERT INTO bis_source_snapshots(source_key,year,team_id,source_type,source_url,raw_path,structured_path,fetched_at)
      VALUES (?,?,?,'official_registration',?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET structured_path=excluded.structured_path,fetched_at=excluded.fetched_at`)
      .run(sourceKey, scope.year, scope.teamId, scope.sourceUrl, `data/${rawKey}`, `data/${structuredKey}`, fetchedAt)
    // Only this source's derived identity projection is replaced. Original
    // pages/observations and every played fact remain intact.
    input.database.prepare('DELETE FROM current_team_roster WHERE year=? AND team_id=? AND source_url=?').run(scope.year, scope.teamId, scope.sourceUrl)
    const insert = input.database.prepare(`INSERT INTO current_team_roster(year,team_id,team_name,player_key,player_id,player_name,position,uniform_number,source_url,loaded_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
    const alias = input.database.prepare(`INSERT INTO player_aliases(player_id,alias,normalized_alias,alias_type,source_type,source_key,season_from,season_to,confidence,created_at,updated_at)
      SELECT ?,?,?,'registered_name','official_registration',?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM player_profiles WHERE player_id=?)
      ON CONFLICT DO NOTHING`)
    for (const entry of eligible) {
      insert.run(scope.year, scope.teamId, scope.teamName, playerKey(scope, contentHash, entry), entry.playerId, entry.playerName, entry.position, entry.uniformNumber, scope.sourceUrl, fetchedAt)
      alias.run(entry.playerId, entry.playerName, normalizePlayerNameKey(entry.playerName), sourceKey, scope.year, scope.year, 1, fetchedAt, fetchedAt, entry.playerId)
    }
  })
  return { sourceKey, fetchedAt, contentHash, rows: parsed.entries.length, identities: eligible.length, uncertain: parsed.entries.filter((entry) => entry.membershipInYear === null).length, currentContractConfirmed: false as const }
}

/** Reparse original official pages and compare the exact derived rows before
 * allowing a historical registration to identify a player in a given year. */
export async function verifiedOfficialRegistrationIdentities(database: SqliteDatabase, storage: ObjectStorage): Promise<OfficialRosterIdentity[]> {
  const sources = database.prepare(`SELECT source.* FROM bis_source_snapshots source WHERE source.source_type='official_registration' AND NOT EXISTS(
    SELECT 1 FROM bis_source_snapshots newer WHERE newer.source_type=source.source_type AND newer.source_url=source.source_url AND
      (newer.fetched_at>source.fetched_at OR (newer.fetched_at=source.fetched_at AND newer.source_key>source.source_key)))`).all() as Array<{ source_key: string; year: number; team_id: string; source_url: string; raw_path: string; structured_path: string; fetched_at: string }>
  const result: OfficialRosterIdentity[] = []
  for (const source of sources) {
    const hash = source.source_key.slice(-64)
    if (!/^[a-f0-9]{64}$/u.test(hash) || !Number.isFinite(Date.parse(source.fetched_at))) throw new Error('Invalid registration source hash/timestamp')
    const url = new URL(source.source_url), match = /^\/announcement\/(\d{4})\/(registered|registereddev)_([a-z]+)\.html$/u.exec(url.pathname)
    if (url.origin !== 'https://npb.jp' || !match || Number(match[1]) !== source.year || match[3] !== source.team_id || url.search || url.hash) throw new Error('Registration archive URL mismatch')
    const kind = match[2] === 'registered' ? 'registered' : 'development'
    const prefix = `official-registration/${source.year}/${source.team_id}/${kind}`
    if (source.source_key !== `registration:${source.year}:${source.team_id}:${kind}:${hash}` || source.raw_path !== `data/raw/${prefix}/${hash}.html` ||
      !new RegExp(`^data/structured/${prefix}/[a-f0-9]{64}\\.json$`, 'u').test(source.structured_path)) throw new Error('Registration archive key mismatch')
    const raw = await storage.getText(source.raw_path.slice(5)), structured = await storage.getText(source.structured_path.slice(5))
    if (!raw || digest(raw) !== hash || !structured) throw new Error('Registration original archive missing or changed')
    const record = JSON.parse(structured) as { scope: RegistrationPageScope; source: { sourceKey: string; sourceUrl: string; fetchedAt: string; contentHash: string; rawKey: string }; entries: RegistrationHistoryEntry[]; currentContractConfirmed: boolean; discovery: { url: string; rawKey: string; contentHash: string } }
    if (record.scope.year !== source.year || record.scope.teamId !== source.team_id || record.scope.kind !== kind || record.scope.sourceUrl !== source.source_url ||
      record.source.sourceKey !== source.source_key || record.source.sourceUrl !== source.source_url || record.source.contentHash !== hash ||
      record.source.rawKey !== source.raw_path.slice(5) || record.source.fetchedAt !== source.fetched_at || record.currentContractConfirmed !== false) throw new Error('Registration structured scope mismatch')
    await verifyDiscovery(storage, record.discovery, record.scope)
    const parsed = parseOfficialRegistrationHistory(raw, record.scope)
    if (JSON.stringify(parsed.entries) !== JSON.stringify(record.entries)) throw new Error('Registration derived entries differ from original')
    const eligible = parsed.entries.filter((entry) => entry.playerId && entry.membershipInYear === true)
    const stored = database.prepare(`SELECT player_key,player_id,player_name,team_name,position,uniform_number,loaded_at FROM current_team_roster
      WHERE year=? AND team_id=? AND source_url=? ORDER BY player_key`).all(source.year, source.team_id, source.source_url)
    const expected = eligible.map((entry) => ({ player_key: playerKey(record.scope, hash, entry), player_id: entry.playerId, player_name: entry.playerName,
      team_name: record.scope.teamName, position: entry.position, uniform_number: entry.uniformNumber, loaded_at: source.fetched_at })).sort((a, b) => a.player_key < b.player_key ? -1 : a.player_key > b.player_key ? 1 : 0)
    if (JSON.stringify(stored) !== JSON.stringify(expected)) throw new Error('Registration identity projection differs from original')
    result.push(...eligible.map((entry) => ({ playerId: entry.playerId!, fullName: entry.playerName, year: source.year, teamName: record.scope.teamName })))
  }
  return result
}
