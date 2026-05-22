import { z } from 'zod'

/**
 * Shared Zod schemas for validation boundaries (see AGENTS.md).
 */
export { z }

export const discoveryCompetitionSchema = z.enum(['regular', 'farm'])

export const discoveryListingTypeSchema = z.enum(['scores', 'schedules'])

export const discoveryListingStatusSchema = z.enum([
  'listed',
  'scheduled',
  'postponed',
])

export const rawPageKeySchema = z.enum([
  'index',
  'playByPlay',
  'box',
  'roster',
])

/**
 * `scores/{year}/{mmdd}/{gameId}/` のディレクトリ名（discovery / downloader 共通）。
 * 末尾は **2桁の数字のみ**（`01`–`99`）。100 以上は表現できないため、同一カードの年間通算は 99 まで。
 */
export const DISCOVERY_GAME_ID_REGEX = /^[a-z0-9]+-[a-z0-9]+-\d{2}$/

export const discoveryTeamSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
})

export const discoveryGameSchema = z.object({
  year: z.number().int().min(1936),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mmdd: z.string().regex(/^\d{4}$/),
  gameId: z.string().regex(DISCOVERY_GAME_ID_REGEX),
  gameNumber: z.number().int().positive(),
  competition: discoveryCompetitionSchema,
  listingType: discoveryListingTypeSchema,
  listingStatus: discoveryListingStatusSchema,
  startsAt: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  venue: z.string().min(1).nullable(),
  homeTeam: discoveryTeamSchema,
  awayTeam: discoveryTeamSchema,
  source: z.object({
    calendarPageUrl: z.string().url(),
    dailyPageUrl: z.string().url(),
  }),
  downloader: z.object({
    scoreBaseUrl: z.string().url(),
    /** BIS 英語版の単試合ページ（`s…html` / `fs…html`）。index の取得元が scores 直リンクでない場合に入る。 */
    bisGamePageUrl: z.string().url().optional(),
    pages: z.object({
      index: z.string().url(),
      playByPlay: z.string().url(),
      box: z.string().url(),
      roster: z.string().url(),
    }),
  }),
})

export const discoveryYearSchema = z.object({
  schemaVersion: z.literal(1),
  year: z.number().int().min(1936),
  generatedAt: z.string().datetime({ offset: true }),
  games: z.array(discoveryGameSchema),
})

const playerRefSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1).nullable(),
})

export const playByPlayEventTypeSchema = z.enum([
  'game_note',
  'substitution',
  'plate_appearance',
  'runner_event',
])

export const playByPlayEventSubtypeSchema = z.enum([
  'starting_pitcher',
  'pitching_change',
  'defensive_switch',
  'pinch_hitter',
  'pinch_runner',
  'standard',
  'stolen_base',
  'caught_stealing',
  'advance',
  'other',
])

export const runnerEventAttributesSchema = z.object({
  runner: playerRefSchema.nullable(),
  implied_substitution_subtype: z.enum(['pinch_runner']).nullable(),
})

export const inningHalfSchema = z.enum(['top', 'bottom'])

export const searchEventsFiltersSchema = z.object({
  year: z.number().int().min(1936).optional(),
  year_from: z.number().int().min(1936).optional(),
  year_to: z.number().int().min(1936).optional(),
  game_id: z.string().min(1).optional(),
  game_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  inning: z.number().int().positive().optional(),
  half: inningHalfSchema.optional(),
  team: z.string().min(1).optional(),
  batter_name: z.string().min(1).optional(),
  batter_player_id: z.string().min(1).optional(),
  pitcher_name: z.string().min(1).optional(),
  pitcher_player_id: z.string().min(1).optional(),
  runner_name: z.string().min(1).optional(),
  runner_player_id: z.string().min(1).optional(),
  event_type: playByPlayEventTypeSchema.optional(),
  event_subtype: playByPlayEventSubtypeSchema.optional(),
  player_name: z.string().min(1).optional(),
  player_id: z.string().min(1).optional(),
  result_text_contains: z.string().min(1).optional(),
  limit: z.number().int().positive().max(500).optional(),
})

export const playerCandidateSchema = z.object({
  player_id: z.string().min(1).nullable(),
  name: z.string().min(1),
  primary_team: z.string().min(1).nullable(),
  roles: z.array(z.string().min(1)),
  teams: z.array(z.string().min(1)),
  years: z.array(z.number().int().min(1936)),
})

export type PlayerCandidate = z.infer<typeof playerCandidateSchema>

