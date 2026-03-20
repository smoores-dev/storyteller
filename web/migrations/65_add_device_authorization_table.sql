CREATE TABLE IF NOT EXISTS device_authorization (
  id TEXT PRIMARY KEY DEFAULT (uuid ()),
  device_code TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by_user_id TEXT,
  interval_seconds INTEGER NOT NULL DEFAULT 5,
  expires_at TEXT NOT NULL,
  last_polled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (approved_by_user_id) REFERENCES user (id)
);

CREATE INDEX IF NOT EXISTS device_authorization_expires_at_idx ON device_authorization (expires_at);

CREATE TRIGGER IF NOT EXISTS device_authorization_update_trigger AFTER
UPDATE ON device_authorization FOR EACH ROW BEGIN
UPDATE device_authorization
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;
