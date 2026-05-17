import { createHmac, randomUUID } from 'node:crypto'
import { getCookie, getHeader, setCookie, type H3Event } from 'h3'
import { createPublicApiError } from './public-api-error'

const USER_HEADER = 'x-npb-user-id'
const AUTH_HEADER = 'authorization'
const USER_COOKIE = 'npb_chat_user'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400

export type ChatIdentity = {
  userId: string
}

export type ChatIdentityOptions = {
  allowHeaderFallback: boolean
  authSharedSecret?: string
  defaultPlan?: 'free' | 'pro'
}

export function parseChatIdentity(event: H3Event, options: ChatIdentityOptions): ChatIdentity {
  if (options.allowHeaderFallback) {
    return parseHeaderIdentity(event)
  }

  const secret = options.authSharedSecret?.trim()
  if (!secret) {
    throw createPublicApiError(503, 'auth_not_configured', 'Authentication is not configured')
  }

  const bearer = parseBearerToken(getHeader(event, AUTH_HEADER))
  const internalRequest = bearer === secret
  return internalRequest
    ? parseHeaderIdentity(event)
    : {
        userId: getOrCreateSignedUserId(event, secret),
      }
}

function parseHeaderIdentity(event: H3Event): ChatIdentity {
  const userIdRaw = getHeader(event, USER_HEADER)
  const userId = userIdRaw?.trim() ?? ''
  if (!userId) {
    throw createPublicApiError(400, 'missing_user_id', 'Missing user identity')
  }

  return { userId }
}

function getOrCreateSignedUserId(event: H3Event, secret: string): string {
  const existing = parseSignedUserCookie(getCookie(event, USER_COOKIE), secret)
  if (existing) {
    return existing
  }

  const userId = randomUUID()
  setCookie(event, USER_COOKIE, signUserId(userId, secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })
  return userId
}

function parseSignedUserCookie(value: string | undefined, secret: string): string | null {
  const [userId, signature] = (value ?? '').split('.')
  if (!userId || !signature) {
    return null
  }
  return sign(userId, secret) === signature ? userId : null
}

function signUserId(userId: string, secret: string): string {
  return `${userId}.${sign(userId, secret)}`
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function parseBearerToken(value: string | undefined): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed.toLowerCase().startsWith('bearer ')) {
    return ''
  }
  return trimmed.slice('bearer '.length).trim()
}