/** games テーブル向けの一覧検索 */
export const searchGamesFiltersSchema = z.object({
  year: z.number().int().min(1936).optional(),
  year_from: z.number().int().min(1936).optional(),
  year_to: z.number().int().min(1936).optional(),
  game_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  game_id: z.string().min(1).optional(),
  team: z.string().min(1).optional(),
  venue: z.string().min(1).optional(),
  limit: z.number().int().positive().max(500).optional(),
})

/** pitching_lines 向け検索（名前・チームは完全一致） */
export const searchPitchingLinesFiltersSchema = z.object({
  year: z.number().int().min(1936).optional(),
  year_from: z.number().int().min(1936).optional(),
  year_to: z.number().int().min(1936).optional(),
  game_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pitcher_name: z.string().min(1).optional(),
  team: z.string().min(1).optional(),
  recent: z.boolean().optional(),
  limit: z.number().int().positive().max(500).optional(),
})

export const searchBattingLinesFiltersSchema = z.object({
  year: z.number().int().min(1936).optional(),
  year_from: z.number().int().min(1936).optional(),
  year_to: z.number().int().min(1936).optional(),
  game_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  player_name: z.string().min(1).optional(),
  player_id: z.string().min(1).optional(),
  team: z.string().min(1).optional(),
  result_text_contains: z.string().min(1).optional(),
  batting_order: z.number().int().min(1).max(9).optional(),
  position: z.string().min(1).optional(),
  recent: z.boolean().optional(),
  limit: z.number().int().positive().max(500).optional(),
})

export const searchRosterEntriesFiltersSchema = z.object({
  year: z.number().int().min(1936).optional(),
  year_from: z.number().int().min(1936).optional(),
  year_to: z.number().int().min(1936).optional(),
  game_id: z.string().min(1).optional(),
  game_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  team: z.string().min(1).optional(),
  player_name: z.string().min(1).optional(),
  starter: z.boolean().optional(),
  limit: z.number().int().positive().max(500).optional(),
})

export const playerAffiliationFiltersSchema = z.object({
  year: z.number().int().min(1936).optional(),
  year_from: z.number().int().min(1936).optional(),
  year_to: z.number().int().min(1936).optional(),
  team: z.string().min(1).optional(),
  player_name: z.string().min(1),
  player_id: z.string().min(1).optional(),
  limit: z.number().int().positive().max(500).optional(),
})

export const gameDetailFiltersSchema = z.object({
  year: z.number().int().min(1936).optional(),
  year_from: z.number().int().min(1936).optional(),
  year_to: z.number().int().min(1936).optional(),
  game_id: z.string().min(1).optional(),
  game_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  team: z.string().min(1).optional(),
  venue: z.string().min(1).optional(),
  player_name: z.string().min(1).optional(),
  limit: z.number().int().positive().max(100).optional(),
})

export const aggregateBattingFiltersSchema = searchBattingLinesFiltersSchema.omit({
  limit: true,
}).extend({
  limit: z.number().int().positive().max(100).optional(),
})

export const aggregatePitchingFiltersSchema = searchPitchingLinesFiltersSchema.omit({
  limit: true,
}).extend({
  limit: z.number().int().positive().max(100).optional(),
})

export const aggregateEventsFiltersSchema = searchEventsFiltersSchema.omit({
  limit: true,
}).extend({
  limit: z.number().int().positive().max(100).optional(),
})

export const chatIntentSchema = z.enum([
  'search_events',
  'search_games',
  'search_batting',
  'search_pitching',
  'search_roster',
  'player_affiliation',
  'game_detail',
  'aggregate_batting',
  'aggregate_pitching',
  'aggregate_events',
])

export const chatHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
})

export const chatRequestSchema = z.object({
  message: z.string().min(1),
  history: z.array(chatHistoryMessageSchema).max(12).optional(),
})

export const chatPlanSchema = z.enum(['free', 'pro'])
export const chatAuthProviderSchema = z.enum(['guest', 'google'])

export const billingMethodSchema = z.enum(['stripe_subscription'])

export const billingPlanSchema = z.object({
  key: chatPlanSchema,
  label: z.string().min(1),
  monthlyPriceYen: z.number().int().nonnegative(),
  currency: z.literal('JPY'),
  billingMethod: billingMethodSchema,
  monthlyUsageLimit: z.number().int().positive().nullable(),
})

export const billingStatusSchema = z.enum([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
])

