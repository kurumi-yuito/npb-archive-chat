# 公式原本に基づく独立した数値照合

これらの値はチャットの返答やrepository集計から作らず、保存済みNPB公式英文ページを別のPython HTML解析で集計したもの。対象年度・月、各記録のURL・取得日時・原本ハッシュを保持する。人間による全工程評価の代わりとはせず、`humanReviewed:false`を保持する。

質問の意味は、QA正本と2026-11-06のユーザー指示「年度を省略した月の質問は今シーズン」を根拠とする。年度が変わって対応する公式原本の正解が存在しない場合、受入runnerは数値評価不能をFailとして記録し、HTTP成功だけでPassにしない。

再生成には `scripts/audit-captured-month-home-runs.py` を使う。入力ディレクトリには、実際に公式リンクから発見した `discovery.json`、保存原本を指す `source-manifest.json`、ハッシュ検証可能な原本が必要。

```sh
python3 scripts/audit-captured-month-home-runs.py --capture-dir <capture> --year 2026 --month 5 --output docs/eval-source-oracles/2026-05-home-runs.json
python3 scripts/audit-captured-month-home-runs.py --capture-dir <capture> --year 2026 --month 8 --subject-team b --opponent-team m --output docs/eval-source-oracles/2026-08-orix-lotte.json
```

本塁打の名前は公式英字表記＋球団のまま集計し、未確認の同名統合は行わない。試合ヘッダーの表示順をホーム・ビジター順と仮定せず、両球団名を対応付けて勝敗を判定する。独立数値の照合と、実行結果の選手ID・期間・競技範囲・完全性の検証は別工程である。
