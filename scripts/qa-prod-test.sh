#!/usr/bin/env bash
# Production API QA tests
# Usage: bash scripts/qa-prod-test.sh

BASE_URL="https://npb-chat.dom9th-works.com"
UID="qa-prod-$(date +%s)"
IDX=0

ask() {
  local label="$1"
  local question="$2"
  IDX=$((IDX + 1))
  local uid="${UID}-${IDX}"
  echo ""
  echo "=== ${label} ==="
  local raw
  raw=$(curl -s "${BASE_URL}/api/chat" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "x-npb-user-id: ${uid}" \
    -d "{\"message\":\"${question}\"}" 2>&1)
  echo "$raw" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ans = d.get('answer', {})
    s = ans.get('summary', '')
    f = ans.get('applied_filters', {})
    rc = ans.get('result_count', '?')
    rp = ans.get('resolved_player')
    sq = d.get('structured_query', {})
    print(f'result_count={rc}')
    print(f'intent={sq.get(\"intent\")}')
    if rp:
        print(f'player: {rp.get(\"status\")} / {rp.get(\"name\")} / {rp.get(\"player_id\")}')
    print(f'filters: {sq.get(\"filters\", {})}')
    print(f'summary: {s[:300]}')
except Exception as e:
    print(f'ERROR: {e}')
    print(repr(d)[:300])
" 2>&1
  sleep 2
}

echo "=== Production QA Test: $(date) ==="
echo "BASE_URL: $BASE_URL"

# 1. 選手個人成績（BISデータ → 本番でも動作確認済み）
ask "1-6: 村上宗隆" "村上宗隆は今シーズン打率どのくらい？本塁打は何本出てる？"
ask "13-1: 大谷翔平" "2025年の大谷翔平の成績を教えてください"
ask "7-1: 山本由伸2026" "オリックスの山本由伸の2026年の一軍での投球成績、登板数と防御率を教えてください"
ask "6-1: 牧" "牧の2026年の成績を教えて"

# 2. リーグランキング（batting_lines/pitching_lines → 本番のみ動作）
ask "12-1: パ・リーグ打率" "今シーズンのパ・リーグ打率ランキングトップ5を教えてください"
ask "12-2: セ・リーグ防御率" "2026年セ・リーグの先発防御率ランキングを教えてください"
ask "12-3: パ・リーグ本塁打" "今シーズンのパ・リーグ本塁打ランキングを教えてください"
ask "4-5: セ・リーグOPS" "今シーズンのセ・リーグで打率・出塁率・長打率のバランスが最も優れていると思われる打者を1人挙げて、その根拠を数字で示してください。"

# 3. 複数年（events データ → 本番のみ）
ask "4-1: 本塁打2022-2024" "2022年から2024年の3年間で、NPB全体で最も本塁打を多く打った打者トップ3を教えてください。"
ask "17-2: パ・リーグHR2022-2024" "2022年から2024年のパ・リーグで本塁打が最も多い打者トップ3"

# 4. スタメン照会
ask "16-1: 広島スタメン" "2026年5月10日の広島のスタメンを教えてください"
ask "16-2: DeNA5番ショート" "DeNAで5番ショートは最近いつ？"

# 5. 選手複数年
ask "17-1: 牧秀悟2023-2025" "牧秀悟の2023年から2025年の通算打率と本塁打数を教えてください"

# 6. MLB年シフト確認
ask "7-2: 山本由伸2025" "2025年の山本由伸（オリックス）の最終的なシーズン成績はどうでしたか？勝敗と防御率が知りたい"

# 7. 防御率計算（LLMが明示計算するか）
ask "18-1: 広島先発防御率" "今シーズンの広島の先発投手で防御率が最もいい投手を教えてください。防御率は自責点÷投球回×9で計算してください"

echo ""
echo "=== Done ==="