export const billingActionResponseSchema = z.object({
  redirectUrl: z.string().url(),
  provider: z.literal('stripe'),
})

/** /api/chat のレスポンスおよび GET /api/chat/usage の利用状況 */
export const chatUsageInfoSchema = z.object({
  plan: chatPlanSchema,
  month: z.string().regex(/^\d{4}-\d{2}$/),
  used: z.number().int().nonnegative(),
  limit: z.number().int().positive().nullable(),
  remaining: z.number().int().nonnegative().nullable(),
})

export const chatAccountSchema = z.object({
  userId: z.string().min(1),
  authProvider: chatAuthProviderSchema,
  authEmailVerified: z.boolean(),
  email: z.string().email().nullable(),
  displayName: z.string().min(1).nullable(),
  plan: chatPlanSchema,
  billingStatus: billingStatusSchema,
  billingProvider: z.literal('stripe'),
  billingConfigured: z.boolean(),
  googleAuthConfigured: z.boolean(),
  billingPlan: billingPlanSchema,
  stripeCustomerId: z.string().min(1).nullable(),
  stripeSubscriptionId: z.string().min(1).nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

export const updateChatAccountRequestSchema = z.object({
  email: z.string().email().nullable().optional(),
  displayName: z.string().min(1).max(80).nullable().optional(),
})

export const updateChatSubscriptionRequestSchema = z.object({
  plan: chatPlanSchema,
})

/** LLM / fallback parser と検索直前の正規化レイヤーはこの schema を通してから DB 検索へ渡す。 */
export const chatStructuredQuerySchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('search_events'),
    filters: searchEventsFiltersSchema,
  }),
  z.object({
    intent: z.literal('search_games'),
    filters: searchGamesFiltersSchema,
  }),
  z.object({
    intent: z.literal('search_batting'),
    filters: searchBattingLinesFiltersSchema,
  }),
  z.object({
    intent: z.literal('search_pitching'),
    filters: searchPitchingLinesFiltersSchema,
  }),
  z.object({
    intent: z.literal('search_roster'),
    filters: searchRosterEntriesFiltersSchema,
  }),
  z.object({
    intent: z.literal('player_affiliation'),
    filters: playerAffiliationFiltersSchema,
  }),
  z.object({
    intent: z.literal('game_detail'),
    filters: gameDetailFiltersSchema,
  }),
  z.object({
    intent: z.literal('aggregate_batting'),
    filters: aggregateBattingFiltersSchema,
  }),
  z.object({
    intent: z.literal('aggregate_pitching'),
    filters: aggregatePitchingFiltersSchema,
  }),
  z.object({
    intent: z.literal('aggregate_events'),
    filters: aggregateEventsFiltersSchema,
  }),
  z.object({
    intent: z.literal('off_topic'),
    filters: z.object({}),
  }),
])

export const chatSourceSchema = z.object({
  game_id: z.string().min(1),
  source_key: z.enum(['index', 'playbyplay', 'box', 'roster']),
  source_url: z.string().url(),
})

