-- sidebar groups: user-created collapsible sections that contain sidebar items
CREATE TABLE IF NOT EXISTS sidebar_group (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position integer NOT NULL,
  collapsed integer NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS sidebar_group_update_trigger AFTER
UPDATE ON sidebar_group FOR EACH ROW BEGIN
UPDATE sidebar_group
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_sidebar_group_user ON sidebar_group (user_id);

-- add group reference to sidebar items
ALTER TABLE sidebar_item
ADD COLUMN group_uuid TEXT REFERENCES sidebar_group (uuid) ON DELETE CASCADE;

-- add icon and color to shelves
ALTER TABLE shelf
ADD COLUMN icon TEXT;

ALTER TABLE shelf
ADD COLUMN color TEXT;

-- add icon and color to collections
ALTER TABLE collection
ADD COLUMN icon TEXT;

ALTER TABLE collection
ADD COLUMN color TEXT;
