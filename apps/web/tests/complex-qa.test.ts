/**
 * 複雑QAテストケース - 人間の会話パターンを模した複雑・曖昧・条件付きクエリのテスト
 *
 * このテストは stub parser + 実DB（multi-year SQLite）を使う探索用テスト。
 * productionの自然文解釈はLLM Plannerを使うため、通常の pnpm test では実行しない。
 * 必要な場合は RUN_COMPLEX_QA=1 で明示実行する。
 */
import { describe, it, expect, afterAll } from 'vitest'
import { createMultiYearQueryService } from '@npb/db'
import { createChatService } from '../server/services/chat-service'
import { parseStructuredQueryFromMessageStub } from '../server/services/chat-query-parser-stub'
import path from 'node:path'

const SQLITE_DIR = path.resolve(process.cwd(), 'data')

let queryService: ReturnType<typeof createMultiYearQueryService>
const describeComplex = process.env.RUN_COMPLEX_QA === '1' ? describe : describe.skip

function getService() {
  if (!queryService) {
    queryService = createMultiYearQueryService({ sqliteDir: SQLITE_DIR })
  }
  return createChatService(queryService, {
    parseStructuredQueryFromMessage: async (msg) => parseStructuredQueryFromMessageStub(msg),
  })
}

afterAll(() => {
  queryService?.close()
})

async function ask(message: string) {
  return getService().answerQuestion(message)
}

// ─────────────────────────────────────────────
// カテゴリ1: 在籍確認・移籍履歴
// ─────────────────────────────────────────────
describeComplex('カテゴリ1: 在籍確認・移籍履歴', () => {
  it('C1-1: 田中将大の現在の所属チームを確認', async () => {
    const r = await ask('田中将大って今どこのチームにいるの？')
    console.log('C1-1:', r.answer.summary?.slice(0, 200))
    expect(r.answer.summary).toBeTruthy()
    expect(r.answer.summary).not.toMatch(/見つかりません|ありません|不明/)
  })

  it('C1-2: 田中将大の2021年（NPB復帰後）成績', async () => {
    const r = await ask('田中将大の2021年の成績を教えてください')
    console.log('C1-2:', r.answer.summary?.slice(0, 200))
    // 2021年は楽天在籍のはず
    expect(r.answer.summary).toBeTruthy()
    expect(r.answer.summary).not.toMatch(/在籍していません|NPBにいません/)
  })

  it('C1-3: 山本由伸のNPB在籍確認', async () => {
    const r = await ask('山本由伸はNPBにはいないんですよね？')
    console.log('C1-3:', r.answer.summary?.slice(0, 200))
    // DBにないならその旨を言いつつ最終在籍年を案内するべき
    expect(r.answer.summary).toBeTruthy()
  })

  it('C1-4: 大谷翔平のNPB時代の通算成績', async () => {
    const r = await ask('大谷翔平のNPB時代（日本ハム）の通算本塁打数を教えて')
    console.log('C1-4:', r.answer.summary?.slice(0, 200))
    expect(r.answer.summary).toBeTruthy()
    // 2016年以降に日本ハムにいたことがあればそのデータを
  })
})

