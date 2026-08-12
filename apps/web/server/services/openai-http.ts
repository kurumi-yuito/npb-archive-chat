export async function isQuotaExhaustedResponse(response: Response): Promise<boolean> {
  if (response.status !== 429) return false
  const body = await response.clone().text().catch(() => '')
  return body.includes('"type":"insufficient_quota"') ||
    body.includes('"type": "insufficient_quota"') ||
    body.includes('"code":"credit_balance_exhausted"') ||
    body.includes('"code": "credit_balance_exhausted"')
}
