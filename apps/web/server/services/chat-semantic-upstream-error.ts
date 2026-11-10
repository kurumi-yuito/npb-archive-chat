import { ChatQueryParserUnavailableError } from './chat-query-parser'

const quotaCodes = new Set(['insufficient_quota', 'credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded'])
const rateCodes = new Set(['rate_limit_exceeded', 'slow_down'])
const types = new Set(['insufficient_quota', 'rate_limit_error', 'server_error', 'service_unavailable_error', 'invalid_request_error', 'authentication_error'])

/** Keep only known diagnostic tokens. Provider prose, keys and arbitrary error
 * fields must never enter public errors or exception logs. */
export async function semanticUpstreamError(response: Response, stage: 'parser' | 'verifier'): Promise<ChatQueryParserUnavailableError> {
  let code: string | undefined, type: string | undefined
  try {
    const body = await response.json() as { error?: { code?: unknown; type?: unknown } }
    if (typeof body.error?.code === 'string' && (quotaCodes.has(body.error.code) || rateCodes.has(body.error.code) || body.error.code === 'server_is_overloaded')) code = body.error.code
    if (typeof body.error?.type === 'string' && types.has(body.error.type)) type = body.error.type
  } catch { /* Non-JSON provider errors remain unavailable, with no body logged. */ }
  const quota = (code !== undefined && quotaCodes.has(code)) || type === 'insufficient_quota'
  const rate = (code !== undefined && rateCodes.has(code)) || type === 'rate_limit_error'
  return new ChatQueryParserUnavailableError(`Semantic ${stage} upstream HTTP ${response.status}`, {
    status: response.status,
    reason: quota ? 'upstream_quota_exhausted' : rate ? 'upstream_rate_limited'
      : [401, 403].includes(response.status) ? 'upstream_authentication_failed' : 'upstream_unavailable',
    retryable: !quota && (rate || response.status >= 500), ...(code ? { code } : {}), ...(type ? { type } : {}),
  })
}
