import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('h3', () => ({
  getCookie: vi.fn(),
  getHeader: vi.fn(),
  getRequestURL: vi.fn(),
  setCookie: vi.fn(),
}))

import { createSignedCookieValue, verifyCookieSignature } from '../server/utils/parse-chat-identity'

const SECRET = 'test-secret-1234'
const USER_ID = 'abc-123'

function rawSign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

describe('verifyCookieSignature', () => {
  it('accepts a valid signed cookie', () => {
    const cookie = createSignedCookieValue(USER_ID, SECRET)
    expect(verifyCookieSignature(cookie, SECRET)).toBe(USER_ID)
  })

  it('rejects a cookie with a tampered userId', () => {
    const cookie = createSignedCookieValue(USER_ID, SECRET)
    const [, sig] = cookie.split('.')
    const tampered = `evil-user.${sig}`
    expect(verifyCookieSignature(tampered, SECRET)).toBeNull()
  })

  it('rejects a cookie with a tampered signature', () => {
    const sig = rawSign(USER_ID, SECRET)
    const tamperedSig = sig.slice(0, -4) + 'ZZZZ'
    const tampered = `${USER_ID}.${tamperedSig}`
    expect(verifyCookieSignature(tampered, SECRET)).toBeNull()
  })

  it('rejects a cookie signed with a different secret', () => {
    const cookie = createSignedCookieValue(USER_ID, 'wrong-secret')
    expect(verifyCookieSignature(cookie, SECRET)).toBeNull()
  })

  it('rejects an empty signature', () => {
    const cookie = `${USER_ID}.`
    expect(verifyCookieSignature(cookie, SECRET)).toBeNull()
  })

  it('rejects a cookie with no dot separator', () => {
    expect(verifyCookieSignature(USER_ID, SECRET)).toBeNull()
  })

  it('rejects an undefined cookie', () => {
    expect(verifyCookieSignature(undefined, SECRET)).toBeNull()
  })

  it('rejects a signature that is shorter than the expected HMAC', () => {
    const shortSig = rawSign(USER_ID, SECRET).slice(0, 10)
    expect(verifyCookieSignature(`${USER_ID}.${shortSig}`, SECRET)).toBeNull()
  })

  it('rejects a signature that is longer than the expected HMAC', () => {
    const longSig = rawSign(USER_ID, SECRET) + 'EXTRA'
    expect(verifyCookieSignature(`${USER_ID}.${longSig}`, SECRET)).toBeNull()
  })

  it('does not break existing cookie format: userId.base64url(hmac)', () => {
    const sig = rawSign(USER_ID, SECRET)
    const legacyCookie = `${USER_ID}.${sig}`
    expect(verifyCookieSignature(legacyCookie, SECRET)).toBe(USER_ID)
  })
})