// ─────────────────────────────────────────────
// カテゴリ2: 複合条件ランキング
// ─────────────────────────────────────────────
describeComplex('カテゴリ2: 複合条件ランキング', () => {
  it('C2-1: 今シーズンのパ・リーグ防御率ランキング（先発条件付き）', async () => {
    const r = await ask('2026年のパ・リーグで防御率がいい投手を5人教えて')
    console.log('C2-1:', r.answer.summary?.slice(0, 200))
    expect(r.answer.summary).toBeTruthy()
    expect(r.answer.summary).not.toMatch(/見つかりません|ありません/)
  })

  it('C2-2: 2022年から2024年の通算打点ランキング', async () => {
    const r = await ask('2022年から2024年の3年間でNPB全体で最も打点が多い打者トップ3')
    console.log('C2-2:', r.answer.summary?.slice(0, 300))
    expect(r.answer.summary).toBeTruthy()
  })

  it('C2-3: 今シーズンのセ・リーグ打率ランキング', async () => {
    const r = await ask('2026年セ・リーグの打率ランキングを教えてください')
    console.log('C2-3:', r.answer.summary?.slice(0, 200))
    expect(r.answer.summary).toBeTruthy()
  })

  it('C2-4: チームの勝敗（口語）', async () => {
    const r = await ask('今年のソフトバンクって強すぎない？何勝してるの')
    console.log('C2-4:', r.answer.summary?.slice(0, 200))
    // WIN_LOSS_PATTERN + team抽出で aggregate_games にrewireされるか
    expect(r.structured_query!.intent).toBe('aggregate_games')
    expect(r.answer.summary).toBeTruthy()
  })

  it('C2-5: チームの今シーズン勝敗（通常表現）', async () => {
    const r = await ask('ソフトバンクの今シーズンの勝敗を教えてください')
    console.log('C2-5:', r.answer.summary?.slice(0, 200))
    // 勝敗 keyword + チーム名で aggregate_games rewrite
    expect(r.structured_query!.intent).toBe('aggregate_games')
    expect(r.answer.summary).toBeTruthy()
  })
})

// ─────────────────────────────────────────────
// カテゴリ3: 複数年・キャリア跨ぎ
// ─────────────────────────────────────────────
describeComplex('カテゴリ3: 複数年・キャリア跨ぎ', () => {
  it('C3-1: 牧秀悟の複数年通算成績', async () => {
    const r = await ask('牧秀悟の2022年から2025年の通算打率と本塁打数を教えて')
    console.log('C3-1:', r.answer.summary?.slice(0, 300))
    expect(r.answer.summary).toBeTruthy()
  })

  it('C3-2: 岡本和真の2020年代通算本塁打', async () => {
    const r = await ask('岡本和真の2020年から2024年の合計本塁打数はいくつ？')
    console.log('C3-2:', r.answer.summary?.slice(0, 300))
    expect(r.answer.summary).toBeTruthy()
  })

  it('C3-3: 近藤健介のオリックス時代から日本ハム時代の成績比較ができるか', async () => {
    // これはシステムが単一選手の複数年成績を返せるかのテスト
    const r = await ask('近藤健介の2023年と2024年の打撃成績を教えて')
    console.log('C3-3:', r.answer.summary?.slice(0, 300))
    expect(r.answer.summary).toBeTruthy()
  })
})

// ─────────────────────────────────────────────
// カテゴリ4: 俗語・口語・曖昧表現
// ─────────────────────────────────────────────
describeComplex('カテゴリ4: 俗語・口語・曖昧表現', () => {
  it('C4-1: ロッテの1番打者を口語で聞く', async () => {
    const r = await ask('最近ロッテの1番ってだれが多いの？')
    console.log('C4-1:', r.answer.summary?.slice(0, 200))
    expect(r.answer.summary).toBeTruthy()
    expect(r.answer.summary).not.toMatch(/見つかりません|ありません/)
  })

  it('C4-2: チームの強さを口語で聞く', async () => {
    const r = await ask('阪神って今シーズン強いの？勝ち越してる？')
    console.log('C4-2:', r.answer.summary?.slice(0, 200))
    // 勝ち越し keyword + チーム名で aggregate_games rewrite
    expect(r.structured_query!.intent).toBe('aggregate_games')
    expect(r.answer.summary).toBeTruthy()
  })

  it('C4-3: 防御率を計算式込みで依頼', async () => {
    const r = await ask('広島の2026年の先発防御率、自責点÷投球回×9で計算してほしい')
    console.log('C4-3:', r.answer.summary?.slice(0, 300))
    expect(r.answer.summary).toBeTruthy()
  })

  it('C4-4: 俗語表現「ホームに強い？」', async () => {
    const r = await ask('広島ってホームに強い？今シーズンのホーム成績教えて')
    console.log('C4-4:', r.answer.summary?.slice(0, 200))
    // ホームゲーム＝マツダスタジアムで絞り込めるか
    expect(r.answer.summary).toBeTruthy()
  })
})

