CREATE TABLE IF NOT EXISTS tracking_settings (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tracking_records (
  document_key TEXT PRIMARY KEY,
  first_seen_at BIGINT NOT NULL,
  posted_at BIGINT NOT NULL,
  CHECK (first_seen_at - posted_at = 7200000)
);
