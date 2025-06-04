CREATE TABLE temp_position (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  locator TEXT NOT NULL,
  timestamp REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user (id),
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  UNIQUE (user_id, book_uuid)
);

INSERT INTO
  temp_position (
    uuid,
    user_id,
    book_uuid,
    locator,
    timestamp,
    created_at,
    updated_at
  )
SELECT
  uuid,
  user_uuid,
  book_uuid,
  locator,
  timestamp,
  created_at,
  updated_at
FROM
  position;

DROP TABLE position;

ALTER TABLE temp_position
RENAME TO position;

CREATE TRIGGER IF NOT EXISTS position_update_trigger AFTER
UPDATE ON position FOR EACH ROW BEGIN
UPDATE position
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;
