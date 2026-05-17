import { createHmac, randomUUID } from 'node:crypto'
import { getCookie, getHeader, getRequestURL, setCookie, type H3Event } from 'h3'
import { createPublicApiError } from './public-api-error'

const USER_HEADER = 'x-npb-user-id'
const AUTH_HEADER = 'authorization'
const USER_COOKIE = 'npb_chat_user'
const AUTH_USER_COOKIE = 'npb_auth_user'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400

export type ChatIdentity = {
  userId: string
  authProvider: 'guest' | 'google'
}

export type ChatIdentityOptions = {
  allowHeaderFallback: boolean
  authSharedSecret?: string
  defaultPlan?: 'free' | 'pro'
}

export function parseChatIdentity(event: H3Event, options: ChatIdentityOptions): ChatIdentity {
  if (options.allowHeaderFallback && getHeader(event, USER_HEADER)?.trim()) {
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
    : getOrCreateCookieIdentity(event, secret)
}

function parseHeaderIdentity(event: H3Event): ChatIdentity {
  const userIdRaw = getHeader(event, USER_HEADER)
  const userId = userIdRaw?.trim() ?? ''
  if (!userId) {
    throw createPublicApiError(400, 'missing_user_id', 'Missing user identity')
  }

  return { userId, authProvider: 'guest' }
}

export function getSignedGuestUserId(event: H3Event, secret: string): string | null {
  return parseSignedUserCookie(getCookie(event, USER_COOKIE), secret)
}

export function setSignedAuthUserId(event: H3Event, userId: string, secret: string): void {
  setSignedUserCookie(event, AUTH_USER_COOKIE, userId, secret)
}

export function clearSignedAuthUserId(event: H3Event): void {
  setCookie(event, AUTH_USER_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    maxAge: 0,
  })
}

function getOrCreateCookieIdentity(event: H3Event, secret: string): ChatIdentity {
  const authUserId = parseSignedUserCookie(getCookie(event, AUTH_USER_COOKIE), secret)
  if (authUserId) {
    return { userId: authUserId, authProvider: 'google' }
  }

  const existing = parseSignedUserCookie(getCookie(event, USER_COOKIE), secret)
  if (existing) {
    return { userId: existing, authProvider: 'guest' }
  }

  const userId = randomUUID()
  setSignedUserCookie(event, USER_COOKIE, userId, secret)
  return { userId, authProvider: 'guest' }
}

function setSignedUserCookie(event: H3Event, name: string, userId: string, secret: string): void {
  setCookie(event, name, signUserId(userId, secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })
}

function isSecureRequest(event: H3Event): boolean {
  return getRequestURL(event).protocol === 'https:'
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
