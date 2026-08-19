CREATE TABLE IF NOT EXISTS server_identity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  server_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS server_identity_update_trigger AFTER
UPDATE ON server_identity FOR EACH ROW BEGIN
UPDATE server_identity
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

INSERT INTO
  settings (name, value)
VALUES
  ('serverIconSha256', 'null') ON CONFLICT (name) DO NOTHING;