// ─────────────────────────────────────────────
// カテゴリ5: 打席条件・打順・守備位置の組み合わせ
// ─────────────────────────────────────────────
describeComplex('カテゴリ5: 打席条件・打順・守備位置', () => {
  it('C5-1: 直近で4番ライトの出場', async () => {
    const r = await ask('今シーズンDeNAで4番ライトで出たのって直近でいつ？')
    console.log('C5-1:', r.answer.summary?.slice(0, 200))
    expect(r.answer.summary).toBeTruthy()
  })

  it('C5-2: 5番サードの直近', async () => {
    const r = await ask('阪神で5番サードって最後いつ？')
    console.log('C5-2:', r.answer.summary?.slice(0, 200))
    expect(r.answer.summary).toBeTruthy()
  })

  it('C5-3: 特定試合のスタメン', async () => {
    const r = await ask('2026年5月10日の広島のスタメン教えて')
    console.log('C5-3:', r.answer.summary?.slice(0, 300))
    expect(r.answer.summary).toBeTruthy()
  })
})

// ─────────────────────────────────────────────
// カテゴリ6: 複数選手比較
// ─────────────────────────────────────────────
describeComplex('カテゴリ6: 複数選手比較', () => {
  it('C6-1: セ・リーグOPSランキング', async () => {
    const r = await ask('今シーズンのセ・リーグOPSランキングを教えてください')
    console.log('C6-1:', r.answer.summary?.slice(0, 300))
    expect(r.answer.summary).toBeTruthy()
  })

  it('C6-2: パ・リーグ奪三振ランキング', async () => {
    const r = await ask('2026年パ・リーグの奪三振ランキングトップ5は？')
    console.log('C6-2:', r.answer.summary?.slice(0, 200))
    expect(r.answer.summary).toBeTruthy()
  })

  it('C6-3: 特定選手の2球団比較（移籍前後）', async () => {
    // 2024年に楽天→巨人に移籍した選手（則本昂大）の比較
    const r = await ask('則本昂大の2024年と2023年の成績を比較して')
    console.log('C6-3:', r.answer.summary?.slice(0, 300))
    expect(r.answer.summary).toBeTruthy()
  })
})

// ─────────────────────────────────────────────
// カテゴリ7: 時間範囲の指定
// ─────────────────────────────────────────────
describeComplex('カテゴリ7: 時間範囲・期間指定', () => {
  it('C7-1: 今シーズン序盤（年指定）の成績', async () => {
    const r = await ask('2026年の阪神の主な打者成績を教えてください')
    console.log('C7-1:', r.answer.summary?.slice(0, 200))
    expect(r.answer.summary).toBeTruthy()
    expect(r.structured_query!.filters).toMatchObject({ year: 2026 })
  })

  it('C7-2: 特定月の成績', async () => {
    const r = await ask('2026年5月10日の広島の試合結果')
    console.log('C7-2:', r.answer.summary?.slice(0, 200))
    expect(r.answer.summary).toBeTruthy()
  })

  it('C7-3: 去年の成績', async () => {
    const r = await ask('昨シーズン（2025年）の村上宗隆の成績を教えてください')
    console.log('C7-3:', r.answer.summary?.slice(0, 300))
    // year=2025 は正確に抽出される
    expect(r.structured_query!.filters).toMatchObject({ year: 2025 })
    // ローカルDBにplayer_profilesがないため選手名は正確に解決されない場合があるが
    // 少なくともanswerが返ること（result_count条件は設けない）
    expect(r.answer.summary).toBeTruthy()
  })
})

// ─────────────────────────────────────────────
// カテゴリ8: イベント系クエリの検証
// ─────────────────────────────────────────────
describeComplex('カテゴリ8: イベントクエリ（非標準event_type対応確認）', () => {
  it('C8-1: 特定試合のイベント検索が500にならないこと', async () => {
    const r = await ask('2026年5月10日の広島の試合でどんなイベントがあった？')
    console.log('C8-1:', r.answer.summary?.slice(0, 200))
    // スキーマバリデーションエラーが起きないことを確認
    expect(r.answer.summary).toBeTruthy()
    expect(r.answer.result_count).toBeGreaterThanOrEqual(0)
  })

  it('C8-2: 特定試合の盗塁イベント', async () => {
    const r = await ask('2026年5月15日の阪神vs広島の試合で盗塁はあった？')
    console.log('C8-2:', r.answer.summary?.slice(0, 200))
    expect(r.answer.summary).toBeTruthy()
  })

  it('C8-3: 本塁打一覧', async () => {
    const r = await ask('2026年5月に広島で打たれたホームランを教えて')
    console.log('C8-3:', r.answer.summary?.slice(0, 300))
    expect(r.answer.summary).toBeTruthy()
  })
})

