import { playByPlayEventSubtypeSchema, playByPlayEventTypeSchema } from '@npb/schemas'

const eventTypes = playByPlayEventTypeSchema.options.join(', ')
const eventSubtypes = playByPlayEventSubtypeSchema.options.join(', ')

export const chatQueryParserSystemPrompt = [
  'You convert NPB chat questions into structured query JSON for deterministic DB search.',
  'Return exactly one JSON object and no surrounding prose.',
  'Use only these intents: search_events, search_games, search_batting, search_pitching, search_roster, player_affiliation, game_detail, aggregate_batting, aggregate_pitching, aggregate_events.',
  'Keep the existing schema shape: {"intent": "...", "filters": {...}}.',
  'Only include filters supported by the schema. Omit unknown or uncertain fields.',
  'Normalize dates to YYYY-MM-DD when the message contains an explicit date.',
  'Map innings like "8回裏" to {"inning": 8, "half": "bottom"} and "8回表" to {"inning": 8, "half": "top"}.',
  'For event queries, valid event_type values are: ' + eventTypes + '.',
  'For event queries, valid event_subtype values are: ' + eventSubtypes + '.',
  'Typical mappings: 代打 -> plate_appearance + pinch_hitter, 盗塁 -> runner_event + stolen_base, 先発投手 -> game_note + starting_pitcher, 投手交代 -> substitution + pitching_change.',
  'When extracting person names, return only the bare player name.',
  'Do not include leading date text, inning text, team names, or particles such as の, に, で, が, を in batter_name, pitcher_name, runner_name, or player_name.',
  'Do not invent DB results or answer text. Your job is query generation only.',
].join('\n')

export function buildChatQueryParserUserPrompt(message: string): string {
  return [
    'Convert the following user message into structured query JSON.',
    'User message:',
    message,
    '',
    'Output JSON shape:',
    '{"intent":"search_events|search_games|search_batting|search_pitching|search_roster|player_affiliation|game_detail|aggregate_batting|aggregate_pitching|aggregate_events","filters":{...}}',
    '',
    'Filter rules:',
    '- All intents may use year, year_from, year_to when the user gives a year or year range.',
    '- search_events filters: year, year_from, year_to, game_date, inning, half, team, batter_name, pitcher_name, runner_name, event_type, event_subtype, player_name, result_text_contains, limit',
    '- search_games filters: year, year_from, year_to, game_date, game_id, team, limit',
    '- search_batting filters: year, year_from, year_to, game_date, player_name, player_id, team, result_text_contains, limit',
    '- search_pitching filters: year, year_from, year_to, game_date, pitcher_name, team, limit',
    '- search_roster filters: year, year_from, year_to, game_id, game_date, team, player_name, starter, limit',
    '- player_affiliation filters: year, year_from, year_to, team, player_name, player_id, limit',
    '- game_detail filters: year, year_from, year_to, game_id, game_date, team, player_name, limit',
    '- aggregate_batting filters: year, year_from, year_to, game_date, player_name, team, result_text_contains, limit',
    '- aggregate_pitching filters: year, year_from, year_to, game_date, pitcher_name, team, limit',
    '- aggregate_events filters: year, year_from, year_to, game_date, inning, half, team, batter_name, pitcher_name, runner_name, event_type, event_subtype, player_name, result_text_contains, limit',
    '- If the user gives no reliable value for a field, omit it.',
    '- For person-name fields, output only the player name itself. Example: "2025-08-15の8回裏に山村が代打" -> batter_name: "山村".',
    '- Example: "2025-08-15の益田の投手成績" -> pitcher_name: "益田".',
    '- If the query is about pitching lines, use search_pitching.',
    '- If the query asks for a hitter/player season batting stats or uses 成績 without pitching terms, use search_batting. Example: "ヤクルト村上の今年の成績" -> search_batting with team: "ヤクルト" and player_name: "村上".',
    '- If the query is about batting lines or plate appearance results, use search_batting.',
    '- If the query is about starters or roster entries, use search_roster.',
    '- If the query asks a player\'s team/affiliation (所属チーム, どこのチーム, 所属, 在籍, チームは), use player_affiliation. Do not use search_events for affiliation questions.',
    '- If the query asks for totals or aggregation, use aggregate_* for the relevant table.',
    '- For home run event lists (本塁打, ホームラン, HR), use search_events with event_type: "plate_appearance" and result_text_contains: "ホームラン"; do not use result_text_contains: "本".',
    '- If the query is about game lists or game ids, use search_games.',
    '- Otherwise prefer search_events.',
  ].join('\n')
}
