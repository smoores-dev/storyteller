CREATE TABLE IF NOT EXISTS alignment_decision (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid TEXT NOT NULL REFERENCES book (uuid) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('chapter', 'audio')),
  key TEXT NOT NULL,
  start_seconds REAL,
  end_seconds REAL,
  decision TEXT NOT NULL CHECK (decision IN ('excluded', 'included', 'approved')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alignment_decision_book ON alignment_decision (book_uuid);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alignment_decision_chapter ON alignment_decision (book_uuid, key)
WHERE
  kind = 'chapter';
