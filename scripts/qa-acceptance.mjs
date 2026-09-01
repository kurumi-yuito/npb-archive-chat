import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const baseUrl = process.env.NPB_ACCEPTANCE_BASE_URL ?? 'http://127.0.0.1:3000'
const selection = process.argv.find((arg) => arg.startsWith('--cases='))?.slice('--cases='.length) ?? 'all'
const outputDir = path.resolve(process.env.NPB_ACCEPTANCE_OUTPUT_DIR ?? 'data/logs')

const conversations = [
  single('B01', '昨日の巨人の試合結果を教えて', 'partial'),
  single('B02', '今日のパ・リーグの試合結果を教えて', 'pass'),
  single('B03', '来週セ・リーグの試合予定はありますか'),
  single('B04', '大谷翔平の今シーズンの成績を教えて', 'pass'),
  single('B05', '山本由伸投手の防御率を教えて'),
  single('B06', '今シーズン一番ホームランを打っている選手は誰ですか'),
  single('B07', 'セ・リーグの本塁打ランキングトップ5を教えて'),
  single('B08', '巨人と阪神、今シーズンどっちが打率高いですか'),
  single('B09', '村上宗隆は最近調子いいですか'),
  single('B10', 'なんで今年のオリックスは去年より順位が落ちたんですか'),
  single('B11', '佐々木朗希の直近の登板結果と、その試合の相手先発投手を教えて'),
  single('B12', 'ヤクルトの村上、今季何本塁打打った?'),
  single('B13', '阪神さん、最近勝ってますか?'),
  single('B14', 'この前のカード、負け越しましたっけ?'),
  single('B15', '中日ドラゴンズの監督は誰ですか'),
  single('B16', '2025年の日本シリーズどっちが勝ちましたか'),
  single('B17', '藤浪晋太郎は今どこの球団にいますか'),
  single('B18', 'ロッテとオリックスってどっちが強いですか'),
  single('B19', '田中将大の通算勝利数を教えてください'),
  single('B20', '巨人の岡本、今年もタイトル獲れそうですか'),
  single('B21', 'さっき言ってた選手、ホームラン何本でしたっけ'),
  single('B22', '5月にホームランを一番打ったのは誰ですか'),
  single('B23', '巨人vs阪神の今シーズン対戦成績と、今後の日程を教えて'),
  single('B24', '高校野球の結果もわかりますか?'),
  single('B25', 'パ・リーグの今の順位表を教えて'),
  single('B26', '森下翔太ってどんな選手ですか?'),
  single('B27', '阪神タイガーズの今年の成績おしえてください'),
  single('B28', '巨人 今年 何勝?'),
  single('B29', 'オリックス対ロッテの8月の対戦成績は?'),
  single('B30', '巨人が優勝できる可能性はどれくらいですか?'),
  single('B31', '田中選手の成績を教えて'),
  single('B32', '西武の山川、今年何本塁打打ってますか?'),
  single('B33', '二軍の試合結果もわかりますか?'),
  multi('MT01', [
    '阪神は今シーズン何勝してますか？',
    'セ・リーグの中では何位ですか？',
    '去年の同じ時期と比べてどうですか？',
  ]),
  multi('MT02', [
    '村上宗隆の今シーズンのホームラン数を教えて',
    '去年と比べて多いですか？少ないですか？',
    '同じヤクルトの選手で他にホームラン打ってる選手いますか？',
  ]),
  multi('MT03', [
    '2025年6月10日の巨人対阪神の試合結果を教えて',
    'その試合の先発ピッチャーは誰でしたか？',
    'じゃあその投手の今シーズン成績も教えて',
  ], ['partial', 'fail', 'fail']),
  multi('MT04', [
    'オリックスの山岡、最近好調ですか？',
    '次の登板はいつですか？',
  ]),
  multi('MT05', [
    '巨人の岡本の打率は？',
    'じゃあ阪神の大山は？',
    '二人だとどっちが打率高いですか？',
  ]),
]

