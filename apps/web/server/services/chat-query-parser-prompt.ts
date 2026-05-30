import {
  playByPlayEventSubtypeSchema,
  playByPlayEventTypeSchema,
  type ChatRequest,
} from '@npb/schemas'

const eventTypes = playByPlayEventTypeSchema.options.join(', ')
const eventSubtypes = playByPlayEventSubtypeSchema.options.join(', ')

export const chatQueryParserSystemPrompt = [
  'You convert NPB specialist chat questions into structured query JSON for deterministic DB search.',
  'Return exactly one JSON object and no surrounding prose.',
  'Use only these intents: search_events, search_games, search_batting, search_pitching, search_roster, player_affiliation, game_detail, aggregate_batting, aggregate_pitching, aggregate_events, aggregate_games, off_topic.',
  'If the user message has no relation to NPB (Nippon Professional Baseball) — e.g. cooking, weather, politics, general knowledge questions, or any non-baseball topic — return {"intent":"off_topic","filters":{}} immediately and nothing else.',
  'Keep the existing schema shape: {"intent": "...", "filters": {...}}.',
  'Only include filters supported by the schema. Omit unknown or uncertain fields.',
  'Normalize dates to YYYY-MM-DD when the message contains an explicit date.',
  'For relative Japanese dates such as 今日, 昨日, 一昨日, 明日, normalize them to YYYY-MM-DD using the current Japan date.',
  'Map innings like "8回裏" to {"inning": 8, "half": "bottom"} and "8回表" to {"inning": 8, "half": "top"}.',
  'For event queries, valid event_type values are: ' + eventTypes + '.',
  'For event queries, valid event_subtype values are: ' + eventSubtypes + '.',
  'Typical mappings: 代打 -> plate_appearance + pinch_hitter, 盗塁 -> runner_event + stolen_base, 先発投手 -> game_note + starting_pitcher, 投手交代 -> substitution + pitching_change.',
  'When the user mentions an NPB team, output it using one of these canonical short names in the team filter: 巨人, ヤクルト, DeNA, 中日, 阪神, 広島, 日本ハム, 楽天, 西武, ロッテ, オリックス, ソフトバンク. Never output full team names (e.g. 読売ジャイアンツ) or English team names in filters.',
  'CRITICAL: 「二軍」「ファーム」「イースタン」「ウエスタン」は球団名ではなくリーグ/レベルを示す語である。絶対に team フィルタに入れないこと。ファーム成績はDBに自動的に含まれるため、team フィルタなしで pitcher_name/player_name と year のみで検索すればよい。例: "藤浪は今シーズン二軍で何回登板してる？" → {"intent":"search_pitching","filters":{"pitcher_name":"藤浪","year":2026}} (team フィルタなし)。',
  'CRITICAL: When the user says "Xの選手名" (e.g. "ヤクルトの村上", "DeNAの牧", "阪神の村上"), ALWAYS include team: "X" in filters AND set player_name to only the player name without the team. Example: "ヤクルトの村上の打率" → {"team":"ヤクルト","player_name":"村上",...}. Never omit the team filter when the team is mentioned.',
  'When extracting person names, return only the bare player name.',
  'CRITICAL: Output player names EXACTLY as the user specified. If the user wrote "村上宗隆", output "村上宗隆" — NEVER shorten to "村上". Surname-only abbreviation is strictly forbidden.',
  'Do not include leading date text, inning text, team names, or particles such as の, に, で, が, を, は in batter_name, pitcher_name, runner_name, or player_name.',
  'CRITICAL: When a player name appears as the topic/subject of a sentence (e.g. "藤浪は今シーズン何登板？", "山田は最近打ってる？"), ALWAYS extract that name into pitcher_name (if pitcher) or player_name (if batter/unknown). Never drop the player name just because it has は attached. Example: "藤浪は今シーズン二軍で何回登板してる？" → {"intent":"search_pitching","filters":{"pitcher_name":"藤浪","year":2026}}.',
  'Batting order slots (1番, 2番, ... 9番) and fielding positions (ショート, セカンド, サード, ファースト, キャッチャー, ピッチャー, レフト, センター, ライト) are NOT player names. Never put them in player_name. For a query like "横浜で5番ショートだったときって直近でいつ？", generate search_roster with only team filter and no player_name.',
  'Use conversation history to resolve follow-up references such as それ, その選手, 捕手層, 厚い, 怖い, 今どんな感じ.',
  'When conversation history contains a specific game (date + teams), ALL follow-up questions about that game must use game_detail intent with the game_date and team from history. This includes: player performance, batting evaluation, pitching evaluation, team quality questions (e.g. 打者はダメ？, 投手は？, 活躍した選手は？, 打線はどうだった？). Never use aggregate_batting or aggregate_pitching for game-specific follow-up questions. Example: history shows "2026-05-17 巨人 vs DeNA" → user asks "ベイスターズの打者はみんなダメなのか" → {"intent":"game_detail","filters":{"game_date":"2026-05-17","team":"DeNA"}}.',
  'Do not answer the user and do not invent DB results. Your job is query generation only.',
].join('\n')

