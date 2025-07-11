CREATE TABLE aligned_book (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid TEXT NOT NULL REFERENCES book (uuid),
  filepath TEXT,
  status TEXT NOT NULL DEFAULT 'CREATED',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER aligned_book_update_trigger AFTER
UPDATE ON aligned_book FOR EACH ROW BEGIN
UPDATE aligned_book
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE ebook (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid TEXT NOT NULL REFERENCES book (uuid),
  filepath TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER ebook_update_trigger AFTER
UPDATE ON ebook FOR EACH ROW BEGIN
UPDATE ebook
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE audiobook (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid TEXT NOT NULL REFERENCES book (uuid),
  filepath TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER audiobook_update_trigger AFTER
UPDATE ON audiobook FOR EACH ROW BEGIN
UPDATE audiobook
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

INSERT INTO
  ebook (book_uuid, filepath)
SELECT
  uuid,
  ''
FROM
  book;

INSERT INTO
  audiobook (book_uuid, filepath)
SELECT
  uuid,
  ''
FROM
  book;

INSERT INTO
  aligned_book (book_uuid, ebook_uuid, audiobook_uuid)
SELECT
  book.uuid,
FROM
  book;
