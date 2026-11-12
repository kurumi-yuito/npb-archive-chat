/** QA rules allow whitespace and punctuation differences without changing
 * subjects, requested facts or numeric values. */
export const teamBattingComparisonPattern = /(?=[\s\S]*チーム打率)(?=[\s\S]*巨人)(?=[\s\S]*阪神)/u

export function matchesAcceptanceSummary(pattern, summary) {
  return typeof summary === 'string' && pattern.test(summary.replace(/\s+/gu, ' ')
    .replace(/(\d+(?:勝|敗|分))[、，,]\s*(?=\d+(?:勝|敗|分))/gu, '$1'))
}
