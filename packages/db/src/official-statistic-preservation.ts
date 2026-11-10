import type { SqliteDatabase } from './sqlite'

/** An update's missing historical raw pages never mean archived facts were deleted. */
export function preservePublishedOfficialStatistics(previous: SqliteDatabase, next: SqliteDatabase): void {
  for (const table of ['official_statistic_snapshots', 'official_player_statistics']) {
    if (!previous.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue
    const keys = table === 'official_statistic_snapshots' ? ['snapshot_id'] : ['snapshot_id', 'row_index']
    const find = next.prepare(`SELECT * FROM ${table} WHERE ${keys.map((key) => `${key}=?`).join(' AND ')}`)
    for (const published of previous.prepare(`SELECT * FROM ${table}`).iterate() as Iterable<Record<string, string | number | null>>) {
      const candidate = find.get(...keys.map((key) => published[key])) as typeof published | undefined
      if (!candidate) {
        const columns = Object.keys(published)
        next.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map((key) => published[key]))
        continue
      }
      for (const field of Object.keys(published).filter((field) => !['fetched_at', 'player_id'].includes(field))) {
        if (candidate[field] !== published[field]) throw new Error(`Immutable official statistic conflict: ${table}.${field}`)
      }
      if (table === 'official_statistic_snapshots' && String(candidate.fetched_at) < String(published.fetched_at)) {
        next.prepare('UPDATE official_statistic_snapshots SET fetched_at=? WHERE snapshot_id=?').run(published.fetched_at, published.snapshot_id)
      }
      if (table === 'official_player_statistics' && published.player_id) {
        if (candidate.player_id && candidate.player_id !== published.player_id) throw new Error('Conflicting official statistic identity')
        if (!candidate.player_id) next.prepare('UPDATE official_player_statistics SET player_id=? WHERE snapshot_id=? AND row_index=?').run(published.player_id, published.snapshot_id, published.row_index)
      }
    }
  }
  // A season update may not have fetched historical competition or club pages.
  // Absence in that staging input is not a deletion of published evidence.
  for (const table of ['official_team_history_snapshots', 'official_team_seasons', 'official_series_history_snapshots',
    'official_series_history_observations', 'official_series_results']) {
    if (!previous.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue
    const keys = (previous.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; pk: number }>).filter((column) => column.pk)
      .sort((left, right) => left.pk - right.pk).map((column) => column.name)
    if (!keys.length) throw new Error(`Published archive lacks a stable key: ${table}`)
    const find = next.prepare(`SELECT * FROM ${table} WHERE ${keys.map((key) => `${key}=?`).join(' AND ')}`)
    for (const published of previous.prepare(`SELECT * FROM ${table}`).iterate() as Iterable<Record<string, string | number | null>>) {
      const candidate = find.get(...keys.map((key) => published[key])) as typeof published | undefined
      if (!candidate) {
        const columns = Object.keys(published)
        next.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map((column) => published[column]))
        continue
      }
      const legacyTeamClock = table === 'official_team_history_snapshots'
      for (const field of Object.keys(published)) {
        if (legacyTeamClock && field === 'fetched_at') continue
        if (candidate[field] !== published[field]) throw new Error(`Immutable official history conflict: ${table}.${field}`)
      }
      if (legacyTeamClock && Date.parse(String(candidate.fetched_at)) < Date.parse(String(published.fetched_at))) {
        next.prepare('UPDATE official_team_history_snapshots SET fetched_at=? WHERE snapshot_id=?').run(published.fetched_at, published.snapshot_id)
      }
    }
  }
}
