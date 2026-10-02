# 復旧後のB31本番確認 — 外部要因で停止

開始時HEADは `2990b64566086751202859b4f02ea58eea828dac`。ワークツリーはmainの1件、未コミット変更・stashはなし。origin/mainは `7febe202aa25b4946f5c804dac3542bfa74dbab0` で、未Pushの3コミットをPushして一致させた。reflogとVSCodeローカル履歴を確認したが、今回復元対象となる変更は見つからなかった。B31候補集合復旧は `7a7ce9786` のコードと回帰テストとして保存されており、再実装していない。

開始時最新Deployは `7363b200-0c15-44be-89a5-b6dd7d783acb`。候補集合・正規化変換・Planner局所回帰36件、typecheck、CloudflareビルドがPass。生成済みビルドをWranglerでデプロイし、HEAD注記付きVersion `4ce7fb4a-4a05-44bb-a8af-9c5261932417` が本番へ配信された。デプロイ用一時設定は元の設定のパスを絶対化し、実行済みbuild commandだけをtrueへ置換した。

同VersionへのB31は2回ともHTTP500 / summary null。応答ログ:

- `data/logs/qa-acceptance-B31-1790950194158.json`
- `data/logs/qa-acceptance-B31-1790953983003.json`
- Worker例外証拠: `data/logs/recovery-20261002-b31-exception.json`

2回目のWorkerログで、配信Versionと次のCloudflare例外を確認した:

> D1_ERROR: Your account has exceeded D1's free tier daily row read limit.

これは現在の外部拒否の確認であり、rows_read増加原因・使用量・SQLコストの再調査はしていない。DB操作・同期・課金変更・期待値変更は行っていない。Cloudflareが本番検索を拒否する状態をアプリ修正で解除することはできない。例外が示す解除条件はUTC日次境界または利用枠の確保。確認時刻は2026-10-02 15:13 UTC（2026-10-03 00:13 JST）、次のUTC日次境界は2026-10-03 00:00 UTC（09:00 JST）。境界到達だけで全スイート完走は保証しない。

停止地点はB31本番確認。Acceptance47件、182件QA、独立ブラックボックス47件、Release Ready、完全リリースは未実施・未達。復旧後は配信Versionを確認しB31から指定順で再開する。過去VersionのPassを流用しない。
