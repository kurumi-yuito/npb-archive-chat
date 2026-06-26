export type ScoresCalendarGame = {
  scoresBaseUrl: string
  slug: string
  homeTeamName: string | null
  awayTeamName: string | null
  venue: string | null
  competition: string | null
  startTimeText: string | null
}

export type StructuredGame = {
  game_id: string | null
  game_date: string
  competition: string | null
  venue: string | null
  home_team: string | null
  away_team: string | null
  start_time: string | null
  source_urls: string[]
}

export type StructuredEvent = {
  game_id: string | null
  sequence: number
  inning: number | null
  half: 'top' | 'bottom' | null
  batter_name: string | null
  batter_url: string | null
  pitcher_name: string | null
  pitcher_url: string | null
  event_type: string
  event_subtype: string | null
  result_text: string | null
  runner_name: string | null
  runner_url: string | null
  outs: string | null
  bases: string | null
  runs_scored: number | null
  score_change: string | null
  substitution: string | null
  pitching_change: string | null
  event_attributes_json: string | null
  source_url: string | null
  source_text: string | null
}

export type StructuredBattingLine = {
  game_id: string | null
  team: string | null
  player_name: string | null
  player_url: string | null
  batting_order: number | null
  position: string | null
  at_bats: number | null
  runs: number | null
  hits: number | null
  rbis: number | null
  strikeouts: number | null
  walks: number | null
  hit_by_pitch: number | null
  sacrifice_hits: number | null
  sacrifice_flies: number | null
  stolen_bases: number | null
  errors: number | null
  raw_text: string | null
  source_url: string | null
}

export type StructuredPitchingLine = {
  game_id: string | null
  team: string | null
  pitcher_name: string | null
  pitcher_url: string | null
  sequence: number
  innings_pitched: string | null
  batters_faced: number | null
  pitches: number | null
  hits_allowed: number | null
  home_runs_allowed: number | null
  strikeouts: number | null
  walks: number | null
  hit_by_pitch: number | null
  runs_allowed: number | null
  earned_runs: number | null
  win_loss_save_hold: string | null
  raw_text: string | null
  source_url: string | null
}

export type StructuredRosterEntry = {
  game_id: string | null
  team: string | null
  player_name: string | null
  player_url: string | null
  uniform_number: string | null
  position: string | null
  starter: boolean | null
  batting_order: number | null
  raw_text: string | null
  source_url: string | null
}

export type StructuredLineScore = {
  game_id: string | null
  away_team: string | null
  home_team: string | null
  inning_scores: {
    innings: string[]
    away: string[]
    home: string[]
  }
  runs: {
    away: number | null
    home: number | null
  }
  hits: {
    away: number | null
    home: number | null
  }
  errors: {
    away: number | null
    home: number | null
  }
  raw_text: string | null
  source_url: string | null
}

export type StructuredSourceEntry = {
  source_key: 'index' | 'playbyplay' | 'box' | 'roster'
  source_url: string
}

export type StructuredSources = StructuredSourceEntry[]