export const chatResponseSchema = z.object({
  message: z.string().min(1),
  structured_query: chatStructuredQuerySchema,
  answer: z.object({
    summary: z.string().min(1),
    result_count: z.number().int().nonnegative(),
    remaining_count: z.number().int().nonnegative().optional(),
    source_urls: z.array(z.string().url()),
    resolved_player: z.object({
      input: z.string().min(1),
      player_id: z.string().min(1).nullable().optional(),
      name: z.string().min(1).nullable(),
      primary_team: z.string().min(1).nullable().optional(),
      status: z.enum(['resolved', 'ambiguous', 'not_found']),
      candidates: z.array(playerCandidateSchema),
    }).nullable().optional(),
    applied_filters: z.record(z.unknown()).optional(),
  }),
  usage: chatUsageInfoSchema,
  results: z.object({
    events: z.array(
      z.object({
        gameId: z.string().min(1),
        gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        sequence: z.number().int().nonnegative(),
        inning: z.number().int().positive(),
        half: inningHalfSchema,
        offenseTeam: z.string().min(1),
        eventType: playByPlayEventTypeSchema,
        eventSubtype: playByPlayEventSubtypeSchema,
        batterName: z.string().nullable(),
        pitcherName: z.string().nullable(),
        runnerName: z.string().nullable(),
        resultText: z.string().min(1),
        eventAttributesJson: z.string().nullable(),
        sourceUrl: z.string().nullable().optional(),
      }),
    ),
    games: z.array(
      z.object({
        gameId: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        awayTeamName: z.string().min(1),
        homeTeamName: z.string().min(1),
        matchupText: z.string().min(1),
        venue: z.string(),
      }),
    ),
    pitching: z.array(
      z.object({
        gameId: z.string().min(1),
        gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        team: z.string().min(1),
        pitcherName: z.string().min(1),
        inningsPitched: z.string().min(1),
        pitchCount: z.number().int().nonnegative(),
        strikeouts: z.number().int().nonnegative(),
        runs: z.number().int().nonnegative(),
        earnedRuns: z.number().int().nonnegative(),
        sourceKind: z.enum(['box', 'bis_pitching', 'bis_pitching_farm']).optional(),
        sourceUrl: z.string().nullable().optional(),
        statsJson: z.string().nullable().optional(),
      }),
    ),
    batting: z.array(
      z.object({
        gameId: z.string().min(1),
        gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        team: z.string().min(1),
        playerName: z.string().min(1),
        battingOrder: z.number().int().nullable(),
        position: z.string().nullable(),
        atBats: z.number().int().nonnegative(),
        runs: z.number().int().nonnegative(),
        hits: z.number().int().nonnegative(),
        runsBattedIn: z.number().int().nonnegative(),
        stolenBases: z.number().int().nonnegative(),
        strikeouts: z.number().int().nonnegative().nullable(),
        walks: z.number().int().nonnegative().nullable(),
        rawText: z.string().nullable(),
        sourceKind: z.enum(['box', 'bis_batting']).optional(),
        sourceUrl: z.string().nullable().optional(),
        statsJson: z.string().nullable().optional(),
      }),
    ),
    roster: z.array(
      z.object({
        gameId: z.string().min(1),
        gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        team: z.string().min(1),
        groupLabel: z.string().min(1),
        playerName: z.string().min(1),
        uniformNumber: z.string().nullable(),
        position: z.string().nullable(),
        starter: z.boolean().nullable(),
        battingOrder: z.number().int().nullable(),
      }),
    ),
    affiliations: z.array(
      z.object({
        year: z.number().int().min(1936),
        gameId: z.string().min(1),
        gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        team: z.string().min(1),
        playerName: z.string().min(1),
        playerId: z.string().nullable(),
        sourceKind: z.enum(['bis_roster', 'roster', 'batting', 'pitching', 'event']),
        sourceUrl: z.string().nullable(),
      }),
    ),
    gameDetails: z.array(
      z.object({
        gameId: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        venue: z.string(),
        competition: z.string().nullable(),
        awayTeamName: z.string().min(1),
        homeTeamName: z.string().min(1),
        matchupText: z.string().min(1),
        linescoreJson: z.string(),
      }),
    ),
    aggregates: z.array(
      z.object({
        kind: z.enum(['batting', 'pitching', 'events']),
        label: z.string().min(1),
        total: z.number().int().nonnegative(),
        stats: z.record(z.union([z.string(), z.number(), z.null()])),
      }),
    ),
  }),
  sources: z.array(chatSourceSchema),
})

export const chatResponseCoreSchema = chatResponseSchema.omit({ usage: true })

const lineScoreTeamSchema = z.object({
  team: z.string().min(1),
  innings: z.array(z.string().min(1)),
  totals: z.object({
    runs: z.number().int().nonnegative(),
    hits: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
  }),
})

