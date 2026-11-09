/** Runtime projection guard. Acquisition/publication separately reparse the
 * original page, including target-year eligibility and registration removals. */
export function officialRegistrationScopeSql(alias = 'roster'): string {
  return `(${(['registered', 'development'] as const).map((kind) => {
    const filename = kind === 'registered' ? 'registered' : 'registereddev'
    const prefix = `'registration:' || ${alias}.year || ':' || ${alias}.team_id || ':${kind}:'`
    return `(${alias}.source_url='https://npb.jp/announcement/' || ${alias}.year || '/${filename}_' || ${alias}.team_id || '.html'
      AND EXISTS(SELECT 1 FROM bis_source_snapshots registration_source WHERE registration_source.source_type='official_registration'
        AND registration_source.year=${alias}.year AND registration_source.team_id=${alias}.team_id
        AND registration_source.source_url=${alias}.source_url AND registration_source.fetched_at=${alias}.loaded_at
        AND registration_source.source_key>=(${prefix}) AND registration_source.source_key<(${prefix}) || char(65535)
        AND length(registration_source.source_key)=length(${prefix})+64
        AND registration_source.raw_path='data/raw/official-registration/' || ${alias}.year || '/' || ${alias}.team_id || '/${kind}/' || substr(registration_source.source_key,-64) || '.html'
        AND substr(${alias}.player_key,1,${`registration:${kind}:`.length + 65})='registration:${kind}:' || substr(registration_source.source_key,-64) || ':'
        AND NOT EXISTS(SELECT 1 FROM bis_source_snapshots newer WHERE newer.source_type=registration_source.source_type
          AND newer.source_url=registration_source.source_url AND newer.fetched_at>registration_source.fetched_at)))`
  }).join(' OR ')})`
}
