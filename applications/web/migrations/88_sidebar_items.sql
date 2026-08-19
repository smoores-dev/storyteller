CREATE TABLE IF NOT EXISTS sidebar_item (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  builtin_key TEXT,
  collection_uuid TEXT REFERENCES collection (uuid) ON DELETE CASCADE,
  shelf_uuid TEXT REFERENCES shelf (uuid) ON DELETE CASCADE,
  position integer NOT NULL,
  hidden integer NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS sidebar_item_update_trigger AFTER
UPDATE ON sidebar_item FOR EACH ROW BEGIN
UPDATE sidebar_item
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_sidebar_item_user ON sidebar_item (user_id);
