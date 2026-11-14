CREATE TABLE IF NOT EXISTS api_token (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_start TEXT NOT NULL,
  scope TEXT,
  last_used_at TEXT,
  expires_at TEXT,
  idle_timeout_days INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS api_token_update_trigger AFTER
UPDATE ON api_token FOR EACH ROW BEGIN
UPDATE api_token
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_api_token_user ON api_token (user_id);
