PRAGMA foreign_keys = 0;

CREATE TABLE collection_new (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL UNIQUE,
  public BOOLEAN NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  import_paths TEXT DEFAULT NULL
);

INSERT INTO collection_new (uuid, name, public, description, created_at, updated_at, import_paths)
SELECT
  uuid,
  name,
  public,
  description,
  created_at,
  updated_at,
  CASE
    WHEN import_path IS NOT NULL THEN json_array(import_path)
    ELSE NULL
  END
FROM collection;

DROP TABLE collection;

ALTER TABLE collection_new RENAME TO collection;

CREATE TRIGGER collection_update_trigger AFTER
UPDATE ON "collection" FOR EACH ROW BEGIN
UPDATE "collection"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;

PRAGMA foreign_keys = 1;
