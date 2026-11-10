/**
 * @param {{
 *   attempt: number,
 *   fetchRetryCount: number,
 *   httpRetryCount: number,
 *   status: number,
 *   code?: string | null,
 *   upstreamType?: string | null,
 *   upstreamCode?: string | null,
 *   retryable?: boolean,
 * }} input
 */
export function shouldRetryHttp({
  attempt,
  fetchRetryCount,
  httpRetryCount,
  status,
  code,
  upstreamType = null,
  upstreamCode = null,
  retryable,
}) {
  if (retryable === false || upstreamType === 'insufficient_quota' || upstreamCode === 'credit_balance_exhausted') {
    return false
  }
  return attempt < fetchRetryCount &&
    attempt < httpRetryCount &&
    (status === 429 || status === 503 || code === 'chat_llm_unavailable')
}

/** A corpus cannot recover shared provider access by asking another question. */
export function evaluationUpstreamStopReason(status, payload) {
  if (status < 400) return null
  const data = payload?.data
  return data?.code === 'chat_llm_unavailable' && ['upstream_quota_exhausted', 'upstream_rate_limited', 'upstream_authentication_failed', 'upstream_unavailable'].includes(data.reason)
    ? data.reason : null
}
