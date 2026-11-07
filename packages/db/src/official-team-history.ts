import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { parseBisGenericTeamTableHtml, type BisTeamInfo } from '@npb/parser'
import type { ObjectStorage } from './object-storage'
import { withTransaction, type SqliteDatabase } from './sqlite'

const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const compact = (text: string) => text.normalize('NFKC').replace(/\s+/gu, '')
export type OfficialTeamHistoryCapture = {
  team: BisTeamInfo; targetYear: number; sourceUrl: string; html: string; fetchedAt: string
  discovery: { url: string; html: string; fetchedAt: string }
}

/** Keep historical period labels and the published rates, rather than recomputing old rules. */
export function parseOfficialTeamHistory(html: string, input: { team: BisTeamInfo; targetYear: number; sourceUrl: string }) {
  if (!/^[a-z]+$/u.test(input.team.teamId) || input.sourceUrl !== `https://npb.jp/bis/teams/yearly_${input.team.teamId}.html`) throw new Error('Official team history source scope mismatch')
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? ''
  if (!compact(title).includes(compact(input.team.teamName)) || !title.includes('年度別成績')) throw new Error('Official team history title mismatch')
  const rows = parseBisGenericTeamTableHtml(html, { year: input.targetYear, ...input.team, sourceUrl: input.sourceUrl })
    .filter((row) => /^\d{4}(?:[春夏秋冬※]+|前期|後期)?$/u.test(row.values.年度 ?? ''))
    .map((row) => ({ year: Number(row.values.年度!.slice(0, 4)), seasonLabel: row.values.年度!, metrics: row.values }))
  if (!rows.length || Math.max(...rows.map((row) => row.year)) !== input.targetYear || new Set(rows.map((row) => row.seasonLabel)).size !== rows.length) throw new Error('Official team history year/period coverage mismatch')
  const historicalRateDifferences: Array<{ seasonLabel: string; published: string }> = []
  for (const row of rows) {
    const counts = ['試合', '勝利', '敗北', '引分'].map((field) => {
      const value = row.metrics[field]
      if (!value || !/^\d+$/u.test(value)) throw new Error(`Missing official team count: ${field}`)
      return Number(value)
    })
    const [games, wins, losses, draws] = counts as [number, number, number, number]
    if (games !== wins + losses + draws) throw new Error('Official team games and decisions disagree')
    if (wins + losses > 0) {
      const published = row.metrics.勝率 ?? ''
      if (!/^(?:0?\.\d{3}|1\.000)$/u.test(published)) throw new Error('Invalid published team winning percentage')
      if (Math.abs(Number(published) - wins / (wins + losses)) > 0.00050001) {
        if (row.year >= 2016) throw new Error('Official team winning percentage reconciliation failed')
        historicalRateDifferences.push({ seasonLabel: row.seasonLabel, published })
      }
    }
  }
  const basisText = html.match(/<td\b[^>]*class=["'][^"']*\bteyupdate\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/iu)?.[1]?.replace(/<[^>]+>/gu, '').replace(/\s+/gu, ' ').trim() ?? null
  return { rows, basisText, historicalRateDifferences }
}

/** Import a real capture with its original timestamps; an archive is never stamped as a new fetch. */
export async function saveOfficialTeamHistoryCapture(input: OfficialTeamHistoryCapture & { database: SqliteDatabase; storage: ObjectStorage }) {
  for (const timestamp of [input.fetchedAt, input.discovery.fetchedAt]) if (!/^\d{4}-\d\d-\d\dT/u.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) throw new Error('Invalid team history capture time')
  const indexUrl = `https://npb.jp/bis/teams/index_${input.team.teamId}.html`
  if (input.discovery.url !== indexUrl) throw new Error('Official team history discovery scope mismatch')
  const links = [...input.discovery.html.matchAll(/\bhref=["']([^"']+)["']/giu)].map((match) => new URL(match[1]!, indexUrl).href)
  if (!links.includes(input.sourceUrl)) throw new Error('Official index does not link to the captured team history')
  const parsed = parseOfficialTeamHistory(input.html, input)
  const contentHash = digest(input.html), snapshotId = digest(`${input.sourceUrl}\n${contentHash}`)
  const rawKey = `raw/bis-team-history/${input.team.teamId}/${contentHash}.html`
  const indexHash = digest(input.discovery.html), indexKey = `raw/bis-team-history/${input.team.teamId}/discovery/${indexHash}.html`
  const captureId = digest(`${snapshotId}\n${input.fetchedAt}\n${indexHash}\n${input.discovery.fetchedAt}`)
  const structuredKey = `structured/bis-team-history/${input.team.teamId}/captures/${captureId}.json`
  const evidence = { snapshotId, sourceUrl: input.sourceUrl, teamId: input.team.teamId, teamName: input.team.teamName, targetYear: input.targetYear, structuredKey,
    fetchedAt: input.fetchedAt, contentHash, rawKey, ...parsed,
    discovery: { sourceUrl: indexUrl, fetchedAt: input.discovery.fetchedAt, contentHash: indexHash, rawKey: indexKey } }
  await input.storage.putText(indexKey, input.discovery.html, 'text/html; charset=utf-8')
  await input.storage.putText(rawKey, input.html, 'text/html; charset=utf-8')
  await input.storage.putText(structuredKey, JSON.stringify(evidence, null, 2), 'application/json; charset=utf-8')
  withTransaction(input.database, () => {
    input.database.prepare(`INSERT INTO official_team_history_snapshots(snapshot_id,source_url,team_id,team_name,fetched_at,basis_text,content_hash,raw_key,row_count)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(snapshot_id) DO UPDATE SET fetched_at=excluded.fetched_at`)
      .run(snapshotId, input.sourceUrl, input.team.teamId, input.team.teamName, input.fetchedAt, parsed.basisText, contentHash, rawKey, parsed.rows.length)
    const insert = input.database.prepare(`INSERT INTO official_team_seasons(snapshot_id,season_label,year,row_index,metrics_json)
      VALUES (?,?,?,?,?) ON CONFLICT(snapshot_id,season_label) DO NOTHING`)
    parsed.rows.forEach((row, index) => insert.run(snapshotId, row.seasonLabel, row.year, index + 1, JSON.stringify(row.metrics)))
    const stored = input.database.prepare('SELECT season_label,year,row_index,metrics_json FROM official_team_seasons WHERE snapshot_id=? ORDER BY row_index').all(snapshotId) as Array<{ season_label: string; year: number; row_index: number; metrics_json: string }>
    if (stored.length !== parsed.rows.length || stored.some((row, index) => row.season_label !== parsed.rows[index]!.seasonLabel ||
      row.year !== parsed.rows[index]!.year || row.row_index !== index + 1 || !isDeepStrictEqual(JSON.parse(row.metrics_json), parsed.rows[index]!.metrics))) throw new Error('Official team history stored coverage/content mismatch')
  })
  return evidence
}

/** Discover the current official link before fetching; no year/month URL substitution. */
export async function captureOfficialTeamHistory(input: { database: SqliteDatabase; storage: ObjectStorage; team: BisTeamInfo; targetYear: number; fetch?: typeof fetch; now?: () => Date }) {
  const get = async (url: string) => {
    const fetchFn = input.fetch ?? fetch
    const response = await fetchFn(url, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'npb-archive-chat/0.1 (+https://npb-chat.dom9th-works.com/)' } })
    if (!response.ok || (response.url && response.url !== url)) throw new Error(`Official team history fetch failed: ${url} HTTP ${response.status}`)
    return { html: await response.text(), fetchedAt: (input.now?.() ?? new Date()).toISOString() }
  }
  if (!/^[a-z]+$/u.test(input.team.teamId)) throw new Error('Invalid official club ID')
  const indexUrl = `https://npb.jp/bis/teams/index_${input.team.teamId}.html`, index = await get(indexUrl)
  const links = [...index.html.matchAll(/\bhref=["']([^"']+)["']/giu)].map((match) => new URL(match[1]!, indexUrl).href)
  const sourceUrl = links.find((url) => url === `https://npb.jp/bis/teams/yearly_${input.team.teamId}.html`)
  if (!sourceUrl) throw new Error('Official club index lacks a history link')
  const capture = await get(sourceUrl)
  return saveOfficialTeamHistoryCapture({ ...input, ...capture, sourceUrl, discovery: { url: indexUrl, ...index } })
}
