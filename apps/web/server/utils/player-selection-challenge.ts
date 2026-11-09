import { queryContractSchema, z, type QueryContract } from '@npb/schemas'

const purpose = 'npb-player-selection-v1'
const lifetime = 15 * 60
const payloadSchema = z.object({
  version: z.literal(1), userId: z.string().min(1).max(256), message: z.string().min(1).max(4000),
  mention: z.string().min(1).max(128), candidateIds: z.array(z.string().min(1).max(64)).min(1).max(51),
  contract: queryContractSchema, issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().positive(),
}).strict().refine((payload) => payload.expiresAt === payload.issuedAt + lifetime)

export class InvalidPlayerSelectionChallengeError extends Error {
  constructor() { super('候補の選択を確認できませんでした。もう一度検索してから選択してください。') }
}

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/gu, '+').replace(/_/gu, '/')), (char) => char.charCodeAt(0))
const keyFor = async (secret: string) => {
  // Derive a purpose-specific key so this feature is not a signing oracle for
  // the existing authentication cookie protocol sharing the root secret.
  const root = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const derived = await crypto.subtle.sign('HMAC', root, new TextEncoder().encode(purpose))
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

/** Bind a previously verified meaning to its owner and original question.
 * Selection still re-resolves the candidate against current official data. */
export async function issuePlayerSelectionChallenge(input: {
  secret: string; userId: string; message: string; mention: string; candidateIds: string[]; contract: QueryContract; nowSeconds?: number
}): Promise<string> {
  if (!input.secret) throw new InvalidPlayerSelectionChallengeError()
  const issuedAt = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  const payload = payloadSchema.parse({ version: 1, userId: input.userId, message: input.message, mention: input.mention,
    candidateIds: input.candidateIds, contract: input.contract, issuedAt, expiresAt: issuedAt + lifetime })
  const encoded = encode(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign('HMAC', await keyFor(input.secret), new TextEncoder().encode(`${purpose}:${encoded}`))
  const token = `${encoded}.${encode(new Uint8Array(signature))}`
  if (token.length > 48000) throw new InvalidPlayerSelectionChallengeError()
  return token
}

export async function verifyPlayerSelectionChallenge(input: {
  token: string; secret: string; userId: string; message: string; mention: string; playerId: string; nowSeconds?: number
}): Promise<QueryContract> {
  try {
    if (!input.secret || input.token.length > 48000) throw new Error('Invalid selection')
    const parts = input.token.split('.')
    if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/u.test(part))) throw new Error('Invalid selection')
    const [encoded, signature] = parts as [string, string]
    if (!await crypto.subtle.verify('HMAC', await keyFor(input.secret), decode(signature), new TextEncoder().encode(`${purpose}:${encoded}`))) throw new Error('Invalid selection')
    const payload = payloadSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(encoded))))
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
    if (payload.expiresAt <= now || payload.issuedAt > now + 60 || payload.userId !== input.userId || payload.message !== input.message ||
      payload.mention !== input.mention || !payload.candidateIds.includes(input.playerId)) throw new Error('Invalid selection')
    return payload.contract
  } catch { throw new InvalidPlayerSelectionChallengeError() }
}
