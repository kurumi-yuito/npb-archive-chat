import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  StructuredBattingLine,
  StructuredEvent,
  StructuredGame,
  StructuredLineScore,
  StructuredPitchingLine,
  StructuredRosterEntry,
} from '@npb/parser'
import type { RichGame } from '@npb/schemas'
import type { SqliteDatabase } from './sqlite'
import { withTransaction } from './sqlite'

type LoadResult = {
  gameId: string
  insertedEvents: number
  insertedBattingLines: number
  insertedPitchingLines: number
  insertedRosterEntries: number
  insertedSourceSnapshots: number
}

type StructuredSourceSnapshot = {
  source_key: 'index' | 'playbyplay' | 'box' | 'roster'
  source_url: string
  raw_path: string
  structured_path: string
}

type StructuredGameBundle = {
  game: StructuredGame
  events: StructuredEvent[]
  battingLines: StructuredBattingLine[]
  pitchingLines: StructuredPitchingLine[]
  rosterEntries: StructuredRosterEntry[]
  linescore: StructuredLineScore
  sources: StructuredSourceSnapshot[]
  fetchedAt: string
}

export function replaceGameEvents(
  database: SqliteDatabase,
  gameId: string,
  events: RichGame['play_by_play'],
): { gameId: string; insertedEvents: number } {
  return withTransaction(database, () => {
    database.prepare('DELETE FROM events WHERE game_id = ?').run(gameId)
    insertEvents(database, gameId, events)
    return { gameId, insertedEvents: events.length }
  })
}

