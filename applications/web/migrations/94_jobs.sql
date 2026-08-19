CREATE TABLE IF NOT EXISTS job (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  position INTEGER NOT NULL DEFAULT 0,
  book_uuid TEXT REFERENCES book (uuid) ON DELETE CASCADE,
  restart TEXT,
  config TEXT,
  stage TEXT,
  progress REAL NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT
);

CREATE TRIGGER IF NOT EXISTS job_update_trigger AFTER
UPDATE ON job FOR EACH ROW BEGIN
UPDATE job
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_job_status_position ON job (status, position);

CREATE INDEX IF NOT EXISTS idx_job_book ON job (book_uuid);
