ALTER TABLE chat_accounts ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'guest' CHECK (auth_provider IN ('guest', 'google'));
ALTER TABLE chat_accounts ADD COLUMN auth_subject TEXT;
ALTER TABLE chat_accounts ADD COLUMN auth_email_verified INTEGER NOT NULL DEFAULT 0 CHECK (auth_email_verified IN (0, 1));

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_accounts_auth_identity
  ON chat_accounts(auth_provider, auth_subject)
  WHERE auth_subject IS NOT NULL;
