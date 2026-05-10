# Documentation Guide

このディレクトリの入口です。目的別に読むドキュメントを固定し、重複した情報を探し回らなくてよいようにする。

## 最初に読む

| 目的 | ドキュメント |
|------|--------------|
| ローカルで起動して触る | [getting-started.md](./getting-started.md) |
| 現在の実装状態を確認する | [current-status.md](./current-status.md) |
| Cloudflare へデプロイする | [deploy.md](./deploy.md) |
| 日次更新ジョブを本番で有効化・確認する | [daily-update-runbook.md](./daily-update-runbook.md) |
| 本番運用に残っている作業を確認する | [production-todo.md](./production-todo.md) |

## 機能別

| 領域 | ドキュメント | 主な内容 |
|------|--------------|----------|
| チャット画面 | [ui-chat.md](./ui-chat.md) | 画面表示項目、どのソースを編集するか |
| チャットAPI | [chat-backend.md](./chat-backend.md) | `/api/chat` の処理順、formatter、LLM fallback |
| アカウント・課金・usage | [usage-limit.md](./usage-limit.md) | account table、subscription、usage制限、API |
| LLM | [llm-query-parser.md](./llm-query-parser.md) | structured query生成、final answer drafting |
| query正規化 | [query-normalization.md](./query-normalization.md) | team/player正規化、player resolution |
| eval | [eval-process.md](./eval-process.md) | query eval と DB-backed chat eval |

## データ更新・DB

| 領域 | ドキュメント | 主な内容 |
|------|--------------|----------|
| 正規データフロー | [current-status.md](./current-status.md) | `discover → update:year → backfill:scores-canonical → enrich:scores-calendar` |
| 日次更新の仕様 | [update-job.md](./update-job.md) | `update:daily`、Cloudflare Cron / workflow_dispatch |
| 日次更新の本番運用手順 | [daily-update-runbook.md](./daily-update-runbook.md) | secrets、R2 backup、手動実行、Cron確認、復旧 |
| R2 正規保存先化 | [r2-canonical-storage-runbook.md](./r2-canonical-storage-runbook.md) | raw HTML / structured JSON を R2 正規保存先にする実装手順 |
| DB schema / repository | [db.md](./db.md) | テーブル、検索DB、migration |
| source構造 | [source-structure.md](./source-structure.md) | scores / BIS source の役割 |
| parser | [parser.md](./parser.md) | raw HTML → structured JSON |
| scores enrichment | [scores-calendar-enrichment.md](./scores-calendar-enrichment.md) | scores 4HTML の補完 |
| discovery | [discovery.md](./discovery.md) | 年別試合列挙 |

## 補助・履歴

| ドキュメント | 位置づけ |
|--------------|----------|
| [bootstrap.md](./bootstrap.md) | 初期セットアップ履歴と開発コマンド |
| [workspace.md](./workspace.md) | pnpm workspace 構成 |
| [service-layer.md](./service-layer.md) | route / service / repository の分離 |
| [downloader.md](./downloader.md) | 個別 raw HTML 取得CLI。正規年次更新ではない |
| [download-runbook.md](./download-runbook.md) | downloader の調査用 runbook |

## 残作業の扱い

プロダクト機能としてのチャット、account/profile、subscription、usage は実装済みである。

残っているのは主に本番インフラ運用作業である。D1 の本番データ同期手段 `sync:d1` は実装済みで、実行手順は [deploy.md](./deploy.md) にある。残作業と完了条件の一覧は [production-todo.md](./production-todo.md) に置く。各詳細ドキュメント内の `Not implemented` は個別領域の補足である。
