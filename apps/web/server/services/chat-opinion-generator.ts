import type { ChatResponseCore } from '@npb/schemas'
import type { ChatCapabilityIntent } from './chat-capability'

type GenerateOpinionCommentInput = {
  intent: ChatCapabilityIntent
  answer: ChatResponseCore['answer']
  results: ChatResponseCore['results']
}

export function generateOpinionComment({
  intent,
  answer,
  results,
}: GenerateOpinionCommentInput): string | null {
  if (intent !== 'opinion') {
    return null
  }
  if (!hasAnalysisEvidence(results)) {
    return 'データ上の根拠が足りないため、評価は保留です。ニュースやコンディションは推測せず、成績が増えた段階で見直すのが妥当です。'
  }
  if (/データを見る限り|数字から判断すると|現時点の成績から考えると/u.test(answer.summary)) {
    return null
  }
  return 'データを見る限り、評価はこの成績面の根拠に限って述べられます。ニュース、ケガ、契約、首脳陣の意図は推測せず、示された数字から判断すると上の内容が現時点の見立てです。'
}

export function appendOpinionComment(
  answer: ChatResponseCore['answer'],
  input: GenerateOpinionCommentInput,
): ChatResponseCore['answer'] {
  const comment = generateOpinionComment(input)
  if (!comment) {
    return answer
  }
  return {
    ...answer,
    summary: `${answer.summary}\n${comment}`,
  }
}

function hasAnalysisEvidence(results: ChatResponseCore['results']): boolean {
  return results.events.length > 0 ||
    results.games.length > 0 ||
    results.pitching.length > 0 ||
    results.batting.length > 0 ||
    results.roster.length > 0 ||
    results.affiliations.length > 0 ||
    results.gameDetails.length > 0 ||
    results.aggregates.length > 0
}
