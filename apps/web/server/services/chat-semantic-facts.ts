import { z } from '@npb/schemas'
import { chatCompletionModelParameters, type ChatQueryLlmConfig } from './chat-query-llm'
import type { ChatQueryParserContext } from './chat-query-parser-prompt'
import { ChatQueryParserUnavailableError } from './chat-query-parser'
import { semanticUpstreamError } from './chat-semantic-upstream-error'

const factsSchema = z.object({
  entity_mentions: z.array(z.object({ kind: z.enum(['player', 'team', 'venue']), mention: z.string().min(1) }).strict()),
  requires_causal_explanation: z.boolean(),
  comparison_period: z.enum(['none', 'season_to_date', 'bounded_period']),
}).strict()
export type SemanticFacts = z.infer<typeof factsSchema>

export function isArchiveDomainMention(value: string): boolean {
  return ['npb', '日本プロ野球', 'プロ野球'].includes(value.normalize('NFKC').replace(/\s+/gu, '').toLowerCase())
}

/** Read these conditions before exposing any candidate interpretation to this call. */
export async function extractSemanticFacts(config: ChatQueryLlmConfig, input: {
  message: string; context: ChatQueryParserContext; currentDate: string;
  fetch: typeof fetch; signal: AbortSignal; onRequest?: () => void
}): Promise<SemanticFacts> {
  input.onRequest?.()
  const fetchFn = input.fetch
  const response = await fetchFn(`${config.baseUrl.replace(/\/$/u, '')}/chat/completions`, {
    method: 'POST', signal: input.signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ ...chatCompletionModelParameters(config), max_completion_tokens: 1000,
      response_format: { type: 'json_schema', json_schema: { name: 'npb_semantic_facts', strict: true, schema: {
        type: 'object', additionalProperties: false,
        required: ['entity_mentions', 'requires_causal_explanation', 'comparison_period'],
        properties: {
          entity_mentions: { type: 'array', items: { type: 'object', additionalProperties: false,
            required: ['kind', 'mention'], properties: { kind: { type: 'string', enum: ['player', 'team', 'venue'] }, mention: { type: 'string' } } } },
          requires_causal_explanation: { type: 'boolean' },
          comparison_period: { type: 'string', enum: ['none', 'season_to_date', 'bounded_period'] },
        },
      } } },
      messages: [{ role: 'system', content: [
        '質問と会話履歴から、要求されている意味だけを独立して抽出してください。回答案・検索契約・野球の事実を推測しません。',
        'entity_mentionsは最新のユーザー文で明示された選手・球団またはリーグ・球場の名前を、原文の表現で列挙します。履歴だけにある名前や指示語は含めません。登録名やフルネームへ補完しません。',
        '列挙する名前は要求の対象または絞り込み条件になっているものです。別の試合の背景説明・補足の断定にだけ登場する第三者を、対決の対象や検索条件へ追加しません。',
        '名前には敬称・役割語（選手、投手、打者、さん、氏）を含めず、名前そのものの範囲だけを保持します。',
        'NPB・日本プロ野球・プロ野球はアーカイブのドメイン名であり、球団・リーグの固有名としてentity_mentionsへ追加しません。実際のリーグ名・球団名は保持します。',
        'requires_causal_explanationは、なぜそうなったかという原因や理由の説明をユーザーが求めた場合だけtrueです。数値の比較、増減、どちらが多いか、比較してどうかという要求は、原因説明の要求が別にない限りfalseです。',
        'comparison_periodは、異なる年のシーズン累計を同じ基準日まで比べる場合はseason_to_date、その他の対応する限定期間同士の比較はbounded_period、それ以外はnoneです。単なる年度全体の比較はnoneです。',
        'シーズン累計の成績に続く前年同時期との比較は、各年度のシーズン開始から対応する基準日までの累計比較です。現在の月だけの比較へ変更しません。',
        '単に「去年と比べて」と尋ねるだけでは、同時期・同日までの限定条件を追加しません。直前に年度全体の成績が表示された比較はnoneです。同時期との明示、または履歴に実際の限定期間がある場合だけ対応する期間比較にします。',
        '直近N試合・N登板を選手同士で比べる要求は件数窓の比較であり、年度ごとのカレンダー期間比較ではありません。その場合comparison_periodはnoneです。',
      ].join('\n') }, { role: 'user', content: JSON.stringify({ current_date_jst: input.currentDate, history: input.context.history ?? [], message: input.message }) }],
    }),
  }).catch((error) => { throw new ChatQueryParserUnavailableError(`Independent semantic extraction unavailable: ${String(error)}`) })
  if (!response.ok) throw await semanticUpstreamError(response, 'verifier')
  try {
    const payload = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string; refusal?: string | null } }> }
    const choice = payload.choices?.[0]
    if (choice?.finish_reason === 'length' || choice?.message?.refusal) throw new Error('Incomplete independent semantic extraction')
    const facts = factsSchema.parse(JSON.parse(choice?.message?.content ?? ''))
    return { ...facts, entity_mentions: facts.entity_mentions.filter((mention) => mention.kind !== 'team' || !isArchiveDomainMention(mention.mention)) }
  } catch (error) {
    throw new ChatQueryParserUnavailableError(`Invalid independent semantic extraction: ${String(error)}`)
  }
}
