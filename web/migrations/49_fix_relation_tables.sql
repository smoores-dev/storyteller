ALTER TABLE book_to_collection
RENAME TO temp_book_to_collection;

CREATE TABLE book_to_collection (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  collection_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  FOREIGN KEY (collection_uuid) REFERENCES collection (uuid)
);

INSERT INTO
  book_to_collection
SELECT
  *
FROM
  book_to_collection;

DROP TABLE temp_book_to_collection;

ALTER TABLE book_to_creator
RENAME TO temp_book_to_creator;

CREATE TABLE book_to_creator (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid TEXT NOT NULL,
  creator_uuid TEXT NOT NULL,
  role TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  FOREIGN KEY (creator_uuid) REFERENCES "creator" (uuid)
);

INSERT INTO
  book_to_creator
SELECT
  *
FROM
  book_to_creator;

DROP TABLE temp_book_to_creator;

ALTER TABLE book_to_series
RENAME TO temp_book_to_series;

CREATE TABLE book_to_series (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  series_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  position REAL,
  featured BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (series_uuid) REFERENCES "series" (uuid),
  FOREIGN KEY (book_uuid) REFERENCES book (uuid)
);

INSERT INTO
  book_to_series
SELECT
  *
FROM
  book_to_series;

DROP TABLE temp_book_to_series;

ALTER TABLE book_to_tag
RENAME TO temp_book_to_tag;

CREATE TABLE book_to_tag (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  tag_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  FOREIGN KEY (tag_uuid) REFERENCES "tag" (uuid)
);

INSERT INTO
  book_to_tag
SELECT
  *
FROM
  book_to_tag;

DROP TABLE temp_book_to_tag;
