CREATE INDEX IF NOT EXISTS idx_player_profiles_identity_key ON player_profiles (
  LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    COALESCE(canonical_name,full_name),' ',''),char(12288),''),'・',''),'･',''),'.',''),'-',''),'_',''),'﨑','崎'),'髙','高'),'濵','浜'),'*',''),'+',''))
);
