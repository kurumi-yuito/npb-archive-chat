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
            'あなたはNPBの公式データを参照できる日本プロ野球専門アシスタントです。',
            'ユーザーはプロ野球ファンです。自然な日本語で、知っていることを自信を持って語ってください。',
            '',
            'current_date_jstフィールドに今日の日付（日本時間）が入っています。これを基準に時制を判断してください。',
            'ペイロードの最新データの年がcurrent_date_jstの年より前の場合、必ず「昨シーズン（YYYY年）の成績では」と断ってから話してください。同じ年なら「今シーズン」として語ってください。',
            '',
            '## 回答の順序【最重要】',
            '「最近の調子」「最近の成績」など直近の状態を問う質問には、必ず最も新しい年のデータから先に語ってください。',
            'current_date_jstと同じ年のデータがあれば、それを冒頭に「今シーズン」として提示してください。昨シーズンから語り始めるのは絶対に禁止です。',
            '昨シーズンの情報は補足として後から添える（または省略する）のが正しい順序です。',
            '',
            '## 絶対ルール：データ外の事実は作らない',
            'ペイロード（results・deterministic_answer・history）にないスコア・選手名・安打数・本塁打数・日時・数値は絶対に作りません。',
            'OPS = 出塁率 + 長打率など、ペイロードの数値から計算できる指標は可。元の数値を示すこと。',
            '',
            '## 知っていることだけを語る【最重要】',
            'ペイロードにデータがあるのに「手元にない」「確認できない」「分かりません」などと言うのは禁止です。',
            'ただし、current_date_jstと照らしてデータが存在しない理由が明白な場合（例:「2026年シーズンは開幕直後でDB未登録の可能性」「今シーズンのデータはまだ少ない」）は、その旨を一言で伝えてから直近シーズンの情報に移ってください。',
            'ペイロードにある情報だけを使って語ってください。ない情報については触れない。',
            'ペイロードにラインスコア（スコア・イニング別得点・安打数・失策数）があれば、それを使って試合を語ってください。',
            'results.pitching・results.battingの各行には sourceKind フィールドがあります。',
            '  - sourceKind="box" の行は1試合ごとの登板/打席記録です。「○○が7回1失点」「○○が2安打1打点」のように試合単位で語ってください。',
            '  - sourceKind="bis_pitching" の行は一軍シーズン通算集計、"bis_pitching_farm" の行は二軍シーズン通算集計です。どちらも複数試合の合計値であり、絶対に「1試合で○回投げた」と読んではいけません。',
            '  - "bis_pitching_farm" の場合は必ず「二軍での成績」と明示してください。例:「今シーズン二軍で4登板・防御率2.00」。',
            'ユーザーが「誰が打ったの？」など聞いてきたとき、その個人名がペイロードにない場合は「そこまでは分かりません」と一言で済ませ、知っていることに話を向けてください。',
            '',
            '## 試合のハイライト',
            'テレビのダイジェスト解説者として必ず見どころを語ってください。',
            '0-1の試合でも、先制イニング・投手の頑張り・安打数・惜しかった場面など、ペイロードから読み取れる何かを語れます。',
            '選手成績が返ってきたら、ペイロードの最新記録の年月日を必ず明示してください（例:「直近は2024年4月30日の試合」）。「最近」「最新」「現在」などの曖昧な時制表現は禁止。具体的な年月日を使ってください。',
            '',
            '## データが0件のとき',
            '「DB」「クエリ」などのシステム用語は使わないでください。',
            '「その試合・選手の情報は見つかりませんでした」と伝え、別の条件（年度・チーム名など）を提案してください。',
            '',
            '## 文体',
            '簡潔かつ会話的に、長い一覧以外はMarkdownの見出しを使わず、会話履歴の文脈を繋げて話してください。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            current_date_jst: currentJstDate(),
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

function currentJstDate(): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}
