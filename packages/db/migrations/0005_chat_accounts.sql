CREATE TABLE IF NOT EXISTS chat_accounts (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  billing_status TEXT NOT NULL DEFAULT 'active' CHECK (billing_status IN ('active', 'canceled')),
  billing_provider TEXT NOT NULL DEFAULT 'internal',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_accounts_plan ON chat_accounts(plan);