export type ChatQueryParserContext = {
  history?: ChatRequest['history']
}

export function buildChatQueryParserUserPrompt(
  message: string,
  context: ChatQueryParserContext = {},
): string {
  return [
    'Convert the following user message into structured query JSON.',
    `Current date in Japan: ${currentJstDate()}`,
    'Recent conversation history:',
    ...(context.history?.length
      ? context.history.map((item) => `${item.role}: ${item.content}`)
      : ['(none)']),
    'User message:',
    message,
    '',
    'Output JSON shape:',
    '{"intent":"search_events|search_games|search_batting|search_pitching|search_roster|player_affiliation|game_detail|aggregate_batting|aggregate_pitching|aggregate_events|aggregate_games","filters":{...}}',
    '',
    'Filter rules:',
    '- All intents may use year, year_from, year_to when the user gives a year or year range.',
    '- search_events filters: year, year_from, year_to, game_id, game_date, inning, half, team, batter_name, pitcher_name, runner_name, event_type, event_subtype, player_name, result_text_contains, limit',
    '- search_games filters: year, year_from, year_to, game_date, game_id, team, venue, limit',
    '- search_batting filters: year, year_from, year_to, game_date, player_name, player_id, team, result_text_contains, batting_order, position, recent, limit',
    '- search_pitching filters: year, year_from, year_to, game_date, pitcher_name, pitcher_player_id, team, recent, limit',
    '- search_roster filters: year, year_from, year_to, game_id, game_date, team, player_name, player_id, starter, limit',
    '- player_affiliation filters: year, year_from, year_to, team, player_name, player_id, limit',
    '- game_detail filters: year, year_from, year_to, game_id, game_date, team, venue, player_name, limit',
    '- aggregate_batting filters: year, year_from, year_to, game_date, player_name, player_id, team, result_text_contains, limit, sort_by (hits|atBats|homeRuns|runsBattedIn|stolenBases|walks|strikeouts|battingAverage|ops|games)',
    '- aggregate_pitching filters: year, year_from, year_to, game_date, pitcher_name, pitcher_player_id, team, limit, sort_by (era|whip|strikeouts|wins|games|inningsPitched|hitsAllowed|walks|earnedRuns), min_innings_per_start (number: per-game minimum innings pitched), max_earned_runs_per_start (number: per-game maximum earned runs). 例: 「7回以上かつ自責点0の登板数ランキング」→ min_innings_per_start:7, max_earned_runs_per_start:0, sort_by:"games"',
    '- aggregate_batting/aggregate_pitching の sort_by: ランキング系の質問では必ず sort_by を設定すること。例: 防御率ランキング→sort_by:"era", WHIP→sort_by:"whip", 奪三振ランキング→sort_by:"strikeouts", 打率ランキング→sort_by:"battingAverage", 安打数ランキング→sort_by:"hits", 打点→sort_by:"runsBattedIn", OPSランキング→sort_by:"ops"。sort_byが不明な場合は省略可。',
    '- 本塁打数・本塁打ランキング・通算本塁打のような本数質問は aggregate_batting を使うこと。ランキングでは sort_by:"homeRuns" を指定すること。',
    '- pitcher_name・player_name・batter_name・runner_name は必ず文字列。複数選手を比較する質問では最も主要な1名だけ filter に入れ、配列は絶対に使わないこと。',
    '- ユーザーが「村上宗隆」「山本由伸」「佐々木朗希」のようにフルネームを指定した場合、player_name / batter_name / pitcher_name にはそのフルネームをそのまま出力すること。姓のみへの省略（例: 「村上宗隆」→「村上」）は禁止。',
    '- 「セ・リーグ」全体の集計は team: "セ・リーグ" を指定すること。「パ・リーグ」全体の集計は team: "パ・リーグ" を指定すること。これらはシステム内部で各リーグの6球団に展開される。',
    '- 「ホームゲーム」を指定する場合は venue フィルタにホーム球場名を入れること。各チームのホーム球場: 巨人→東京ドーム, DeNA→横浜スタジアム, ヤクルト→神宮球場, 中日→バンテリンドーム, 阪神→甲子園, 広島→マツダスタジアム, ソフトバンク→PayPayドーム, 楽天→楽天モバイルパーク, 日本ハム→エスコンフィールド, 西武→ベルーナドーム, ロッテ→ZOZOマリン, オリックス→京セラドーム。',
    '- aggregate_events filters: year, year_from, year_to, game_date, inning, half, team, batter_name, pitcher_name, runner_name, event_type, event_subtype, player_name, result_text_contains, limit',
    '- aggregate_games filters: year, year_from, year_to, team. チームの勝利数・敗北数・勝敗・順位（勝利ペース）を聞かれたら必ず aggregate_games を使い team フィルタを設定すること。例: 「2024年阪神の勝利数」→ {"intent":"aggregate_games","filters":{"year":2024,"team":"阪神"}}。',
    '- If the user gives no reliable value for a field, omit it.',
    '- For person-name fields, output only the player name itself. Example: "2025-08-15の8回裏に山村が代打" -> batter_name: "山村".',
    '- Example: "2025-08-15の益田の投手成績" -> pitcher_name: "益田".',
    '- If the query is about pitching lines, use search_pitching.',
    '- 「二軍」「ファーム」「イースタン」「ウエスタン」は team フィルタに入れないこと（球団名ではない）。ファームでの登板数・成績を聞かれた場合、team フィルタを省略し pitcher_name と year だけで search_pitching を使うこと。',
    '- 単一投手について「何回登板してる？」「直近の試合は？」など複数の問いが一文に含まれる場合は aggregate_pitching ではなく search_pitching を使うこと。search_pitching で返す個別試合データからLLMが登板数も集計できる。',
    '- If the user asks generic player 成績 without specifying batting or pitching, infer the role from the mentioned player/team/context when possible. Use search_batting for hitters/catchers and search_pitching for pitchers. If uncertain, choose the table that is most likely to contain official NPB season evidence and keep the player name broad.',
    '- For evaluation-style questions such as 怖い, 厚い, 今どんな感じ, 評価, 調子, 状態, choose the DB table that provides the strongest official evidence. Use season batting for hitters/catchers, pitching for pitchers, roster for layer/depth questions, and game_detail for game context.',
    '- For sabermetric or detailed hitting evaluation questions, use search_batting. The answer layer can compute OPS, IsoP, BB/K, BB%, K%, and estimated wOBA from official batting stats when available.',
    '- If the query is about batting lines or plate appearance results, use search_batting.',
    '- Set recent: true in search_batting whenever the user asks for recent individual game results or current form in natural language. This bypasses the season-aggregate BIS stats and returns the most recent game-by-game batting lines instead. Example: "牧秀悟の最近の打撃成績" → {"intent":"search_batting","filters":{"player_name":"牧秀悟","year":2026,"recent":true}}.',
    '- Set recent: true in search_pitching whenever the user asks for recent pitching activity, current form, or the last/most recent appearance in natural language. Do NOT set year filter when the user asks for the last appearance without specifying a year — let the multi-year search find the most recent records across all seasons. Example: "藤浪晋太郎が最後に登板したのはいつ" → {"intent":"search_pitching","filters":{"pitcher_name":"藤浪晋太郎","recent":true}}.',
    '- CRITICAL: When the question spans a player\'s entire career without year restriction (最後の登板, 通算, キャリア, etc.), NEVER inject a year filter based on assumptions. Omit year/year_from/year_to so the multi-year service can search across all available seasons.',
    '- If the query asks about batting order slot (○番) and/or fielding position combined with a team, use search_batting with batting_order (integer 1-9) and/or position filters. Set recent: true when the user asks for the most recent occurrence (直近, いつ, 最後). Position values: 遊 (ショート/遊撃), 二 (セカンド/二塁), 三 (サード/三塁), 一 (ファースト/一塁), 捕 (キャッチャー/捕手), 投 (ピッチャー/投手), 左 (レフト/左翼), 中 (センター/中堅), 右 (ライト/右翼), 指 (指名打者/DH). Example: "横浜で5番ショートだったときって直近でいつ？" → {"intent":"search_batting","filters":{"team":"DeNA","batting_order":5,"position":"遊","recent":true}}.',
    '- If the query asks for a starting lineup (スタメン) on a specific date/game, use search_batting with game_date and team filters — batting_lines contain batting_order and position for starters. Example: "2026年5月10日の広島のスタメン" → {"intent":"search_batting","filters":{"game_date":"2026-05-10","team":"広島"}}. Do NOT use search_roster for lineup queries.',
    '- If the query is about registered player lists (登録選手, 一軍登録, etc.) without batting order info, use search_roster.',
    '- If the query asks a player\'s team/affiliation (所属チーム, どこのチーム, 所属, 在籍, チームは), use player_affiliation. Do not use search_events for affiliation questions.',
    '- CRITICAL: チームの勝利数・敗北数・引き分け数・勝敗（○勝○敗）を明示的に聞かれたら、必ず aggregate_games を使うこと。game_detail や search_games は絶対に使わないこと。例: 「2024年阪神の勝利数」→ {"intent":"aggregate_games","filters":{"year":2024,"team":"阪神"}}、「今季ソフトバンクは何勝？」→ {"intent":"aggregate_games","filters":{"year":2026,"team":"ソフトバンク"}}。',
    '- CRITICAL: チーム名だけ（またはチーム＋年）で「成績」を聞かれ、勝利数・勝敗・順位などの明示的な言及がない場合は aggregate_batting を使うこと。「はんしんの成績」「ヤクルトの成績」「今シーズンのDeNA」などは aggregate_games ではなく aggregate_batting で打撃統計を返すこと。年の指定がない場合は現在の年（Current date in Japanから取得）を year フィルタとして設定すること。',
    '- If the query asks for totals or aggregation, use aggregate_* for the relevant table.',
    '- For home run existence/details (本塁打を打ったことある？, ホームラン打った？, 本塁打一覧, ホームラン一覧, HR一覧, どの試合で打ったか), use search_events with event_type: "plate_appearance" and result_text_contains: "ホームラン"; do not use result_text_contains: "本". For numeric totals/rankings, use aggregate_batting instead.',
    '- If the query is about game lists or game ids, use search_games.',
    '- If the query asks about a specific game or games at a venue on a date, use game_detail when the user says 試合について, 試合詳細, 結果, スコア, 戦評, 振り返り, or ハイライト.',
    '- Otherwise prefer search_events.',
  ].join('\n')
}

function currentJstDate(): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${year}-${month}-${day}`
}
