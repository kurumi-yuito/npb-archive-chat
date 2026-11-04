import { describe, expect, it } from 'vitest'
import { openDatabase, withTransaction } from './sqlite'
import { migrateDatabase } from './migrations'
import { preservePublishedOfficialStatistics } from './official-statistic-preservation'
import { buildNormalizedDelta } from './normalized-d1-delta'

describe('published official archive preservation', () => {
  it('preserves an earlier season absent from the current update and never clears its identity', () => {
    const previous = openDatabase(); const next = openDatabase()
    try {
      migrateDatabase(previous); migrateDatabase(next)
      previous.prepare(`INSERT INTO official_statistic_snapshots
        (snapshot_id,source_url,target_year,team_id,team_name,level,statistic_kind,fetched_at,content_hash,raw_key,row_count)
        VALUES ('snapshot','https://npb.jp/bis/2025/stats/idb1_s.html',2025,'s','ヤクルト','first','batting','2026-11-04T00:00:00Z','hash','raw',1)`).run()
      previous.prepare(`INSERT INTO official_player_statistics VALUES ('snapshot',1,'verified-id','検証 選手','検証選手','{"本塁打":"12"}')`).run()
      preservePublishedOfficialStatistics(previous, next)
      next.exec("UPDATE official_player_statistics SET player_id=NULL; UPDATE official_statistic_snapshots SET fetched_at='2026-11-03T00:00:00Z'")
      preservePublishedOfficialStatistics(previous, next)
      const delta = buildNormalizedDelta(previous, next, ['official_statistic_snapshots', 'official_player_statistics'])
      expect(delta.changes).toEqual({ official_statistic_snapshots: { inserted: 0, updated: 0, deleted: 0 }, official_player_statistics: { inserted: 0, updated: 0, deleted: 0 } })
      next.exec(`UPDATE official_player_statistics SET metrics_json='{"本塁打":"13"}'`)
      expect(() => withTransaction(next, () => preservePublishedOfficialStatistics(previous, next))).toThrow('Immutable official statistic conflict')
    } finally { previous.close(); next.close() }
  })
})
