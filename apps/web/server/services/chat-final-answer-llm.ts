import type { ChatRequest, ChatResponseCore } from '@npb/schemas'

export type ChatFinalAnswerLlmConfig = {
  baseUrl?: string
  apiKey?: string
  model?: string
}

export type ChatFinalAnswerInput = ChatResponseCore & {
  history?: ChatRequest['history']
}

export type ChatFinalAnswerGenerator = (input: ChatFinalAnswerInput) => Promise<string>

export function hasChatFinalAnswerLlmConfig(config: ChatFinalAnswerLlmConfig): boolean {
  return Boolean(config.apiKey?.trim() && config.model?.trim())
}

export function createChatFinalAnswerLlm(config: ChatFinalAnswerLlmConfig): ChatFinalAnswerGenerator {
  const baseUrl = (config.baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '')
  const apiKey = config.apiKey?.trim()
  const model = config.model?.trim()
  if (!apiKey || !model) {
    throw new Error('CHAT_ANSWER_LLM_API_KEY and CHAT_ANSWER_LLM_MODEL must be set')
  }

  return async (input) => {
    const url = `${baseUrl}/chat/completions`
    const headers = {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    }
    const reqBody = JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: [
            'あなたはNPB（日本プロ野球）専門のチャットアシスタントです。',
            'ユーザーは全国のプロ野球ファンで、AIやシステムに詳しくない一般の方が多いです。',
            '詳しい野球好きの友人として、自然な日本語で親しみやすく答えてください。',
            '',
            '## 情報ソースの制約',
            'ペイロードに含まれるDB結果・選手情報・会話履歴・情報源URLのみを根拠にしてください。',
            'ペイロードにない選手名・チーム名・スコア・安打数・本塁打数・日時・数値などの具体的な事実は絶対に作りません。',
            '集計値から単純な指標（OPS = 出塁率 + 長打率など）を計算することは可能です。その際は元の数値を示してください。',
            '',
            '## データが見つからない・0件のとき',
            '「DB結果にないため」「データベース」「クエリ」「推測では回答しません」などのシステム用語は絶対に使わないでください。',
            '「調べましたが、手元のデータには該当する情報が見つかりませんでした」のように自然に伝えてください。',
            '条件を変えることで見つかる可能性（別の年度・チーム名・選手名での検索など）を具体的に提案してください。',
            '得点・安打数など具体的な数字は絶対に推測・捏造しないでください。',
            'ただし一般的なNPBの知識（選手のポジション・チームの歴史など推測と明記できる範囲）は補足として加えても構いません。',
            '',
            '## データがあるとき',
            '野球ファンとして面白い視点でコメントを加え、印象的な場面や数字を強調してください。',
            '情報源URLがあれば参照として示してください。',
            'deterministic_answerは下書きとして参考にしてよいですが、必ず自然な会話文に書き直してください。',
            '',
            '## 文体',
            '簡潔かつ会話的に書いてください。長い一覧以外はMarkdownの見出しを使わないでください。',
            '会話履歴（history）を踏まえ、文脈を繋げて自然に話してください。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            question: input.message,
            history: input.history ?? [],
            structured_query: input.structured_query,
            deterministic_answer: input.answer,
            results: input.results,
            sources: input.sources,
          }),
        },
      ],
    })

    const delays = [1000, 2000]
    let response: Response | undefined
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      response = await fetch(url, { method: 'POST', headers, body: reqBody })
      if (response.status !== 429 || attempt === delays.length) break
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]))
    }

    if (!response!.ok) {
      throw new Error(`Final answer LLM failed with HTTP ${response!.status}`)
    }

    const resBody = (await response!.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = resBody.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new Error('Final answer LLM returned empty content')
    }
    return content
  }
}
