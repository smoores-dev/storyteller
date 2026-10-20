CREATE TABLE IF NOT EXISTS progression (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  format TEXT NOT NULL,
  title TEXT,
  modified TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  progression REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid) ON DELETE CASCADE,
  UNIQUE (format, user_id, book_uuid)
);

CREATE TRIGGER IF NOT EXISTS progression_update_trigger AFTER
UPDATE ON progression FOR EACH ROW BEGIN
UPDATE progression
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE IF NOT EXISTS progression_reference (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  progression_uuid TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (progression_uuid) REFERENCES progression (uuid) ON DELETE CASCADE,
  UNIQUE (progression_uuid, kind)
);

CREATE TRIGGER IF NOT EXISTS progression_reference_update_trigger AFTER
UPDATE ON progression_reference FOR EACH ROW BEGIN
UPDATE progression_reference
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_progression_book ON progression (book_uuid);
CREATE INDEX IF NOT EXISTS idx_progression_user_book ON progression (user_id, book_uuid);
