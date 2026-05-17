import { randomBytes } from 'node:crypto'
import { getCookie, getRequestURL, sendRedirect, setCookie, type H3Event } from 'h3'
import type { ChatRuntimeAuthConfig } from './chat-runtime-config'
import { createPublicApiError } from './public-api-error'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const STATE_COOKIE = 'npb_google_oauth_state'
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60

export type GoogleUserInfo = {
  sub: string
  email: string | null
  emailVerified: boolean
  name: string | null
}

export function requireGoogleAuthConfig(config: ChatRuntimeAuthConfig): void {
  if (!config.authSharedSecret) {
    throw createPublicApiError(503, 'auth_not_configured', 'Authentication is not configured')
  }
  if (!config.googleAuthConfigured) {
    throw createPublicApiError(503, 'google_auth_not_configured', 'Google authentication is not configured')
  }
}

export async function redirectToGoogleAuth(event: H3Event, config: ChatRuntimeAuthConfig): Promise<void> {
  requireGoogleAuthConfig(config)
  const redirectUri = googleRedirectUri(event, config)
  const state = randomBytes(24).toString('base64url')
  setCookie(event, STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  })

  const url = new URL(GOOGLE_AUTH_URL)
  url.searchParams.set('client_id', config.googleClientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  await sendRedirect(event, url.toString(), 302)
}

export async function exchangeGoogleCodeForUser(
  event: H3Event,
  config: ChatRuntimeAuthConfig,
  code: string,
  state: string,
): Promise<GoogleUserInfo> {
  requireGoogleAuthConfig(config)
  assertValidState(event, state)
  const redirectUri = googleRedirectUri(event, config)
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenResponse.ok) {
    throw createPublicApiError(502, 'google_token_exchange_failed', 'Google token exchange failed')
  }
  const token = (await tokenResponse.json()) as { access_token?: string }
  if (!token.access_token) {
    throw createPublicApiError(502, 'google_access_token_missing', 'Google access token is missing')
  }

  const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      authorization: `Bearer ${token.access_token}`,
    },
  })
  if (!userInfoResponse.ok) {
    throw createPublicApiError(502, 'google_userinfo_failed', 'Google userinfo request failed')
  }
  const userInfo = (await userInfoResponse.json()) as {
    sub?: string
    email?: string
    email_verified?: boolean
    name?: string
  }
  if (!userInfo.sub) {
    throw createPublicApiError(502, 'google_subject_missing', 'Google account id is missing')
  }
  return {
    sub: userInfo.sub,
    email: userInfo.email ?? null,
    emailVerified: userInfo.email_verified === true,
    name: userInfo.name ?? null,
  }
}

export function clearGoogleStateCookie(event: H3Event): void {
  setCookie(event, STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    maxAge: 0,
  })
}

function isSecureRequest(event: H3Event): boolean {
  return getRequestURL(event).protocol === 'https:'
}

function assertValidState(event: H3Event, state: string): void {
  const expected = getCookie(event, STATE_COOKIE)
  clearGoogleStateCookie(event)
  if (!expected || !state || expected !== state) {
    throw createPublicApiError(400, 'invalid_oauth_state', 'Invalid OAuth state')
  }
}

function googleRedirectUri(event: H3Event, config: ChatRuntimeAuthConfig): string {
  if (config.googleRedirectUrl) {
    return config.googleRedirectUrl
  }
  const requestUrl = getRequestURL(event)
  return `${requestUrl.origin}/api/auth/google/callback`
}
