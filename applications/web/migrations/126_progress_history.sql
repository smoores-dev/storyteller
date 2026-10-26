CREATE TABLE IF NOT EXISTS progression_history (
    uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
    user_id TEXT NOT NULL,
    book_uuid TEXT NOT NULL,
    title TEXT,
    source_format TEXT,
    modified TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    progression REAL NOT NULL,
    char_ref TEXT,
    media_ref TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE,
    FOREIGN KEY (book_uuid) REFERENCES book (uuid) ON DELETE CASCADE,
    UNIQUE (book_uuid, user_id, modified)
);

CREATE TRIGGER IF NOT EXISTS progression_history_update_trigger AFTER
UPDATE ON progression_history FOR EACH ROW BEGIN
UPDATE progression_history
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;
END;
