PRAGMA foreign_keys = 0;

ALTER TABLE creator
RENAME TO temp_creator;

CREATE TABLE creator (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  id INTEGER,
  name TEXT NOT NULL UNIQUE,
  file_as TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO
  creator
SELECT
  *
FROM
  temp_creator;

DROP TABLE temp_creator;

CREATE TRIGGER creator_update_trigger AFTER
UPDATE ON "creator" FOR EACH ROW BEGIN
UPDATE "creator"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

ALTER TABLE tag
RENAME TO temp_tag;

CREATE TABLE tag (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO
  tag
SELECT
  *
FROM
  temp_tag;

DROP TABLE temp_tag;

CREATE TRIGGER tag_update_trigger AFTER
UPDATE ON "tag" FOR EACH ROW BEGIN
UPDATE "tag"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

ALTER TABLE collection
RENAME TO temp_collection;

CREATE TABLE collection (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL UNIQUE,
  public BOOLEAN NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  import_path TEXT DEFAULT NULL
);

INSERT INTO
  collection
SELECT
  *
FROM
  temp_collection;

DROP TABLE temp_collection;

CREATE TRIGGER collection_update_trigger AFTER
UPDATE ON "collection" FOR EACH ROW BEGIN
UPDATE "collection"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

ALTER TABLE series
RENAME TO temp_series;

CREATE TABLE series (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO
  series
SELECT
  *
FROM
  temp_series;

DROP TABLE temp_series;

CREATE TRIGGER series_update_trigger AFTER
UPDATE ON "series" FOR EACH ROW BEGIN
UPDATE "series"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

PRAGMA foreign_keys = 1;
