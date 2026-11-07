/** QA rules allow whitespace/newline differences without changing meaning. */
export function matchesAcceptanceSummary(pattern, summary) {
  return typeof summary === 'string' && pattern.test(summary.replace(/\s+/gu, ' '))
}
