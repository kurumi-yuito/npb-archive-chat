import type { FetchLike } from '../../crawler/src/index'
import type { ObjectStorage } from './object-storage'

export type ScoreFetchPart = {
  ok: boolean
  status: number
  url: string
  text: string
}

export type FetchedScoreFiles = {
  index: ScoreFetchPart
  playbyplay: ScoreFetchPart
  box: ScoreFetchPart
  roster: ScoreFetchPart
}

export function buildScoresSlugFromGameId(gameId: string): string {
  const firstTeamSlug = gameId.match(/^r\d{8}([a-z0-9]+-[a-z0-9]+-\d{2})$/i)
  if (firstTeamSlug?.[1]) {
    return firstTeamSlug[1]
  }

  const farmSlug = gameId.match(/^f\d{8}([a-z0-9]+-[a-z0-9]+-\d{2})$/i)
  if (farmSlug?.[1]) {
    return farmSlug[1]
  }

  const direct = gameId.match(/^[a-z0-9]+-[a-z0-9]+-\d{2}$/i)
  if (direct) {
    return gameId
  }
  throw new Error(`Could not derive scores slug from game_id: ${gameId}`)
}

export const buildScoresSlug = buildScoresSlugFromGameId

export function buildScoresBaseUrl(year: number, mmdd: string, gameId: string): string {
  const slug = buildScoresSlugFromGameId(gameId)
  return `https://npb.jp/scores/${year}/${mmdd}/${slug}/`
}

export function buildScoresBaseUrlFromCanonicalUrl(canonicalUrl: string | null | undefined): string | null {
  if (!canonicalUrl) {
    return null
  }
  const match = canonicalUrl.match(/^(https:\/\/npb\.jp\/scores\/\d{4}\/\d{4}\/[a-z0-9]+-[a-z0-9]+-\d{2}\/)index\.html$/i)
  return match?.[1] ?? null
}

export async function fetchScoreFiles(
  fetchImpl: FetchLike,
  scoresBaseUrl: string,
  headers?: Record<string, string>,
): Promise<FetchedScoreFiles> {
  const base = scoresBaseUrl.endsWith('/') ? scoresBaseUrl : `${scoresBaseUrl}/`
  const urls = {
    index: `${base}index.html`,
    playbyplay: `${base}playbyplay.html`,
    box: `${base}box.html`,
    roster: `${base}roster.html`,
  } as const

  const [index, playbyplay, box, roster] = await Promise.all([
    fetchResponseSafely(fetchImpl, urls.index, headers),
    fetchResponseSafely(fetchImpl, urls.playbyplay, headers),
    fetchResponseSafely(fetchImpl, urls.box, headers),
    fetchResponseSafely(fetchImpl, urls.roster, headers),
  ])

  return {
    index: await toFetchPart(index, urls.index),
    playbyplay: await toFetchPart(playbyplay, urls.playbyplay),
    box: await toFetchPart(box, urls.box),
    roster: await toFetchPart(roster, urls.roster),
  }
}

export async function writeRawScoreFiles(
  storage: ObjectStorage,
  year: number,
  mmdd: string,
  gameId: string,
  files: FetchedScoreFiles,
): Promise<Record<'index' | 'playbyplay' | 'box' | 'roster', string>> {
  const paths = {
    index: storage.localPath(rawScoreKey(year, mmdd, gameId, 'index.html')),
    playbyplay: storage.localPath(rawScoreKey(year, mmdd, gameId, 'playbyplay.html')),
    box: storage.localPath(rawScoreKey(year, mmdd, gameId, 'box.html')),
    roster: storage.localPath(rawScoreKey(year, mmdd, gameId, 'roster.html')),
  }

  await Promise.all(
    (Object.keys(paths) as Array<keyof typeof paths>)
      .filter((key) => files[key].ok)
      .map((key) => storage.putText(rawScoreKey(year, mmdd, gameId, `${key}.html`), files[key].text, 'text/html; charset=utf-8')),
  )

  return paths
}

function rawScoreKey(year: number, mmdd: string, gameId: string, fileName: string): string {
  return `raw/${year}/${mmdd}/${gameId}/${fileName}`
}

async function toFetchPart(response: Response, url: string): Promise<ScoreFetchPart> {
  return {
    ok: response.ok,
    status: response.status,
    url,
    text: response.ok ? await response.text() : '',
  }
}

async function fetchResponseSafely(
  fetchImpl: FetchLike,
  url: string,
  headers?: Record<string, string>,
): Promise<Response> {
  const retriable = new Set([403, 429, 503])
  let last: Response | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetchImpl(url, { headers })
      if (!retriable.has(response.status) || attempt === 3) {
        return response
      }
      last = response
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      last = new Response(`fetch_error: ${message}`, {
        status: 598,
        statusText: 'ClientFetchError',
      })
      if (attempt === 3) {
        return last
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt * attempt))
  }
  return last ?? new Response('', { status: 598, statusText: 'ClientFetchError' })
}