export const richGameSchema = z.object({
  schemaVersion: z.literal(1),
  game_meta: z.object({
    year: z.number().int().min(1936),
    mmdd: z.string().regex(/^\d{4}$/),
    game_id: z.string().regex(/^[a-z0-9]+-[a-z0-9]+-\d{2}$/),
    canonical_url: z.string().url(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    date_label: z.string().min(1),
    venue: z.string().min(1),
    competition: z.string().min(1).nullable(),
    matchup_text: z.string().min(1),
    game_number: z.number().int().positive().nullable(),
    status: z.string().min(1).nullable(),
    start_time: z.string().nullable(),
    end_time: z.string().nullable(),
    duration_text: z.string().nullable(),
    attendance: z.number().int().nonnegative().nullable(),
    umpires: z.array(
      z.object({
        role: z.string().min(1),
        name: z.string().min(1),
      }),
    ),
    away_team: z.object({
      name: z.string().min(1),
      short_name: z.string().min(1).nullable(),
    }),
    home_team: z.object({
      name: z.string().min(1),
      short_name: z.string().min(1).nullable(),
    }),
  }),
  top_summary: z.object({
    linescore: z.object({
      innings: z.array(z.string().min(1)),
      away: lineScoreTeamSchema,
      home: lineScoreTeamSchema,
    }),
    result_pitchers: z.object({
      winner: z
        .object({
          label: z.string().min(1),
          player: playerRefSchema,
          record_text: z.string().min(1).nullable(),
        })
        .nullable(),
      loser: z
        .object({
          label: z.string().min(1),
          player: playerRefSchema,
          record_text: z.string().min(1).nullable(),
        })
        .nullable(),
      save: z
        .object({
          label: z.string().min(1),
          player: playerRefSchema,
          record_text: z.string().min(1).nullable(),
        })
        .nullable(),
    }),
    batteries: z.array(
      z.object({
        team: z.string().min(1),
        pitchers: z.array(playerRefSchema),
        catcher: playerRefSchema.nullable(),
        raw_text: z.string().min(1),
      }),
    ),
    home_runs: z.array(
      z.object({
        team: z.string().min(1),
        raw_text: z.string(),
        items: z.array(
          z.object({
            batter: playerRefSchema.nullable(),
            pitcher: playerRefSchema.nullable(),
            raw_text: z.string().min(1),
          }),
        ),
      }),
    ),
    latest_order: z.array(
      z.object({
        team: z.string().min(1),
        entries: z.array(
          z.object({
            batting_order: z.number().int().positive().nullable(),
            position: z.string().min(1),
            player: playerRefSchema,
            note: z.string().nullable(),
          }),
        ),
      }),
    ),
  }),
  play_by_play: z.array(
    z.object({
      event_index: z.number().int().nonnegative(),
      inning: z.number().int().positive(),
      half: inningHalfSchema,
      inning_label: z.string().min(1),
      offense_team: z.string().min(1),
      pitcher: playerRefSchema.nullable(),
      event_type: playByPlayEventTypeSchema,
      event_subtype: playByPlayEventSubtypeSchema,
      outs: z.string().nullable(),
      bases: z.string().nullable(),
      batter: z
        .object({
          role_prefix: z.string().nullable(),
          player: playerRefSchema.nullable(),
          raw_text: z.string().min(1),
        })
        .nullable(),
      count: z.string().nullable(),
      result: z.object({
        text: z.string().min(1),
        runs_batted_in: z.number().int().nonnegative().nullable(),
        links: z.array(playerRefSchema),
      }),
      event_attributes: runnerEventAttributesSchema.nullable(),
      raw_row_html: z.string().min(1),
    }),
  ),
  batting_box: z.array(
    z.object({
      team: z.string().min(1),
      headers: z.array(z.string().min(1)),
      rows: z.array(
        z.object({
          batting_order: z.number().int().positive().nullable(),
          position: z.string().min(1),
          player: playerRefSchema,
          stats: z.object({
            at_bats: z.number().int().nonnegative(),
            runs: z.number().int().nonnegative(),
            hits: z.number().int().nonnegative(),
            runs_batted_in: z.number().int().nonnegative(),
            stolen_bases: z.number().int().nonnegative(),
          }),
          inning_results: z.array(
            z.object({
              inning: z.string().min(1),
              text: z.string().min(1),
              classes: z.array(z.string().min(1)),
            }),
          ),
        }),
      ),
      team_totals: z.object({
        at_bats: z.number().int().nonnegative(),
        runs: z.number().int().nonnegative(),
        hits: z.number().int().nonnegative(),
        runs_batted_in: z.number().int().nonnegative(),
        stolen_bases: z.number().int().nonnegative(),
      }),
    }),
  ),
  pitching_box: z.array(
    z.object({
      team: z.string().min(1),
      headers: z.array(z.string().min(1)),
      rows: z.array(
        z.object({
          decision: z.string().nullable(),
          pitcher: playerRefSchema,
          pitch_count: z.number().int().nonnegative(),
          batters_faced: z.number().int().nonnegative(),
          innings_pitched: z.string().min(1),
          hits: z.number().int().nonnegative(),
          home_runs: z.number().int().nonnegative(),
          walks: z.number().int().nonnegative(),
          hit_batters: z.number().int().nonnegative(),
          strikeouts: z.number().int().nonnegative(),
          wild_pitches: z.number().int().nonnegative(),
          balks: z.number().int().nonnegative(),
          runs: z.number().int().nonnegative(),
          earned_runs: z.number().int().nonnegative(),
        }),
      ),
      team_totals: z.object({
        pitch_count: z.number().int().nonnegative(),
        batters_faced: z.number().int().nonnegative(),
        innings_pitched: z.string().min(1),
        hits: z.number().int().nonnegative(),
        home_runs: z.number().int().nonnegative(),
        walks: z.number().int().nonnegative(),
        hit_batters: z.number().int().nonnegative(),
        strikeouts: z.number().int().nonnegative(),
        wild_pitches: z.number().int().nonnegative(),
        balks: z.number().int().nonnegative(),
        runs: z.number().int().nonnegative(),
        earned_runs: z.number().int().nonnegative(),
      }),
    }),
  ),
  roster: z.array(
    z.object({
      team: z.string().min(1),
      groups: z.array(
        z.object({
          label: z.string().min(1),
          entries: z.array(
            z.object({
              number: z.string().min(1),
              player: playerRefSchema,
              throws: z.enum(['右', '左', '両']).nullable(),
              bats: z.enum(['右', '左', '両']).nullable(),
              raw_handedness: z.string().min(1),
            }),
          ),
        }),
      ),
    }),
  ),
  sources: z.object({
    index: z.object({
      url: z.string().url(),
      path: z.string().min(1),
    }),
    playbyplay: z.object({
      url: z.string().url(),
      path: z.string().min(1),
    }),
    box: z.object({
      url: z.string().url(),
      path: z.string().min(1),
    }),
    roster: z.object({
      url: z.string().url(),
      path: z.string().min(1),
    }),
  }),
  fetched_at: z.string().datetime({ offset: true }),
})

export type DiscoveryCompetition = z.infer<typeof discoveryCompetitionSchema>
export type DiscoveryListingType = z.infer<typeof discoveryListingTypeSchema>
export type DiscoveryListingStatus = z.infer<typeof discoveryListingStatusSchema>
export type RawPageKey = z.infer<typeof rawPageKeySchema>
export type DiscoveryTeam = z.infer<typeof discoveryTeamSchema>
export type DiscoveryGame = z.infer<typeof discoveryGameSchema>
export type DiscoveryYear = z.infer<typeof discoveryYearSchema>
export type PlayerRef = z.infer<typeof playerRefSchema>
export type InningHalf = z.infer<typeof inningHalfSchema>
export type PlayByPlayEventType = z.infer<typeof playByPlayEventTypeSchema>
export type PlayByPlayEventSubtype = z.infer<typeof playByPlayEventSubtypeSchema>
export type RunnerEventAttributes = z.infer<typeof runnerEventAttributesSchema>
export type SearchEventsFilters = z.infer<typeof searchEventsFiltersSchema>
export type SearchGamesFilters = z.infer<typeof searchGamesFiltersSchema>
export type SearchPitchingLinesFilters = z.infer<typeof searchPitchingLinesFiltersSchema>
export type SearchBattingLinesFilters = z.infer<typeof searchBattingLinesFiltersSchema>
export type SearchRosterEntriesFilters = z.infer<typeof searchRosterEntriesFiltersSchema>
export type PlayerAffiliationFilters = z.infer<typeof playerAffiliationFiltersSchema>
export type GameDetailFilters = z.infer<typeof gameDetailFiltersSchema>
export type AggregateBattingFilters = z.infer<typeof aggregateBattingFiltersSchema>
export type AggregatePitchingFilters = z.infer<typeof aggregatePitchingFiltersSchema>
export type AggregateEventsFilters = z.infer<typeof aggregateEventsFiltersSchema>
export type ChatIntent = z.infer<typeof chatIntentSchema>
export type ChatRequest = z.infer<typeof chatRequestSchema>
export type ChatPlan = z.infer<typeof chatPlanSchema>
export type ChatUsageInfo = z.infer<typeof chatUsageInfoSchema>
export type ChatAccount = z.infer<typeof chatAccountSchema>
export type UpdateChatAccountRequest = z.infer<typeof updateChatAccountRequestSchema>
export type UpdateChatSubscriptionRequest = z.infer<typeof updateChatSubscriptionRequestSchema>
export type ChatStructuredQuery = z.infer<typeof chatStructuredQuerySchema>
export type ChatSource = z.infer<typeof chatSourceSchema>
export type ChatResponse = z.infer<typeof chatResponseSchema>
export type ChatResponseCore = z.infer<typeof chatResponseCoreSchema>
export type RichGame = z.infer<typeof richGameSchema>
