import { createHash } from 'node:crypto'
import { parseBisPlayerProfileHtml, parseBisPlayerStatisticHistoryHtml } from '@npb/parser'
import { officialPlayerHistoryEvidenceSchema, verifiedPlayerCareerRows, type OfficialPlayerHistoryEvidence } from '@npb/schemas'
import type { ObjectStorage } from './object-storage'
import type { SqliteDatabase } from './sqlite'

/** Fresh official ID page capture, with annual/career reconciliation before writing. */
export async function captureOfficialPlayerProfile(input: {
  playerId: string; database: SqliteDatabase; storage: ObjectStorage; fetch?: typeof fetch; now?: () => Date
}): Promise<OfficialPlayerHistoryEvidence> {
  if (!/^[a-z0-9_-]+$/iu.test(input.playerId)) throw new Error('Invalid official player ID')
  const url = `https://npb.jp/bis/players/${input.playerId}.html`
  const response = await (input.fetch ?? fetch)(url, { signal: AbortSignal.timeout(30_000),
    headers: { 'user-agent': 'npb-archive-chat/0.1 (+https://npb-chat.dom9th-works.com/)' } })
  if (!response.ok) throw new Error(`Official profile HTTP ${response.status}`)
  if (response.url && response.url !== url) throw new Error('Unexpected official profile redirect')
  const html = await response.text()
  const declaredUrl = html.match(/<meta\b[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/iu)?.[1]
  if (declaredUrl) {
    const declared = new URL(declaredUrl)
    if (!['http:', 'https:'].includes(declared.protocol) || declared.hostname !== 'npb.jp' || declared.pathname !== `/bis/players/${input.playerId}.html` || declared.search || declared.hash) throw new Error('Official profile declared ID mismatch')
  }
  const profile = parseBisPlayerProfileHtml(html, input.playerId, url)
  if (!profile || !html.match(/<title\b[^>]*>[^<]*個人年度別成績/iu)) throw new Error('No official individual career profile')
  const fetchedAt = (input.now?.() ?? new Date()).toISOString()
  const contentHash = createHash('sha256').update(html).digest('hex')
  const rawKey = `raw/bis-player-profiles/${input.playerId}/${contentHash}.html`
  const basisText = html.match(/<time\b[^>]*>([\s\S]*?)<\/time>/iu)?.[1]?.replace(/<[^>]+>/gu, '').replace(/\s+/gu, ' ').trim() ?? null
  const evidence = officialPlayerHistoryEvidenceSchema.parse({ version: 1, playerId: input.playerId, fullName: profile.fullName,
    sourceUrl: url, fetchedAt, contentHash, rawKey, basisText, rows: parseBisPlayerStatisticHistoryHtml(html) })
  verifiedPlayerCareerRows(evidence)
  await input.storage.putText(rawKey, html, 'text/html; charset=utf-8')
  await input.storage.putText(`structured/bis-player-profiles/${input.playerId}/${contentHash}.json`, JSON.stringify(evidence, null, 2), 'application/json; charset=utf-8')
  const old = input.database.prepare('SELECT metadata FROM player_profiles WHERE player_id=?').get(input.playerId) as { metadata: string } | undefined
  let metadata: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(old?.metadata ?? '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>
  } catch { /* Replace malformed metadata, never infer facts from it. */ }
  metadata.official_profile_evidence = evidence
  input.database.prepare(`INSERT INTO player_profiles(player_id,full_name,canonical_name,team_name,year_teams_json,source_url,fetched_at,metadata,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(player_id) DO UPDATE SET full_name=excluded.full_name,canonical_name=excluded.canonical_name,
    team_name=excluded.team_name,year_teams_json=excluded.year_teams_json,source_url=excluded.source_url,fetched_at=excluded.fetched_at,
    metadata=excluded.metadata,updated_at=excluded.updated_at`)
    .run(input.playerId, profile.fullName, profile.fullName, profile.teamName, profile.yearTeamsJson, url, fetchedAt, JSON.stringify(metadata), fetchedAt, fetchedAt)
  return evidence
}
