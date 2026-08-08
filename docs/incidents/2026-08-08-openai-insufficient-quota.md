# 2026-08-08 OpenAI `insufficient_quota` 応答と復帰記録

## 概要

本番チャットのPlanner用OpenAI API呼び出しで、OpenAIからHTTP 429
`insufficient_quota` / `credit_balance_exhausted`が返り、アプリがHTTP 503
`chat_llm_unavailable`へ変換した。その後、Cloudflare Worker secretの更新を行わないまま、
本番チャットがHTTP 200へ復帰した。

この記録は「キー設定ミス」または「OpenAI側の一時的・課金状態依存のquota応答」の
どちらだったかを後から検証できるよう、確認済み事実と未確認事項を分けて残す。

## 影響

- Plannerが完了せず、本番チャットがHTTP 503を返した。
- productionではheuristic fallbackを無効にしているため、OpenAI障害時に回答を継続しない。
- 無料利用トークンは後続エラー時に返却される。

## 時系列

時刻はJST（括弧内はUTC）。

| 時刻 | 事象 | 証拠 |
|---|---|---|
| 2026-08-02 17:07頃（08:07 UTC） | Version `ddbe97c8-a587-4ea4-aec1-2e4034274da7`の全158件QAがHTTP 200で完走 | `docs/qa-test-cases-current-vs-prod.md` |
| 2026-08-03 00:47頃（08-02 15:47 UTC） | 後続QAでOpenAI 429 `insufficient_quota`を確認 | `data/logs/qa-prod-1785685655212.json` |
| 2026-08-07 23:22（14:22 UTC） | Version `70f412ba-9e6d-4c2f-b00e-72e432174b7c`で同じOpenAI 429が4回連続。Workerは503 | `data/logs/qa-prod-run/qa-prod-1786112333764/Q-73.json` |
| 2026-08-07 23:39（14:39 UTC） | Version `ad8faea3-c798-4a7e-aa47-13451e1a4d09`でも同じOpenAI 429が4回連続 | `data/logs/qa-prod-1786113369419.json` |
| 2026-08-08 12:20（03:20 UTC） | Version `56d5477e-17e8-474f-be9c-f39bb0ecd263`でOpenAI 429、公開APIは503 | 調査時に保存した本番レスポンス。本文は下記参照 |
| 2026-08-08 12:47（03:47 UTC） | Version `5968cd0a-bffa-4a39-987d-8e8519611676`をデプロイ | Cloudflare deployment/audit log |
| 2026-08-08 12:56（03:56 UTC） | ローカルQueryキーからOpenAI `gpt-4.1-mini`へ直接呼び出し、HTTP 200 | OpenAI `x-request-id: req_736e0a02bbbc451a9d79f447abc06d27` |
| 2026-08-08 12:57（03:57 UTC） | 本番Workerの通常チャットがHTTP 200。Plannerと最終回答の両方が成功 | 本番spot check「藤浪の直近の内容」 |

## 失敗レスポンス

OpenAI上流のレスポンスとしてアプリが取得した内容:

```json
{
  "error": {
    "message": "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
    "type": "insufficient_quota",
    "param": null,
    "code": "credit_balance_exhausted"
  }
}
```

- OpenAI上流: HTTP 429
- 本番Worker公開API: HTTP 503
- アプリの公開エラーコード: `chat_llm_unavailable`

`credit_balance_exhausted`はアプリが生成した文字列ではない。OpenAIのエラー本文を
`chat-query-llm.ts`が保持し、`chat-query-parser.ts`がPlanner利用不能エラーへ包み、
`chat.post.ts`が公開HTTP 503へ変換している。

## APIキーの供給経路

- 本番: Cloudflare Worker secretsの`CHAT_QUERY_LLM_API_KEY`と
  `CHAT_ANSWER_LLM_API_KEY`。GitHub Actions secretsにはOpenAIキー登録なし。
- ローカル: `CHAT_QUERY_LLM_API_KEY`のみ設定。接頭辞は`sk-proj-…`。
- Cloudflare secretは値を取得できないため、本番とローカルが同一キーかは未確認。
- ローカルキーのOpenAI Projectは`proj_bnNrOQh61YWXqnjUudDseh0R`、
  Organizationは`user-2ivjpvnwlg2ofrx16w3fw1ps`。
- 本番キーのProject/Organizationは、現行アプリがOpenAIレスポンスヘッダーを
  保存していないため未確認。

## Cloudflare変更監査

Cloudflare audit logを`2026-08-08T02:30:00Z`〜`04:10:00Z`で確認した。

- 03:12 UTC: Phase 16 Worker deploy
- 03:18 UTC: tail開始
- 03:47 UTC: Phase 16.1 Worker deploy
- secret create/update/deleteに相当する監査イベント: なし

03:47のデプロイは`/api/chat/usage`のキャッシュ制御とUI再同期の変更であり、
`chat.post.ts`、`chat-query-llm.ts`、`chat-query-parser.ts`、
`chat-final-answer-llm.ts`、LLM Runtime Configには差分がない。

Workerデプロイは間に存在するため「デプロイなしの自然復旧」とは言えない。一方で、
デプロイ内容はLLM経路と無関係で、Cloudflare上にキー差し替えの監査記録もない。
したがって、キー設定修正によって復旧したことを示す証拠はない。

## 判断

確認できる事実:

- 複数Version・複数日にわたりOpenAI上流429が記録された。
- その後、Cloudflare secret更新なしで本番チャットがHTTP 200へ戻った。
- 復帰直前のデプロイはLLM呼び出し経路を変更していない。
- 現在、ローカルOpenAI直接呼び出しと本番Workerの両方がHTTP 200である。

確認できないこと:

- Cloudflare secret値がローカルキーと同一か。
- 本番キーのOpenAI Project/Organization。
- 当該期間中にOpenAI側で残高追加、支払状態変更、quota再計算、内部復旧があったか。
- 復帰が時間経過だけによる「自動復旧」だったか。

結論として、今回を単純なキー設定ミスとする根拠はない。観測事実は
「同じCloudflare secret名・secret更新記録なしの状態で、OpenAIのquota系429が継続した後、
LLM経路を変更せずHTTP 200へ復帰した」である。OpenAI側の一時的または課金状態依存の事象だった
可能性はあるが、OpenAIのbilling/audit logなしに原因を確定しない。

## 再発時の確認

1. OpenAI上流status、`error.type`、`error.code`、message、`x-request-id`を保存する。
2. Worker公開statusとアプリerror codeを分けて記録する。
3. Cloudflare audit logでsecret更新とdeployを確認する。
4. OpenAI Platformで対象Project、Organization、billing activity、usage limitを確認する。
5. ローカルキーとの同一性を推測せず、管理元のキーfingerprintで照合する。
6. 復帰時も同じ質問を再実行し、HTTP 200時刻とDeploy Versionを保存する。
