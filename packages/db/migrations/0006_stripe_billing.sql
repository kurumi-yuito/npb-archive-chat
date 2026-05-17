CREATE TABLE IF NOT EXISTS chat_accounts_new (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  billing_status TEXT NOT NULL DEFAULT 'active' CHECK (billing_status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused')),
  billing_provider TEXT NOT NULL DEFAULT 'stripe' CHECK (billing_provider IN ('stripe')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  stripe_checkout_session_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO chat_accounts_new (
  user_id,
  email,
  display_name,
  plan,
  billing_status,
  billing_provider,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_price_id,
  stripe_checkout_session_id,
  created_at,
  updated_at
)
SELECT
  user_id,
  email,
  display_name,
  plan,
  billing_status,
  'stripe',
  NULL,
  NULL,
  NULL,
  NULL,
  created_at,
  updated_at
FROM chat_accounts;

DROP TABLE chat_accounts;
ALTER TABLE chat_accounts_new RENAME TO chat_accounts;

CREATE INDEX IF NOT EXISTS idx_chat_accounts_plan ON chat_accounts(plan);
