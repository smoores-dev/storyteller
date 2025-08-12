CREATE TEMP TABLE temp_book_to_creator AS
SELECT
  *
FROM
  author_to_book;

DROP TABLE author_to_book;

ALTER TABLE author
RENAME TO creator;

CREATE TABLE book_to_creator (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid TEXT NOT NULL,
  creator_uuid TEXT NOT NULL,
  role TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  FOREIGN KEY (creator_uuid) REFERENCES creator (uuid)
);

CREATE TRIGGER book_to_creator_update_trigger AFTER
UPDATE ON book_to_creator FOR EACH ROW BEGIN
UPDATE book_to_creator
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

INSERT INTO
  book_to_creator (
    uuid,
    book_uuid,
    creator_uuid,
    role,
    created_at,
    updated_at
  )
SELECT
  uuid,
  book_uuid,
  author_uuid AS creator_uuid,
  role,
  created_at,
  updated_at
FROM
  temp_book_to_creator;

UPDATE book_to_creator
SET
  role = 'aut'
WHERE
  role = 'Author'
  OR role = ''
  OR role IS NULL;

INSERT INTO
  creator (uuid, id, name, file_as, created_at, updated_at)
SELECT
  uuid,
  NULL,
  name,
  name,
  created_at,
  updated_at
FROM
  narrator;

INSERT INTO
  book_to_creator (uuid, book_uuid, creator_uuid, role)
SELECT
  uuid,
  book_uuid,
  narrator_uuid,
  'nrt'
FROM
  book_to_narrator;

DROP TABLE book_to_narrator;

DROP TABLE narrator;

DROP TABLE temp_book_to_creator;
