ALTER TABLE book
ADD COLUMN publication_date TEXT;

DROP TABLE IF EXISTS series;

CREATE TABLE series (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS series_update_trigger AFTER
UPDATE ON series FOR EACH ROW BEGIN
UPDATE series
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

DROP TABLE IF EXISTS book_to_series;

CREATE TABLE book_to_series (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  series_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  position REAL,
  featured BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (series_uuid) REFERENCES series (uuid),
  FOREIGN KEY (book_uuid) REFERENCES book (uuid)
);

CREATE TRIGGER IF NOT EXISTS book_to_series_update_trigger AFTER
UPDATE ON book_to_series FOR EACH ROW BEGIN
UPDATE book_to_series
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

ALTER TABLE book
ADD COLUMN aligned_by_storyteller_version TEXT;

ALTER TABLE book
ADD COLUMN aligned_at TEXT;

ALTER TABLE book
ADD COLUMN aligned_with TEXT;

ALTER TABLE book
ADD COLUMN description TEXT;

ALTER TABLE book
ADD COLUMN rating REAL;

ALTER TABLE book
ADD COLUMN narrator TEXT;

DROP TABLE IF EXISTS status;

CREATE TABLE status (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DELETE FROM status;

INSERT INTO
  status (name, is_default)
VALUES
  ('To read', 1);

INSERT INTO
  status (name, is_default)
VALUES
  ('Reading', 0);

INSERT INTO
  status (name, is_default)
VALUES
  ('Read', 0);

CREATE TRIGGER IF NOT EXISTS status_update_trigger AFTER
UPDATE ON status FOR EACH ROW BEGIN
UPDATE status
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

ALTER TABLE book
ADD COLUMN status_uuid TEXT REFERENCES status (uuid);

UPDATE book
SET
  status_uuid = (
    SELECT
      uuid
    FROM
      status
    WHERE
      is_default = 1
  );

DROP TABLE IF EXISTS tag;

CREATE TABLE tag (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS tag_update_trigger AFTER
UPDATE ON tag FOR EACH ROW BEGIN
UPDATE tag
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

DROP TABLE IF EXISTS book_to_tag;

CREATE TABLE book_to_tag (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  tag_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  FOREIGN KEY (tag_uuid) REFERENCES tag (uuid)
);

CREATE TRIGGER IF NOT EXISTS book_to_tag_update_trigger AFTER
UPDATE ON book_to_tag FOR EACH ROW BEGIN
UPDATE book_to_tag
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

DROP TABLE IF EXISTS collection;

CREATE TABLE collection (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL,
  public BOOLEAN NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS collection_update_trigger AFTER
UPDATE ON collection FOR EACH ROW BEGIN
UPDATE collection
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

DROP TABLE IF EXISTS book_to_collection;

CREATE TABLE book_to_collection (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  collection_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  FOREIGN KEY (collection_uuid) REFERENCES collection (uuid)
);

CREATE TRIGGER IF NOT EXISTS book_to_collection_update_trigger AFTER
UPDATE ON book_to_collection FOR EACH ROW BEGIN
UPDATE book_to_collection
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

DROP TABLE IF EXISTS collection_to_user;

CREATE TABLE collection_to_user (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_uuid TEXT NOT NULL,
  collection_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (collection_uuid) REFERENCES collection (uuid),
  FOREIGN KEY (user_uuid) REFERENCES user (uuid)
);

CREATE TRIGGER IF NOT EXISTS collection_to_user_update_trigger AFTER
UPDATE ON collection_to_user FOR EACH ROW BEGIN
UPDATE collection_to_user
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;