const acceptancePatterns = {
  B01: /(?:昨日.*(?:確認できません|収録.*範囲外)|試合結果[\s\S]*巨人[\s\S]*阪神)/u,
  B02: /パ・リーグ|試合/u,
  B03: /未来.*(?:確認できません|日程)/u,
  B04: /大谷翔平.*(?:2017年|対象|確認できません)/u,
  B05: /山本.*防御率/u,
  B06: /1位:.*本塁打/u,
  B07: /1位:[\s\S]*2位:[\s\S]*3位:[\s\S]*4位:[\s\S]*5位:/u,
  B08: /チーム打率[\s\S]*巨人[\s\S]*阪神/u,
  B09: /村上宗隆.*(?:判定できません|2025年)/u,
  B10: /断定.*できません/u,
  B11: /佐々木朗希.*加藤貴/u,
  B12: /村上.*2025年.*22本/u,
  B13: /阪神.*\d+勝\d+敗/u,
  B14: /(?:どの|対象).*(?:チーム|選手|試合)/u,
  B15: /監督.*収録対象外/u,
  B16: /ソフトバンク.*4勝1敗/u,
  B17: /藤浪.*DeNA/u,
  B18: /ロッテ.*オリックス.*勝率/u,
  B19: /田中将大.*(?:\d+勝です|算出できません).*対象外/u,
  B20: /(?:予測|正確).*できません/u,
  B21: /(?:どの|対象).*(?:選手|質問)/u,
  B22: /何年/u,
  B23: /\d+勝\d+敗.*日程.*確認でき/u,
  B24: /高校野球.*対応していません/u,
  B25: /1位.*6位/u,
  B26: /森下[\s\S]*打率/u,
  B27: /阪神.*\d+勝\d+敗/u,
  B28: /巨人.*25勝/u,
  B29: /何年/u,
  B30: /(?:予測|正確).*できません/u,
  B31: /どの田中/u,
  B32: /山川.*9本/u,
  B33: /二軍.*対応/u,
  'MT01-Turn1': /阪神.*27勝17敗/u,
  'MT01-Turn2': /阪神.*位/u,
  'MT01-Turn3': /前年.*勝.*敗/u,
  'MT02-Turn1': /村上.*2025年.*22本/u,
  'MT02-Turn2': /2025年.*22本.*2024年/u,
  'MT02-Turn3': /村上以外/u,
  'MT03-Turn1': /巨人対阪神.*(?:ありません|存在しない)/u,
  'MT03-Turn2': /巨人対阪神戦.*存在しない/u,
  'MT03-Turn3': /対象.*(?:確定していません|指定)/u,
  'MT04-Turn1': /山岡.*防御率/u,
  'MT04-Turn2': /未来.*確認できません/u,
  'MT05-Turn1': /岡本.*\.326/u,
  'MT05-Turn2': /大山.*\.253/u,
  'MT05-Turn3': /岡本.*\.326.*大山.*\.253.*岡本のほうが高い/u,
}

await waitForReady()

const selected = conversations.filter((conversation) =>
  selection === 'all' ||
  (selection === 'initial-fail' && conversation.turns.some((turn) => turn.initialVerdict === 'fail')) ||
  conversation.turns.some((turn) => selection.split(',').includes(turn.id)),
)
const selectedTurnIds = selected.flatMap((conversation) => conversation.turns)
  .filter((turn) => selection !== 'initial-fail' || turn.initialVerdict === 'fail')
  .map((turn) => turn.id)
