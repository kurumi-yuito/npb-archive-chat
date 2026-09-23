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
    (
      ${factIdColumn} = ?
      AND (
        NOT EXISTS (SELECT 1 FROM player_profiles WHERE player_id = ${factIdColumn})
        OR EXISTS (
          SELECT 1
          FROM player_profiles AS direct_identity_profile
          WHERE direct_identity_profile.player_id = ${factIdColumn}
            AND json_extract(direct_identity_profile.year_teams_json, '$."' || ${factYearColumn} || '"') IS NOT NULL
            AND ${normalizedIdentitySql('COALESCE(direct_identity_profile.canonical_name, direct_identity_profile.full_name)')} LIKE ${factName} || '%'
        )
      )
    )
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
          OR ${canonicalUniqueNamePrefixSql(factName)}
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
        OR ${canonicalUniqueNamePrefixSql(factName)}
      )
  )`
}

/**
 * A permissive indexed prefilter for canonicalPlayerFactMatchSql, not an
 * identity decision. Keep the full match predicate after this condition: year,
 * team, alias validity and ambiguous prefixes still need its exact checks.
 * Bind the canonical id twice. Normalize the dictionary once, rather than
 * evaluating identity subqueries against every historical fact row.
 */
export function canonicalPlayerFactCandidateSql(factIdColumn: string, factNameIdColumn: string): string {
  return `(${factIdColumn} = ? OR ${factNameIdColumn} IN (
    WITH candidate_identity AS MATERIALIZED (
      SELECT player_id, ${normalizedIdentitySql('COALESCE(canonical_name, full_name)')} AS name
      FROM player_profiles WHERE player_id = ?
    ), candidate_dictionary AS MATERIALIZED (
      SELECT name_id, ${normalizedIdentitySql('name')} AS name FROM person_names
    ), candidate_aliases AS MATERIALIZED (
      SELECT ${normalizedIdentitySql('alias')} AS name FROM player_aliases
      WHERE player_id IN (SELECT player_id FROM candidate_identity)
    )
    SELECT name_id FROM candidate_dictionary
    WHERE name IN (SELECT name FROM candidate_aliases)
       OR EXISTS (
         SELECT 1 FROM candidate_identity
         WHERE candidate_identity.name LIKE candidate_dictionary.name || '%'
            OR candidate_dictionary.name LIKE candidate_identity.name || '%'
       )
  ))`
}

function canonicalUniqueNamePrefixSql(factName: string): string {
  const canonicalName = normalizedIdentitySql('COALESCE(identity_profile.canonical_name, identity_profile.full_name)')
  const otherCanonicalName = normalizedIdentitySql('COALESCE(other_identity_profile.canonical_name, other_identity_profile.full_name)')
  return `(
    LENGTH(${factName}) >= 3
    AND (${canonicalName} LIKE ${factName} || '%' OR ${factName} LIKE ${canonicalName} || '%')
    AND NOT EXISTS (
      SELECT 1
      FROM player_profiles AS other_identity_profile
      WHERE other_identity_profile.player_id <> identity_profile.player_id
        AND ${otherCanonicalName} <> ${canonicalName}
        AND (${otherCanonicalName} LIKE ${factName} || '%' OR ${factName} LIKE ${otherCanonicalName} || '%')
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