// ─────────────────────────────────────────────
// カテゴリ9: 否定・特殊ケース
// ─────────────────────────────────────────────
describeComplex('カテゴリ9: 否定・特殊ケース', () => {
  it('C9-1: NPB範囲外のMLB選手への応答', async () => {
    const r = await ask('大谷翔平の2025年のMLB成績を教えてください')
    console.log('C9-1:', r.answer.summary?.slice(0, 200))
    // NPBにいない旨を案内しつつNPB時代のデータを提供するべき
    expect(r.answer.summary).toBeTruthy()
  })

  it('C9-2: 引退選手への応答', async () => {
    const r = await ask('イチローの2016年の成績を教えてください')
    console.log('C9-2:', r.answer.summary?.slice(0, 200))
    // DBに存在しない旨の適切な応答
    expect(r.answer.summary).toBeTruthy()
  })

  it('C9-3: 曖昧な選手名（姓のみ）への応答', async () => {
    const r = await ask('今シーズンの田中の成績を教えてください')
    console.log('C9-3:', r.answer.summary?.slice(0, 300))
    // 姓のみのため ambiguous または not_found（stub parser + ローカルDBの制約）
    // LLMパーサーなら ambiguous を返すはずだが、stubでは分岐が異なる場合がある
    expect(['ambiguous', 'not_found']).toContain(r.answer.resolved_player?.status)
  })

  it('C9-4: オフトピックへの応答', async () => {
    const r = await ask('今日の天気はどうですか？')
    console.log('C9-4:', r.answer.summary?.slice(0, 100))
    // stubパーサーはoff_topicを検出できないが、answerは返る
    expect(r.answer.summary).toBeTruthy()
  })
})

// ─────────────────────────────────────────────
// カテゴリ10: サブリミナル・複合困難クエリ
// ─────────────────────────────────────────────
describeComplex('カテゴリ10: 複合困難クエリ', () => {
  it('C10-1: 7回以上投げて自責点0の登板数ランキング（2026年）', async () => {
    const r = await ask('今シーズンの先発登板で7回以上投げて自責点0だった試合が一番多い投手は？')
    console.log('C10-1:', r.answer.summary?.slice(0, 300))
    // 複雑な条件指定はLLMパーサーが必要。stubでは search_pitching に落ちる
    expect(r.answer.summary).toBeTruthy()
  })

  it('C10-2: WHIP（計算式指定）ランキング', async () => {
    const r = await ask('今シーズンセ・リーグで（被安打＋与四球）÷投球回のWHIPが最も低い投手を3人教えて')
    console.log('C10-2:', r.answer.summary?.slice(0, 300))
    expect(r.answer.summary).toBeTruthy()
  })

  it('C10-3: 今シーズン一番4番に多く座っている選手', async () => {
    const r = await ask('今シーズン阪神で最も多く4番に起用された選手は？')
    console.log('C10-3:', r.answer.summary?.slice(0, 200))
    expect(r.answer.summary).toBeTruthy()
  })

  it('C10-4: 複数チームに在籍していた選手の球団別成績', async () => {
    const r = await ask('山川穂高の西武時代（2022年）とソフトバンク移籍後（2024年）の本塁打数を比べて')
    console.log('C10-4:', r.answer.summary?.slice(0, 300))
    // 括弧内年号の解析はLLMパーサーが必要。stubではyear抽出が1年のみ
    // year=2022 か year=2024 が抽出され、山川穂高のデータが得られるか確認
    expect(r.answer.summary).toBeTruthy()
  })

  it('C10-5: 開幕から特定日までの成績', async () => {
    const r = await ask('2026年のDeNAの5月末時点の打者成績を教えて')
    console.log('C10-5:', r.answer.summary?.slice(0, 200))
    expect(r.answer.summary).toBeTruthy()
  })
})