export function loadRichGame(database: SqliteDatabase, richGame: RichGame): LoadResult {
  const now = new Date().toISOString()
  const gameId = richGame.game_meta.game_id

  return withTransaction(database, () => {
    database
      .prepare(
        `INSERT INTO games (
          schema_version,
          year,
          mmdd,
          game_id,
          canonical_url,
          date,
          date_label,
          venue,
          competition,
          matchup_text,
          game_number,
          status,
          start_time,
          end_time,
          duration_text,
          attendance,
          away_team_name,
          away_team_short_name,
          home_team_name,
          home_team_short_name,
          linescore_json,
          result_pitchers_json,
          batteries_json,
          home_runs_json,
          latest_order_json,
          fetched_at,
          loaded_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(game_id) DO UPDATE SET
          schema_version = excluded.schema_version,
          year = excluded.year,
          mmdd = excluded.mmdd,
          canonical_url = excluded.canonical_url,
          date = excluded.date,
          date_label = excluded.date_label,
          venue = excluded.venue,
          competition = excluded.competition,
          matchup_text = excluded.matchup_text,
          game_number = excluded.game_number,
          status = excluded.status,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          duration_text = excluded.duration_text,
          attendance = excluded.attendance,
          away_team_name = excluded.away_team_name,
          away_team_short_name = excluded.away_team_short_name,
          home_team_name = excluded.home_team_name,
          home_team_short_name = excluded.home_team_short_name,
          linescore_json = excluded.linescore_json,
          result_pitchers_json = excluded.result_pitchers_json,
          batteries_json = excluded.batteries_json,
          home_runs_json = excluded.home_runs_json,
          latest_order_json = excluded.latest_order_json,
          fetched_at = excluded.fetched_at,
          loaded_at = excluded.loaded_at`,
      )
      .run(
        richGame.schemaVersion,
        richGame.game_meta.year,
        richGame.game_meta.mmdd,
        gameId,
        richGame.game_meta.canonical_url,
        richGame.game_meta.date,
        richGame.game_meta.date_label,
        richGame.game_meta.venue,
        richGame.game_meta.competition,
        richGame.game_meta.matchup_text,
        richGame.game_meta.game_number,
        richGame.game_meta.status,
        richGame.game_meta.start_time,
        richGame.game_meta.end_time,
        richGame.game_meta.duration_text,
        richGame.game_meta.attendance,
        richGame.game_meta.away_team.name,
        richGame.game_meta.away_team.short_name,
        richGame.game_meta.home_team.name,
        richGame.game_meta.home_team.short_name,
        stringifyJson(richGame.top_summary.linescore),
        stringifyJson(richGame.top_summary.result_pitchers),
        stringifyJson(richGame.top_summary.batteries),
        stringifyJson(richGame.top_summary.home_runs),
        stringifyJson(richGame.top_summary.latest_order),
        richGame.fetched_at,
        now,
      )

    for (const table of [
      'source_snapshots',
      'events',
      'batting_lines',
      'pitching_lines',
      'roster_entries',
    ] as const) {
      database.prepare(`DELETE FROM ${table} WHERE game_id = ?`).run(gameId)
    }

    const insertSourceSnapshot = database.prepare(
      `INSERT INTO source_snapshots (
        game_id,
        source_key,
        source_url,
        source_path,
        fetched_at
      ) VALUES (?, ?, ?, ?, ?)`,
    )

    const sourceEntries = Object.entries(richGame.sources)
    for (const [sourceKey, source] of sourceEntries) {
      insertSourceSnapshot.run(gameId, sourceKey, source.url, source.path, richGame.fetched_at)
    }

    insertEvents(database, gameId, richGame.play_by_play)

    const insertBattingLine = database.prepare(
      `INSERT INTO batting_lines (
        game_id,
        team,
        row_index,
        batting_order,
        position,
        player_name,
        player_url,
        at_bats,
        runs,
        hits,
        runs_batted_in,
        stolen_bases,
        inning_results_json,
        headers_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    let battingLineCount = 0
    for (const teamLine of richGame.batting_box) {
      teamLine.rows.forEach((row, rowIndex) => {
        insertBattingLine.run(
          gameId,
          teamLine.team,
          rowIndex,
          row.batting_order,
          row.position,
          row.player.name,
          row.player.url,
          row.stats.at_bats,
          row.stats.runs,
          row.stats.hits,
          row.stats.runs_batted_in,
          row.stats.stolen_bases,
          stringifyJson(row.inning_results),
          stringifyJson(teamLine.headers),
        )
        battingLineCount += 1
      })
    }

    const insertPitchingLine = database.prepare(
      `INSERT INTO pitching_lines (
        game_id,
        team,
        row_index,
        decision,
        pitcher_name,
        pitcher_url,
        pitch_count,
        batters_faced,
        innings_pitched,
        hits,
        home_runs,
        walks,
        hit_batters,
        strikeouts,
        wild_pitches,
        balks,
        runs,
        earned_runs,
        headers_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    let pitchingLineCount = 0
    for (const teamLine of richGame.pitching_box) {
      teamLine.rows.forEach((row, rowIndex) => {
        insertPitchingLine.run(
          gameId,
          teamLine.team,
          rowIndex,
          row.decision,
          row.pitcher.name,
          row.pitcher.url,
          row.pitch_count,
          row.batters_faced,
          row.innings_pitched,
          row.hits,
          row.home_runs,
          row.walks,
          row.hit_batters,
          row.strikeouts,
          row.wild_pitches,
          row.balks,
          row.runs,
          row.earned_runs,
          stringifyJson(teamLine.headers),
        )
        pitchingLineCount += 1
      })
    }

    const insertRosterEntry = database.prepare(
      `INSERT INTO roster_entries (
        game_id,
        team,
        group_label,
        entry_index,
        number,
        player_name,
        player_url,
        throws,
        bats,
        raw_handedness
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    let rosterEntryCount = 0
    for (const teamRoster of richGame.roster) {
      for (const group of teamRoster.groups) {
        group.entries.forEach((entry, entryIndex) => {
          insertRosterEntry.run(
            gameId,
            teamRoster.team,
            group.label,
            entryIndex,
            entry.number,
            entry.player.name,
            entry.player.url,
            entry.throws,
            entry.bats,
            entry.raw_handedness,
          )
          rosterEntryCount += 1
        })
      }
    }

    return {
      gameId,
      insertedEvents: richGame.play_by_play.length,
      insertedBattingLines: battingLineCount,
      insertedPitchingLines: pitchingLineCount,
      insertedRosterEntries: rosterEntryCount,
      insertedSourceSnapshots: sourceEntries.length,
    }
  })
}

export async function loadStructuredGameDirectory(
  database: SqliteDatabase,
  structuredDir: string,
): Promise<LoadResult> {
  const [
    game,
    events,
    battingLines,
    pitchingLines,
    rosterEntries,
    linescore,
    sources,
  ] = await Promise.all([
    readJsonFile<StructuredGame>(path.join(structuredDir, 'game.json')),
    readJsonFile<StructuredEvent[]>(path.join(structuredDir, 'events.json')),
    readJsonFile<StructuredBattingLine[]>(path.join(structuredDir, 'batting_lines.json')),
    readJsonFile<StructuredPitchingLine[]>(path.join(structuredDir, 'pitching_lines.json')),
    readJsonFile<StructuredRosterEntry[]>(path.join(structuredDir, 'roster.json')),
    readJsonFile<StructuredLineScore>(path.join(structuredDir, 'linescore.json')),
    readJsonFile<StructuredSourceSnapshot[]>(path.join(structuredDir, 'sources.json')),
  ])

  return loadStructuredGame(database, {
    game,
    events,
    battingLines,
    pitchingLines,
    rosterEntries,
    linescore,
    sources,
    fetchedAt: new Date().toISOString(),
  })
}

export function loadStructuredGame(
  database: SqliteDatabase,
  bundle: StructuredGameBundle,
): LoadResult {
  const gameId = bundle.game.game_id
  if (!gameId) {
    throw new Error('structured game is missing game_id')
  }

  const now = new Date().toISOString()
  return withTransaction(database, () => {
    database
      .prepare(
        `INSERT INTO games (
          schema_version,
          year,
          mmdd,
          game_id,
          canonical_url,
          date,
          date_label,
          venue,
          competition,
          matchup_text,
          game_number,
          status,
          start_time,
          end_time,
          duration_text,
          attendance,
          away_team_name,
          away_team_short_name,
          home_team_name,
          home_team_short_name,
          linescore_json,
          result_pitchers_json,
          batteries_json,
          home_runs_json,
          latest_order_json,
          fetched_at,
          loaded_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(game_id) DO UPDATE SET
          schema_version = excluded.schema_version,
          year = excluded.year,
          mmdd = excluded.mmdd,
          canonical_url = excluded.canonical_url,
          date = excluded.date,
          date_label = excluded.date_label,
          venue = excluded.venue,
          competition = excluded.competition,
          matchup_text = excluded.matchup_text,
          start_time = excluded.start_time,
          away_team_name = excluded.away_team_name,
          home_team_name = excluded.home_team_name,
          linescore_json = excluded.linescore_json,
          fetched_at = excluded.fetched_at,
          loaded_at = excluded.loaded_at`,
      )
      .run(
        1,
        Number(bundle.game.game_date.slice(0, 4)),
        bundle.game.game_date.slice(5, 7) + bundle.game.game_date.slice(8, 10),
        gameId,
        bundle.sources.find((source) => source.source_key === 'index')?.source_url ?? bundle.game.source_urls[0] ?? 'https://npb.jp/',
        bundle.game.game_date,
        bundle.game.game_date,
        bundle.game.venue ?? '',
        bundle.game.competition,
        `${bundle.game.home_team ?? ''} vs ${bundle.game.away_team ?? ''}`.trim(),
        null,
        null,
        bundle.game.start_time,
        null,
        null,
        null,
        bundle.game.away_team ?? '',
        null,
        bundle.game.home_team ?? '',
        null,
        stringifyJson(bundle.linescore),
        stringifyJson({ winner: null, loser: null, save: null }),
        stringifyJson([]),
        stringifyJson([]),
        stringifyJson([]),
        bundle.fetchedAt,
        now,
      )

    for (const table of [
      'source_snapshots',
      'events',
      'batting_lines',
      'pitching_lines',
      'roster_entries',
    ] as const) {
      database.prepare(`DELETE FROM ${table} WHERE game_id = ?`).run(gameId)
    }

    const insertSourceSnapshot = database.prepare(
      `INSERT INTO source_snapshots (
        game_id,
        source_key,
        source_url,
        source_path,
        fetched_at,
        raw_path,
        structured_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const source of bundle.sources) {
      insertSourceSnapshot.run(
        gameId,
        source.source_key,
        source.source_url,
        source.raw_path,
        bundle.fetchedAt,
        source.raw_path,
        source.structured_path,
      )
    }

    const insertEvent = database.prepare(
      `INSERT INTO events (
        game_id,
        event_index,
        sequence,
        inning,
        half,
        inning_label,
        offense_team,
        event_type,
        event_subtype,
        outs,
        bases,
        count_text,
        batter_role_prefix,
        batter_name,
        batter_url,
        batter_raw_text,
        pitcher_name,
        pitcher_url,
        runner_name,
        runner_url,
        result_text,
        result_runs_batted_in,
        result_links_json,
        event_attributes_json,
        raw_row_html,
        runs_scored,
        score_change,
        substitution,
        pitching_change,
        source_url,
        source_text
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`,
    )
    bundle.events.forEach((event, index) => {
      insertEvent.run(
        gameId,
        index,
        event.sequence,
        event.inning ?? 0,
        event.half ?? 'top',
        event.inning ? `${event.inning}回${event.half === 'top' ? '表' : '裏'}` : '',
        extractOffenseTeam(event.event_attributes_json),
        event.event_type,
        event.event_subtype ?? 'other',
        event.outs,
        event.bases,
        null,
        null,
        event.batter_name,
        null,
        null,
        event.pitcher_name,
        null,
        event.runner_name,
        null,
        event.result_text ?? '',
        null,
        '[]',
        event.event_attributes_json,
        event.source_text ?? '',
        event.runs_scored,
        event.score_change,
        event.substitution,
        event.pitching_change,
        event.source_url,
        event.source_text,
      )
    })

    const insertBattingLine = database.prepare(
      `INSERT INTO batting_lines (
        game_id,
        team,
        row_index,
        batting_order,
        position,
        player_name,
        player_url,
        at_bats,
        runs,
        hits,
        runs_batted_in,
        stolen_bases,
        inning_results_json,
        headers_json,
        strikeouts,
        walks,
        hit_by_pitch,
        sacrifice_hits,
        sacrifice_flies,
        errors,
        raw_text,
        source_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    bundle.battingLines.forEach((line, index) => {
      insertBattingLine.run(
        gameId,
        line.team ?? '',
        index,
        line.batting_order,
        line.position ?? '',
        line.player_name ?? '',
        null,
        line.at_bats ?? 0,
        line.runs ?? 0,
        line.hits ?? 0,
        line.rbis ?? 0,
        line.stolen_bases ?? 0,
        '[]',
        '[]',
        line.strikeouts,
        line.walks,
        line.hit_by_pitch,
        line.sacrifice_hits,
        line.sacrifice_flies,
        line.errors,
        line.raw_text,
        line.source_url,
      )
    })

    const insertPitchingLine = database.prepare(
      `INSERT INTO pitching_lines (
        game_id,
        team,
        row_index,
        decision,
        pitcher_name,
        pitcher_url,
        pitch_count,
        batters_faced,
        innings_pitched,
        hits,
        home_runs,
        walks,
        hit_batters,
        strikeouts,
        wild_pitches,
        balks,
        runs,
        earned_runs,
        headers_json,
        sequence,
        pitches,
        hits_allowed,
        home_runs_allowed,
        hit_by_pitch,
        runs_allowed,
        win_loss_save_hold,
        raw_text,
        source_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    bundle.pitchingLines.forEach((line, index) => {
      insertPitchingLine.run(
        gameId,
        line.team ?? '',
        index,
        line.win_loss_save_hold,
        line.pitcher_name ?? '',
        null,
        line.pitches ?? 0,
        line.batters_faced ?? 0,
        line.innings_pitched ?? '',
        line.hits_allowed ?? 0,
        line.home_runs_allowed ?? 0,
        line.walks ?? 0,
        line.hit_by_pitch ?? 0,
        line.strikeouts ?? 0,
        0,
        0,
        line.runs_allowed ?? 0,
        line.earned_runs ?? 0,
        '[]',
        line.sequence,
        line.pitches,
        line.hits_allowed,
        line.home_runs_allowed,
        line.hit_by_pitch,
        line.runs_allowed,
        line.win_loss_save_hold,
        line.raw_text,
        line.source_url,
      )
    })

    const insertRosterEntry = database.prepare(
      `INSERT INTO roster_entries (
        game_id,
        team,
        group_label,
        entry_index,
        number,
        player_name,
        player_url,
        throws,
        bats,
        raw_handedness,
        uniform_number,
        position,
        starter,
        batting_order,
        raw_text,
        source_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    bundle.rosterEntries.forEach((entry, index) => {
      insertRosterEntry.run(
        gameId,
        entry.team ?? '',
        entry.position ?? 'メンバー',
        index,
        entry.uniform_number ?? '',
        entry.player_name ?? '',
        null,
        null,
        null,
        '',
        entry.uniform_number,
        entry.position,
        entry.starter == null ? null : Number(entry.starter),
        entry.batting_order,
        entry.raw_text,
        entry.source_url,
      )
    })

    return {
      gameId,
      insertedEvents: bundle.events.length,
      insertedBattingLines: bundle.battingLines.length,
      insertedPitchingLines: bundle.pitchingLines.length,
      insertedRosterEntries: bundle.rosterEntries.length,
      insertedSourceSnapshots: bundle.sources.length,
    }
  })
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value)
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

function extractOffenseTeam(eventAttributesJson: string | null): string {
  if (!eventAttributesJson) {
    return ''
  }
  try {
    const payload = JSON.parse(eventAttributesJson) as { offense_team?: unknown }
    return typeof payload.offense_team === 'string' ? payload.offense_team : ''
  } catch {
    return ''
  }
}

function insertEvents(
  database: SqliteDatabase,
  gameId: string,
  events: RichGame['play_by_play'],
) {
  const insertEvent = database.prepare(
    `INSERT INTO events (
      game_id,
      event_index,
      sequence,
      inning,
      half,
      inning_label,
      offense_team,
      event_type,
      event_subtype,
      outs,
      bases,
      count_text,
      batter_role_prefix,
      batter_name,
      batter_url,
      batter_raw_text,
      pitcher_name,
      pitcher_url,
      runner_name,
      runner_url,
      result_text,
      result_runs_batted_in,
      result_links_json,
      event_attributes_json,
      raw_row_html
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`,
  )

  for (const event of events) {
    insertEvent.run(
      gameId,
      event.event_index,
      event.event_index,
      event.inning,
      event.half,
      event.inning_label,
      event.offense_team,
      event.event_type,
      event.event_subtype,
      event.outs,
      event.bases,
      event.count,
      event.batter?.role_prefix ?? null,
      event.batter?.player?.name ?? null,
      event.batter?.player?.url ?? null,
      event.batter?.raw_text ?? null,
      event.pitcher?.name ?? null,
      event.pitcher?.url ?? null,
      event.event_attributes?.runner?.name ?? null,
      event.event_attributes?.runner?.url ?? null,
      event.result.text,
      event.result.runs_batted_in,
      stringifyJson(event.result.links),
      stringifyJson(event.event_attributes),
      event.raw_row_html,
    )
  }
}
