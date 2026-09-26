# B31候補集合・取得順の復旧（2026-09-26）

rows_read増加調査は「未再現」で終了し、再調査していない。この変更は旧版候補集合の復旧だけを対象とする。

## 原因と修正

旧版 `48ff8f985` は候補IDの252bindが失敗した後、BIS成績→互換factビューの順に候補を集めていた。JSON1bind化後は正規化fact検索が成功してBIS収集全体を飛ばし、さらに名前INDEX順でLIMITが適用された。共通原因は「最適化がfactの取得だけでなく候補ソースと取得順を変えたこと」。

修正: 正規化factの成功/失敗にかかわらずBISソースを取得し、候補の結合順をBIS→factに維持する。factの既存名前INDEX検索は維持し、`ORDER BY <fact table>.rowid` をLIMITより前へ追加して旧版のfact走査順へ戻す。JSONパラメータ化・通算打撃事前絞り込みは維持。期待値変更・DB変更・選手の静的マッピング追加はない。

## 純減4件の内訳

候補の名前・IDを主に比較すると7候補が欠落し、同姓の匿名候補3件が追加されていた（純減4件）。さらに2選手のprimary_teamが変わっていた。単に「4人が消えた」ではない。

| 候補/変化 | 除外・変化理由 | 取得条件・経路 |
| --- | --- | --- |
| `* 田中 晴也`（ロッテ）欠落 | BIS行収集を飛ばした | `queryRawPlayerMentions` → `player_batting_stats`。記号・空白を除去した名前照合、年度指定なし。 |
| `* 田中 瑛斗`（巨人）欠落 | 同上 | 同上 |
| `* 田中 陽翔`（ヤクルト）欠落 | 同上 | 同上 |
| `* 田中 貴也`（楽天）欠落 | 同上 | 同上 |
| `+ 田中 和基`（楽天）欠落 | 同上 | 同上 |
| `田中和`（楽天）欠落 | 名前INDEX順の2500行打ち切りで候補に含まれるfactが変わった | `batting_lines`互換ビュー → `batting_line_facts`名前INDEX。元のrowid順を復旧。 |
| `田中豊`（ID `81085132`）欠落 | 同上 | 同上 |
| 匿名`田中`（日本ハム・巨人・オイシックス）の3候補追加 | LIMIT内のfactが変わった | 同じSQL・元の取得順へ復旧。 |
| 田中浩康（ID `21925110`）の所属がDeNA→ヤクルト | 候補を構成する年度・所属行が変わった | 元のfact集合・順序を復旧。 |
| 田中千晴（ID `91095157`）の所属が楽天→巨人 | 同上 | 同上 |

## 取得順と比較結果

- 比較の起点となった `name=田中, includeEvents=false, searchDomain=batting, limit=50` は、旧版43件と修正後43件のJSON配列が全項目・順序を含めて完全一致。
- 修正前最新版は同条件39件。
- 本番B31のresolverは `searchDomain=all` を使うため、同条件でも別に比較した。この経路は旧版41件・修正後41件で全項目・順序が一致。43件は打撃経路のRepository比較値であり、APIの候補件数ではない。前回の報告ではこの区別が不十分だった。
- 保存済み本番応答の `identity_resolution.candidateCount=25` は、Repository取得後の候補選別を経た値。43/41件と混同しない。
- 回帰テストでは、名前INDEX順とfact挿入順が異なりLIMITに達する501行を用意し、BISだけに存在する候補も追加。正規化経路と旧互換ビュー経路の返却配列が一致することを検証。

## SQL

全SQL・引数・EXPLAIN・候補43件は `data/logs/b31-candidates-20260926/comparison-fixed.json`、全領域経路は `comparison-all-domains.json` に保存。以下に関係するSQLを抜粋する。

### 旧版fact経路

```sql
SELECT batting_lines.player_name AS name, NULLIF(batting_lines.player_url, '') AS player_url, ? AS role, batting_lines.team AS team, games.year AS year FROM batting_lines INNER JOIN games ON games.game_id = batting_lines.game_id WHERE batting_lines.player_name IS NOT NULL AND batting_lines.player_name <> '' AND ((LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(batting_lines.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(batting_lines.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (SUBSTR(?, 1, LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(batting_lines.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')))) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(batting_lines.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(batting_lines.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 2))) LIMIT ?
```

### 旧版から維持するBIS経路

```sql
SELECT player_batting_stats.player_name AS name, player_batting_stats.player_id AS player_url, ? AS role, player_batting_stats.team_name AS team, player_batting_stats.year AS year FROM player_batting_stats WHERE player_batting_stats.player_name IS NOT NULL AND player_batting_stats.player_name <> '' AND ((LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) = ? OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) LIKE ? OR (SUBSTR(?, 1, LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')))) = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜')) AND LENGTH(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(player_batting_stats.player_name, ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))) >= 2))) LIMIT ?
```

### 修正後fact経路

```sql
SELECT person_names.name AS name,
              CASE WHEN batting_line_facts.player_id IS NOT NULL THEN 'https://npb.jp/bis/players/' || batting_line_facts.player_id || '.html' ELSE NULL END AS player_url,
              ? AS role, teams.team_name AS team, game_facts.year AS year
            FROM person_names
            INNER JOIN batting_line_facts INDEXED BY idx_batting_name_game ON batting_line_facts.player_name_id = person_names.name_id
            INNER JOIN game_facts ON game_facts.game_id = batting_line_facts.game_id
            INNER JOIN teams ON teams.team_id = batting_line_facts.team_id
           WHERE person_names.name_id IN (SELECT value FROM json_each(?)) ORDER BY batting_line_facts.rowid LIMIT ?
```

## 検証状況

ローカル正規化変換・候補検索回帰テスト、typecheck、lintはPass（lint既存135 warnings / 0 errors）。本番Version `2846efc9-1c56-464c-8caf-88c2aea87874` でB31単独Pass。旧版本番のsummaryとidentity_resolution metadata（ID・名前・順序・candidateCountを含む）が完全一致し、失敗SQL・未知の測定値は0。続くAcceptance47/47 Pass。

その後QAでB31とは別種の必要情報欠落を確認し、今回指定された停止条件に基づき停止。QA182件・独立ブラックボックス47件・Release Ready・完全リリースは未完了。[障害記録](incidents/2026-09-26-qa-detailed-pitching-answer.md)に実応答と再現結果を保存。