const results = []
let stopReason = null
let outputPath = null
acceptanceRun: for (const conversation of selected) {
  const history = []
  for (const turn of conversation.turns) {
    if (selection === 'initial-fail' && turn.initialVerdict !== 'fail') {
      history.push({ role: 'user', content: turn.message })
      history.push({ role: 'assistant', content: '[initial non-fail turn omitted from rerun]' })
      continue
    }
    const startedAt = Date.now()
    let response
    let body = null
    let requestError = null
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-npb-user-id': `acceptance-${conversation.id.toLowerCase()}-${turn.id.toLowerCase()}`,
          'user-agent': `npb-acceptance/${turn.id}`,
        },
        body: JSON.stringify({ message: turn.message, ...(history.length ? { history } : {}) }),
        signal: AbortSignal.timeout(30_000),
      })
      body = await response.json().catch(() => null)
    } catch (error) {
      requestError = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    }
    const result = {
      id: turn.id,
      initialVerdict: turn.initialVerdict,
      status: response?.status ?? 0,
      durationMs: Date.now() - startedAt,
      intent: body?.structured_query?.intent ?? null,
      filters: body?.structured_query?.filters ?? null,
      summary: body?.answer?.summary ?? null,
      executionMetadata: body?.answer?.execution_metadata ?? null,
      error: requestError,
    }
    const pattern = acceptancePatterns[turn.id]
    result.verdict = result.status === 200 && typeof result.summary === 'string' &&
      !/^イベントです。?\s*該当数:/u.test(result.summary) &&
      (!pattern || pattern.test(result.summary))
      ? 'pass'
      : 'fail'
    result.failureReason = result.verdict === 'fail'
      ? getFailureReason(result, pattern)
      : null
    results.push(result)
    process.stdout.write(`${turn.id}\t${result.verdict.toUpperCase()}\tHTTP ${result.status}\t${result.durationMs}ms\t${result.intent ?? '-'}\t${oneLine(result.summary)}\n`)
    history.push({ role: 'user', content: turn.message })
    history.push({ role: 'assistant', content: result.summary ?? '回答を取得できませんでした。' })
    if (result.verdict === 'fail') {
      stopReason = `fail_fast:${result.id}`
      outputPath = await saveRunLog()
      break acceptanceRun
    }
  }
}

outputPath ??= await saveRunLog()
const failed = results.filter((result) => result.verdict === 'fail')
process.stdout.write(`Acceptance: ${results.length - failed.length}/${selectedTurnIds.length} pass, ${failed.length} fail, ${selectedTurnIds.length - results.length} unexecuted${failed.length ? ` (${failed.map((result) => result.id).join(', ')})` : ''}\n`)
if (failed.length > 0) process.exitCode = 1

async function saveRunLog() {
  const executedIds = new Set(results.map((result) => result.id))
  const remainingCaseIds = selectedTurnIds.filter((id) => !executedIds.has(id))
  const failed = results.filter((result) => result.verdict === 'fail')
  const log = {
    baseUrl,
    selection,
    status: failed.length > 0 ? 'stopped' : 'completed',
    stopReason,
    lastExecutedCase: results.at(-1)?.id ?? null,
    passCount: results.length - failed.length,
    failCount: failed.length,
    unexecutedCount: remainingCaseIds.length,
    resume: {
      nextCaseId: remainingCaseIds[0] ?? null,
      remainingCaseIds,
    },
    results,
  }
  await mkdir(outputDir, { recursive: true })
  const selectionLabel = selection.length <= 80
    ? selection.replace(/[^a-zA-Z0-9_-]+/gu, '_')
    : 'selected-cases'
  const outputPath = path.join(outputDir, `qa-acceptance-${selectionLabel}-${Date.now()}.json`)
  await writeFile(outputPath, `${JSON.stringify(log, null, 2)}\n`, 'utf8')
  process.stdout.write(`${outputPath}\n`)
  return outputPath
}

function getFailureReason(result, pattern) {
  if (result.error) return result.error
  if (result.status !== 200) return `HTTP ${result.status}`
  if (typeof result.summary !== 'string') return 'summary null'
  if (/^イベントです。?\s*該当数:/u.test(result.summary)) return 'generic event summary'
  if (pattern && !pattern.test(result.summary)) return 'acceptance pattern mismatch'
  return 'acceptance assertion failed'
}

function single(id, message, initialVerdict = 'fail') {
  return multi(id, [message], [initialVerdict])
}

function multi(id, messages, verdicts = messages.map(() => 'fail')) {
  return {
    id,
    turns: messages.map((message, index) => ({
      id: messages.length === 1 ? id : `${id}-Turn${index + 1}`,
      message,
      initialVerdict: verdicts[index] ?? 'fail',
    })),
  }
}

async function waitForReady() {
  const deadline = Date.now() + 10 * 60_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(10_000) })
      if (response.ok && (await response.json())?.ok === true) return
    } catch {
      // The local server may still be starting; retry until the readiness deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  throw new Error(`Local API did not become ready within 10 minutes: ${baseUrl}/api/health`)
}

function oneLine(value) {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').slice(0, 180) : '(summary null)'
}
