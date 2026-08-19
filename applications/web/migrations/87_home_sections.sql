ALTER TABLE home_shelf RENAME TO home_section;

ALTER TABLE home_section RENAME COLUMN shelf_type TO kind;

ALTER TABLE home_section
  ADD COLUMN enabled integer NOT NULL DEFAULT 1;

ALTER TABLE home_section
  ADD COLUMN config text;

DROP TRIGGER IF EXISTS home_shelf_update_trigger;

CREATE TRIGGER IF NOT EXISTS home_section_update_trigger
  AFTER UPDATE ON home_section
  FOR EACH ROW
BEGIN
  UPDATE home_section SET updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

DROP INDEX IF EXISTS idx_home_shelf_user;

CREATE INDEX IF NOT EXISTS idx_home_section_user ON home_section(user_id);

-- dont insert if already there
INSERT INTO home_section(user_id, shelf_uuid, kind, position, enabled)
SELECT DISTINCT
  user_id,
  NULL,
  'hero',
  -2,
  1
FROM
  home_section
WHERE
  user_id NOT IN (
    SELECT
      user_id
    FROM
      home_section
    WHERE
      kind = 'hero');

INSERT INTO home_section(user_id, shelf_uuid, kind, position, enabled)
SELECT DISTINCT
  user_id,
  NULL,
  'stats',
  -1,
  1
FROM
  home_section
WHERE
  user_id NOT IN (
    SELECT
      user_id
    FROM
      home_section
    WHERE
      kind = 'stats');

