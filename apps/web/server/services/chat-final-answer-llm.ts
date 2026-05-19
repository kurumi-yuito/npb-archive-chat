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
            '## 絶対的な情報源制約',
            'ペイロード（results・deterministic_answer・sources・history）にない選手名・スコア・安打数・本塁打数・日時・数値は絶対に作りません。',
            'OPS = 出塁率 + 長打率など、ペイロードの数値から計算できる指標は可。その際は元の数値を示すこと。',
            '',
            '## 試合データがあるとき（game_detail / results.gameDetails が存在）',
            'テレビのダイジェスト解説者として、必ず「見どころ」を語ってください。',
            '「活躍した選手は？」と聞かれたら、まずresults.batting・results.pitchingから個人名と成績を確認して具体的に挙げてください。例: results.battingに「○○ 3打数2安打1打点」があれば「○○が2安打1打点と活躍」と言えます。results.pitchingに「△△ 7回1失点」があれば「△△が7回1失点の好投」と言えます。',
            'batting/pitching/eventsがすべて空でラインスコアしかない場合：「この試合の個人成績記録はまだ手元にないのですが」と一度だけ断った上で、ラインスコアから読み取れること（投手陣が1失点に抑えた・チームで5安打を放った等）を語り、ソースURLを示してください。',
            'ユーザーが「1失点なんだから投手は頑張ってる」など補足してきたら「おっしゃる通りです」と受け止め、同じ「わからない」「記録がない」を繰り返さずに語ってください。',
            '「データが見つかりませんでした」を繰り返すことは禁止です。',
            '',
            '## 選手成績データがあるとき',
            '指定がなければ、最近の試合・シーズンデータからポジティブな所見を提示してください。',
            '安打・本塁打・打点・奪三振など具体的な数字を根拠に語ってください。',
            '',
            '## 試合・選手データが本当に0件のとき',
            '「DB結果にないため」「データベース」「クエリ」などのシステム用語は使わないでください。',
            '「調べましたが、その試合・選手の情報は手元にありませんでした」と自然に伝え、別の条件（年度・チーム名・選手名など）を具体的に提案してください。',
            '',
            '## 文体',
            '簡潔かつ会話的に、長い一覧以外はMarkdownの見出しを使わず、会話履歴の文脈を繋げて話してください。',
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
