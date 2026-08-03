PRAGMA foreign_keys = 0;

PRAGMA legacy_alter_table = 1;

-- report becomes nullable so superseded reports can drop their json reports while keeping the summary columns
-- otherwise every time you realign a book youre stuck with that big-ass alignment report we aren't even showing you
ALTER TABLE alignment_report
RENAME TO _temp_alignment_report;

CREATE TABLE alignment_report (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  job_uuid TEXT REFERENCES job (uuid) ON DELETE SET NULL,
  book_uuid TEXT REFERENCES book (uuid) ON DELETE CASCADE,
  report TEXT,
  grade TEXT,
  score REAL,
  chapters INTEGER,
  missing_sentences INTEGER,
  muted_chapters INTEGER,
  failed_chapters INTEGER,
  unaligned_audio INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  overrides TEXT
);

INSERT INTO
  alignment_report (
    uuid,
    job_uuid,
    book_uuid,
    report,
    grade,
    score,
    chapters,
    missing_sentences,
    muted_chapters,
    failed_chapters,
    unaligned_audio,
    created_at,
    overrides
  )
SELECT
  uuid,
  job_uuid,
  book_uuid,
  report,
  grade,
  score,
  chapters,
  missing_sentences,
  muted_chapters,
  failed_chapters,
  unaligned_audio,
  created_at,
  overrides
FROM
  _temp_alignment_report;

DROP TABLE _temp_alignment_report;

-- superseded per-book reports keep only their summary
UPDATE alignment_report
SET
  report = NULL
WHERE
  book_uuid IS NOT NULL
  AND uuid NOT IN (
    SELECT
      uuid
    FROM
      (
        SELECT
          uuid,
          row_number() OVER (
            PARTITION BY
              book_uuid
            ORDER BY
              created_at DESC
          ) AS rn
        FROM
          alignment_report
      )
    WHERE
      rn = 1
  );

CREATE INDEX IF NOT EXISTS idx_alignment_report_job ON alignment_report (job_uuid);

-- (book_uuid, created_at) so the latest-report-per-book lookup needs no sort
CREATE INDEX IF NOT EXISTS idx_alignment_report_book_created ON alignment_report (book_uuid, created_at DESC);

-- the per-book identifier subqueries in the books query were full table scans
CREATE INDEX IF NOT EXISTS idx_identifier_book ON identifier (book_uuid);

-- the active-job subquery sorts by created_at within a book
DROP INDEX IF EXISTS idx_job_book;

CREATE INDEX IF NOT EXISTS idx_job_book_created ON job (book_uuid, created_at DESC);

-- default library sort
CREATE INDEX IF NOT EXISTS idx_book_created_at ON book (created_at DESC);

PRAGMA legacy_alter_table = 0;

PRAGMA foreign_keys = 1;
