export function shouldRetryHttp({
  attempt,
  fetchRetryCount,
  httpRetryCount,
  status,
  code,
}) {
  return attempt < fetchRetryCount &&
    attempt < httpRetryCount &&
    (status === 429 || status === 503 || code === 'chat_llm_unavailable')
}
