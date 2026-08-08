CREATE TABLE IF NOT EXISTS chat_usage_token_buckets (
  bucket_key TEXT PRIMARY KEY,
  tokens INTEGER NOT NULL CHECK (tokens >= 0),
  last_refill_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
