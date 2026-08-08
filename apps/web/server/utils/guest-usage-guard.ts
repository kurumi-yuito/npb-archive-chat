import { createHmac } from 'node:crypto'
import { getHeader, type H3Event } from 'h3'

export function guestUsageGuardBucketKey(event: H3Event, secret: string): string {
  const ip = clientNetworkPrefix(getHeader(event, 'cf-connecting-ip') ?? getHeader(event, 'x-forwarded-for') ?? '')
  const userAgent = getHeader(event, 'user-agent') ?? ''
  const language = getHeader(event, 'accept-language') ?? ''
  const platform = getHeader(event, 'sec-ch-ua-platform') ?? ''
  const mobile = getHeader(event, 'sec-ch-ua-mobile') ?? ''
  const fingerprint = [ip, userAgent, language, platform, mobile].join('\n')
  return `guest-guard:${createHmac('sha256', secret).update(fingerprint).digest('base64url')}`
}

function clientNetworkPrefix(raw: string): string {
  const ip = raw.split(',')[0]?.trim() ?? ''
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    return ip.split('.').slice(0, 3).join('.')
  }
  if (ip.includes(':')) return ip.split(':').slice(0, 4).join(':')
  return 'unknown'
}
