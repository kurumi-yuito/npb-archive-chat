# 2026-09-30 QA年別集計のLIKE例外

## 本番で確認した事実

HEAD `7febe202aa25b4946f5c804dac3542bfa74dbab0`、Deploy Version `fc55dd76-f744-49c6-aa2a-da0ecae2d75a` でAcceptance47/47 Pass後、QAのQ-08がHTTP500 / summary nullとなった。Workerログの例外全文は `D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR`。日次上限エラーではない。

- 本番応答: `data/logs/qa-prod-run/qa-prod-1790766230990/Q-08.json`
- Worker tail全文: `data/logs/qa-detail-20260927/production-tail.jsonl`
- 失敗SQL全文・例外スタック・Version・発生時刻: `data/logs/qa-detail-20260927/qa08-error-evidence.json`
- 発生時刻: 2026-09-30T11:05:12Z付近
- Repository: `aggregateBattingLines` の正規化facts経路
- 失敗SQL fingerprint: `7991b43346a3845facad4f0c9b7fd1bf902397ba379f21c412cf4b1ff4e438f2`

失敗した前処理は選手名辞書全体の文字列を `candidate_identity.name LIKE candidate_dictionary.name || '%'` のパターンにしていた。質問の対象ではない辞書値もパターン評価される。

## 再現と修正

読み取り専用ローカルsnapshotに、本番失敗SQLと同じ束縛条件を適用。ローカルSQLiteのLIKEパターン上限を50バイトに設定すると同じ例外となり、候補前処理の前方一致を `instr(..., ...) = 1` にすると成功した。これはローカルの再現条件であり、本番の設定上限が50バイトであるとの断定ではない。

上限を通常値に戻した旧SQLの8件と、新SQLの8件は全列・取得順が一致する。証拠: `data/logs/qa-detail-20260927/qa08-local-reproduction.json`。

加えて、長い無関係な辞書値に対して旧SQLがSQLite標準のパターン上限で失敗し、新SQLが同じ候補を取得する回帰テストを追加した。選手ID・年度・球団・曖昧性の本判定は維持する。DBデータ・INDEX・期待値・静的選手マッピングは変更していない。

## 同時に確認したQA差分

Q-06では「巨人」と「読売ジャイアンツ」を異なる所属と判定し、不要な注意文を出していた。既存の `canonicalTeamName` を比較に使うよう修正し、別球団の移籍補正が残ることも回帰確認する。新しいマッピングは追加しない。また最近の投手評価で欠けていた公式シーズン成績行を取得・表示し、直近登板と期間の空白に関する説明を維持する。

修正後に対象本番確認、Acceptance47件、QA182件を最初から実行し、独立ブラックボックス47件・Release Ready判定へ戻る。現時点では完全リリース未達。
