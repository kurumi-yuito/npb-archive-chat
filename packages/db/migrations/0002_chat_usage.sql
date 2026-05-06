-- AI チャットの月次利用回数（/api/chat のみ）。通常の search API とは無関係。
CREATE TABLE IF NOT EXISTS chat_usage_monthly (
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  chat_count INTEGER NOT NULL DEFAULT 0 CHECK (chat_count >= 0),
  PRIMARY KEY (user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_chat_usage_month ON chat_usage_monthly(month);
