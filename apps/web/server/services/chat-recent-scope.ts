export function inferRecentAppearanceLimit(message: string): number | undefined {
  const normalized = message.normalize('NFKC').replace(/\s+/gu, '')
  const explicitCount = normalized.match(/(?:直近|最近|ここ)(\d{1,2})(?:試合|登板)/u)
  if (explicitCount?.[1]) {
    const count = Number(explicitCount[1])
    return Number.isInteger(count) && count > 0 ? count : undefined
  }
  if (
    /(?:直近|最新|最後|最終)(?:の)?(?:試合|登板)/u.test(normalized) ||
    /最後に投げた試合/u.test(normalized)
  ) {
    return 1
  }
  return undefined
}
