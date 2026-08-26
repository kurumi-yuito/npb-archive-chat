/**
 * Match a canonical player id to facts whose source id is absent or differs.
 * The bridge is entirely data-derived: player_profiles is the canonical node and
 * player_aliases supplies source names and season bounds produced by ingestion.
 */
export function canonicalPlayerFactMatchSql(
  factIdColumn: string,
  factNameColumn: string,
  factYearColumn: string,
  factTeamColumn: string,
): string {
  const factName = normalizedIdentitySql(factNameColumn)
  return `(
    (${factIdColumn} = ? AND NOT EXISTS (SELECT 1 FROM player_profiles WHERE player_id = ?))
    OR EXISTS (
      SELECT 1
      FROM player_profiles AS identity_profile
      LEFT JOIN player_aliases AS identity_alias
        ON identity_alias.player_id = identity_profile.player_id
       AND (identity_alias.season_from = 0 OR identity_alias.season_from <= ${factYearColumn})
       AND (identity_alias.season_to = 0 OR identity_alias.season_to >= ${factYearColumn})
      WHERE identity_profile.player_id = ?
        AND (
          ${factName} = ${normalizedIdentitySql('COALESCE(identity_profile.canonical_name, identity_profile.full_name)')}
          OR ${factName} = ${normalizedIdentitySql('identity_alias.alias')}
          OR ${canonicalSurnameWithSeasonTeamSql(factName, factYearColumn, factTeamColumn)}
        )
    )
  )`
}

export function canonicalPlayerNameMatchSql(factNameColumn: string, factYearColumn: string, factTeamColumn: string): string {
  const factName = normalizedIdentitySql(factNameColumn)
  return `EXISTS (
    SELECT 1
    FROM player_profiles AS identity_profile
    LEFT JOIN player_aliases AS identity_alias
      ON identity_alias.player_id = identity_profile.player_id
     AND (identity_alias.season_from = 0 OR identity_alias.season_from <= ${factYearColumn})
     AND (identity_alias.season_to = 0 OR identity_alias.season_to >= ${factYearColumn})
    WHERE identity_profile.player_id = ?
      AND (
        ${factName} = ${normalizedIdentitySql('COALESCE(identity_profile.canonical_name, identity_profile.full_name)')}
        OR ${factName} = ${normalizedIdentitySql('identity_alias.alias')}
        OR ${canonicalSurnameWithSeasonTeamSql(factName, factYearColumn, factTeamColumn)}
      )
  )`
}

function canonicalSurnameWithSeasonTeamSql(factName: string, factYearColumn: string, factTeamColumn: string): string {
  const canonicalName = normalizedIdentitySql('COALESCE(identity_profile.canonical_name, identity_profile.full_name)')
  const factTeam = normalizedIdentitySql(factTeamColumn)
  const profileTeam = normalizedIdentitySql(`COALESCE(json_extract(identity_profile.year_teams_json, '$."' || ${factYearColumn} || '"'), '')`)
  return `(
    LENGTH(${factName}) >= 1
    AND ${canonicalName} LIKE ${factName} || '%'
    AND ${profileTeam} <> ''
    AND (${profileTeam} LIKE '%' || ${factTeam} || '%' OR ${factTeam} LIKE '%' || ${profileTeam} || '%')
  )`
}

function normalizedIdentitySql(column: string): string {
  return `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${column}, ''), ' ', ''), char(12288), ''), '*', ''), '＊', ''), '+', ''), '＋', ''), '﨑', '崎'), '髙', '高'), '濵', '浜'))`
}
