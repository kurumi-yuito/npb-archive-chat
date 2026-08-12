/**
 * @param {{
 *   attempt: number,
 *   fetchRetryCount: number,
 *   httpRetryCount: number,
 *   status: number,
 *   code?: string | null,
 *   upstreamType?: string | null,
 *   upstreamCode?: string | null,
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
}) {
  if (upstreamType === 'insufficient_quota' || upstreamCode === 'credit_balance_exhausted') {
    return false
  }
  return attempt < fetchRetryCount &&
    attempt < httpRetryCount &&
    (status === 429 || status === 503 || code === 'chat_llm_unavailable')
}
