-- replacement for the fk_cascade update
-- legacy_alter_table stays on while renaming 
-- necessary bc it would brick v3 dbs if we tried to run the old drop and cascade table
PRAGMA foreign_keys = 0;

PRAGMA legacy_alter_table = 1;

-- position: cascade on book or user delete
ALTER TABLE position
RENAME TO _temp_position;

CREATE TABLE position(
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  locator TEXT NOT NULL,
  timestamp REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE,
  UNIQUE (user_id, book_uuid)
);

INSERT INTO
  position(
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
  user_id,
  book_uuid,
  locator,
  timestamp,
  created_at,
  updated_at
FROM
  _temp_position;

DROP TABLE _temp_position;

CREATE TRIGGER IF NOT EXISTS position_update_trigger AFTER
UPDATE ON position FOR EACH ROW BEGIN
UPDATE position
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_position_book ON position(book_uuid);

-- book_to_status: cascade on book, status, or user delete
ALTER TABLE book_to_status
RENAME TO _temp_book_to_status;

CREATE TABLE book_to_status (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid TEXT NOT NULL,
  status_uuid TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid) ON DELETE CASCADE,
  FOREIGN KEY (status_uuid) REFERENCES status (uuid) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
);

INSERT INTO
  book_to_status (
    uuid,
    book_uuid,
    status_uuid,
    user_id,
    created_at,
    updated_at
  )
SELECT
  uuid,
  book_uuid,
  status_uuid,
  user_id,
  created_at,
  updated_at
FROM
  _temp_book_to_status;

DROP TABLE _temp_book_to_status;

CREATE TRIGGER IF NOT EXISTS book_to_status_update_trigger AFTER
UPDATE ON book_to_status FOR EACH ROW BEGIN
UPDATE book_to_status
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_book_to_status_book_user ON book_to_status (book_uuid, user_id);

CREATE INDEX IF NOT EXISTS idx_book_to_status_status ON book_to_status (status_uuid);

CREATE INDEX IF NOT EXISTS idx_book_to_status_user ON book_to_status (user_id);

-- account: cascade on user delete
ALTER TABLE account
RENAME TO _temp_account;

CREATE TABLE account (
  id TEXT PRIMARY KEY DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
);

INSERT INTO
  account (
    id,
    user_id,
    type,
    provider,
    provider_account_id,
    refresh_token,
    access_token,
    expires_at,
    token_type,
    scope,
    id_token,
    session_state,
    created_at,
    updated_at
  )
SELECT
  id,
  user_id,
  type,
  provider,
  provider_account_id,
  refresh_token,
  access_token,
  expires_at,
  token_type,
  scope,
  id_token,
  session_state,
  created_at,
  updated_at
FROM
  _temp_account;

DROP TABLE _temp_account;

CREATE TRIGGER IF NOT EXISTS account_update_trigger AFTER
UPDATE ON account FOR EACH ROW BEGIN
UPDATE account
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE INDEX IF NOT EXISTS idx_account_user ON account (user_id);

-- session: cascade on user delete
ALTER TABLE session
RENAME TO _temp_session;

CREATE TABLE session (
  id TEXT PRIMARY KEY DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  expires TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
);

INSERT INTO
  session (
    id,
    user_id,
    session_token,
    expires,
    created_at,
    updated_at
  )
SELECT
  id,
  user_id,
  session_token,
  expires,
  created_at,
  updated_at
FROM
  _temp_session;

DROP TABLE _temp_session;

CREATE TRIGGER IF NOT EXISTS session_update_trigger AFTER
UPDATE ON session FOR EACH ROW BEGIN
UPDATE session
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE INDEX IF NOT EXISTS idx_session_user ON session (user_id);

-- readaloud: cascade on book delete. cover_colors and cover_blurhash come from
-- v3's 73_add_cover_colors_blurhash, which has run in every population by now
ALTER TABLE "readaloud"
RENAME TO _temp_readaloud;

CREATE TABLE "readaloud" (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid TEXT NOT NULL REFERENCES book (uuid) ON DELETE CASCADE,
  filepath TEXT,
  status TEXT NOT NULL DEFAULT 'CREATED',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  missing INTEGER NOT NULL DEFAULT 0,
  current_stage TEXT,
  stage_progress INTEGER NOT NULL DEFAULT 0,
  queue_position INTEGER,
  restart_pending INTEGER,
  "cover_colors" text,
  "cover_blurhash" text,
  "manifest" jsonb,
  "page_count" integer,
  is_epub2 BOOLEAN NOT NULL DEFAULT FALSE,
  "duration" real,
  "file_size" integer,
  "fingerprint" text
);

INSERT INTO
  "readaloud" (
    uuid,
    book_uuid,
    filepath,
    status,
    created_at,
    updated_at,
    missing,
    current_stage,
    stage_progress,
    queue_position,
    restart_pending,
    cover_colors,
    cover_blurhash,
    manifest,
    page_count,
    is_epub2,
    duration,
    file_size,
    fingerprint
  )
SELECT
  uuid,
  book_uuid,
  filepath,
  status,
  created_at,
  updated_at,
  missing,
  current_stage,
  stage_progress,
  queue_position,
  restart_pending,
  cover_colors,
  cover_blurhash,
  manifest,
  page_count,
  is_epub2,
  duration,
  file_size,
  fingerprint
FROM
  _temp_readaloud;

DROP TABLE _temp_readaloud;

CREATE TRIGGER IF NOT EXISTS aligned_book_update_trigger AFTER
UPDATE ON "readaloud" FOR EACH ROW BEGIN
UPDATE "readaloud"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_readaloud_book ON readaloud (book_uuid);

-- ebook: cascade on book delete
ALTER TABLE ebook
RENAME TO _temp_ebook;

CREATE TABLE ebook (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid TEXT NOT NULL REFERENCES book (uuid) ON DELETE CASCADE,
  filepath TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  missing INTEGER NOT NULL DEFAULT 0,
  "cover_colors" text,
  "cover_blurhash" text,
  "manifest" jsonb,
  "page_count" integer,
  is_epub2 BOOLEAN NOT NULL DEFAULT FALSE,
  "file_size" integer,
  "fingerprint" text
);

INSERT INTO
  ebook (
    uuid,
    book_uuid,
    filepath,
    created_at,
    updated_at,
    missing,
    cover_colors,
    cover_blurhash,
    manifest,
    page_count,
    is_epub2,
    file_size,
    fingerprint
  )
SELECT
  uuid,
  book_uuid,
  filepath,
  created_at,
  updated_at,
  missing,
  cover_colors,
  cover_blurhash,
  manifest,
  page_count,
  is_epub2,
  file_size,
  fingerprint
FROM
  _temp_ebook;

DROP TABLE _temp_ebook;

CREATE TRIGGER IF NOT EXISTS ebook_update_trigger AFTER
UPDATE ON ebook FOR EACH ROW BEGIN
UPDATE ebook
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_ebook_book ON ebook (book_uuid);

-- audiobook: cascade on book delete. has_vbr_tracks (an abandoned v3
-- experiment no code reads) is intentionally not carried over
ALTER TABLE audiobook
RENAME TO _temp_audiobook;

CREATE TABLE audiobook (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid TEXT NOT NULL REFERENCES book (uuid) ON DELETE CASCADE,
  filepath TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  missing INTEGER NOT NULL DEFAULT 0,
  "cover_colors" text,
  "cover_blurhash" text,
  "manifest" jsonb,
  "duration" real,
  "file_size" integer,
  "fingerprint" text
);

INSERT INTO
  audiobook (
    uuid,
    book_uuid,
    filepath,
    created_at,
    updated_at,
    missing,
    cover_colors,
    cover_blurhash,
    manifest,
    duration,
    file_size,
    fingerprint
  )
SELECT
  uuid,
  book_uuid,
  filepath,
  created_at,
  updated_at,
  missing,
  cover_colors,
  cover_blurhash,
  manifest,
  duration,
  file_size,
  fingerprint
FROM
  _temp_audiobook;

DROP TABLE _temp_audiobook;

CREATE TRIGGER IF NOT EXISTS audiobook_update_trigger AFTER
UPDATE ON audiobook FOR EACH ROW BEGIN
UPDATE audiobook
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_audiobook_book ON audiobook (book_uuid);

-- book_to_collection: cascade on book or collection delete
ALTER TABLE book_to_collection
RENAME TO _temp_book_to_collection;

CREATE TABLE book_to_collection (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  collection_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid) ON DELETE CASCADE,
  FOREIGN KEY (collection_uuid) REFERENCES collection (uuid) ON DELETE CASCADE
);

INSERT INTO
  book_to_collection (
    uuid,
    collection_uuid,
    book_uuid,
    created_at,
    updated_at
  )
SELECT
  uuid,
  collection_uuid,
  book_uuid,
  created_at,
  updated_at
FROM
  _temp_book_to_collection;

DROP TABLE _temp_book_to_collection;

CREATE TRIGGER IF NOT EXISTS book_to_collection_update_trigger AFTER
UPDATE ON book_to_collection FOR EACH ROW BEGIN
UPDATE book_to_collection
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_book_to_collection_book ON book_to_collection (book_uuid);

CREATE INDEX IF NOT EXISTS idx_book_to_collection_collection ON book_to_collection (collection_uuid);

CREATE UNIQUE INDEX IF NOT EXISTS idx_book_to_collection_unique ON book_to_collection (book_uuid, collection_uuid);

-- book_to_series: cascade on book or series delete
ALTER TABLE book_to_series
RENAME TO _temp_book_to_series;

CREATE TABLE book_to_series (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  series_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  position REAL,
  featured BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (series_uuid) REFERENCES "series" (uuid) ON DELETE CASCADE,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid) ON DELETE CASCADE
);

INSERT INTO
  book_to_series (
    uuid,
    series_uuid,
    book_uuid,
    position,
    featured,
    created_at,
    updated_at
  )
SELECT
  uuid,
  series_uuid,
  book_uuid,
  position,
  featured,
  created_at,
  updated_at
FROM
  _temp_book_to_series;

DROP TABLE _temp_book_to_series;

CREATE TRIGGER IF NOT EXISTS book_to_series_update_trigger AFTER
UPDATE ON book_to_series FOR EACH ROW BEGIN
UPDATE book_to_series
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_book_to_series_book ON book_to_series (book_uuid);

CREATE INDEX IF NOT EXISTS idx_book_to_series_series ON book_to_series (series_uuid);

CREATE UNIQUE INDEX IF NOT EXISTS idx_book_to_series_unique ON book_to_series (book_uuid, series_uuid);

-- book_to_tag: cascade on book or tag delete
ALTER TABLE book_to_tag
RENAME TO _temp_book_to_tag;

CREATE TABLE book_to_tag (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  tag_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid) ON DELETE CASCADE,
  FOREIGN KEY (tag_uuid) REFERENCES "tag" (uuid) ON DELETE CASCADE
);

INSERT INTO
  book_to_tag (uuid, tag_uuid, book_uuid, created_at, updated_at)
SELECT
  uuid,
  tag_uuid,
  book_uuid,
  created_at,
  updated_at
FROM
  _temp_book_to_tag;

DROP TABLE _temp_book_to_tag;

CREATE TRIGGER IF NOT EXISTS book_to_tag_update_trigger AFTER
UPDATE ON book_to_tag FOR EACH ROW BEGIN
UPDATE book_to_tag
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_book_to_tag_book ON book_to_tag (book_uuid);

CREATE INDEX IF NOT EXISTS idx_book_to_tag_tag ON book_to_tag (tag_uuid);

-- collection_to_user: cascade on user or collection delete
ALTER TABLE collection_to_user
RENAME TO _temp_collection_to_user;

CREATE TABLE collection_to_user (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  collection_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (collection_uuid) REFERENCES "collection" (uuid) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
);

INSERT INTO
  collection_to_user (
    uuid,
    user_id,
    collection_uuid,
    created_at,
    updated_at
  )
SELECT
  uuid,
  user_id,
  collection_uuid,
  created_at,
  updated_at
FROM
  _temp_collection_to_user;

DROP TABLE _temp_collection_to_user;

CREATE TRIGGER IF NOT EXISTS collection_to_user_update_trigger AFTER
UPDATE ON collection_to_user FOR EACH ROW BEGIN
UPDATE collection_to_user
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_collection_to_user_collection ON collection_to_user (collection_uuid);

CREATE INDEX IF NOT EXISTS idx_collection_to_user_user ON collection_to_user (user_id);

-- device_authorization: set null on user delete (keep the record, detach the user)
ALTER TABLE device_authorization
RENAME TO _temp_device_authorization;

CREATE TABLE device_authorization (
  id TEXT PRIMARY KEY DEFAULT (uuid ()),
  device_code TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by_user_id TEXT,
  interval_seconds INTEGER NOT NULL DEFAULT 5,
  expires_at TEXT NOT NULL,
  last_polled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (approved_by_user_id) REFERENCES user (id) ON DELETE SET NULL
);

INSERT INTO
  device_authorization (
    id,
    device_code,
    user_code,
    status,
    approved_by_user_id,
    interval_seconds,
    expires_at,
    last_polled_at,
    created_at,
    updated_at
  )
SELECT
  id,
  device_code,
  user_code,
  status,
  approved_by_user_id,
  interval_seconds,
  expires_at,
  last_polled_at,
  created_at,
  updated_at
FROM
  _temp_device_authorization;

DROP TABLE _temp_device_authorization;

CREATE TRIGGER IF NOT EXISTS device_authorization_update_trigger AFTER
UPDATE ON device_authorization FOR EACH ROW BEGIN
UPDATE device_authorization
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE INDEX IF NOT EXISTS device_authorization_expires_at_idx ON device_authorization (expires_at);

-- import_rule: set null on book delete (rules survive, just detached from the
-- book). v3 databases had ON DELETE CASCADE here from before v2's 88 changed
-- the semantics; main's is the model going forward.
-- epub2_import_strategy exists everywhere by now (80 for v2/fresh, 105 for v3)
ALTER TABLE import_rule
RENAME TO _temp_import_rule;

CREATE TABLE import_rule (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  kind TEXT NOT NULL CHECK (kind IN ('watch', 'ignore')),
  path TEXT NOT NULL,
  import_mode TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source text NOT NULL DEFAULT 'user' CHECK (
    source IN (
      'user',
      'import-relocate',
      'import-backup',
      'prevent-reimport'
    )
  ),
  book_uuid text DEFAULT NULL REFERENCES book (uuid) ON DELETE SET NULL,
  epub2_import_strategy TEXT DEFAULT NULL
);

INSERT INTO
  import_rule (
    uuid,
    kind,
    path,
    import_mode,
    created_at,
    updated_at,
    source,
    book_uuid,
    epub2_import_strategy
  )
SELECT
  uuid,
  kind,
  path,
  import_mode,
  created_at,
  updated_at,
  source,
  book_uuid,
  epub2_import_strategy
FROM
  _temp_import_rule;

DROP TABLE _temp_import_rule;

CREATE TRIGGER IF NOT EXISTS import_rule_update_trigger AFTER
UPDATE ON "import_rule" FOR EACH ROW BEGIN
UPDATE "import_rule"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_import_rule_path ON import_rule (path);

CREATE INDEX IF NOT EXISTS idx_import_rule_book_uuid ON import_rule (book_uuid);

-- user_book_rating: cascade on user or book delete. dimensions comes from
-- v3's 90_multidimensional_ratings, which has run in every population by now
ALTER TABLE user_book_rating
RENAME TO _temp_user_book_rating;

CREATE TABLE user_book_rating (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  rating REAL,
  review TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dimensions TEXT,
  FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid) ON DELETE CASCADE,
  UNIQUE (user_id, book_uuid),
  CHECK (
    rating IS NOT NULL
    OR review IS NOT NULL
  )
);

INSERT INTO
  user_book_rating (
    uuid,
    user_id,
    book_uuid,
    rating,
    review,
    created_at,
    updated_at,
    dimensions
  )
SELECT
  uuid,
  user_id,
  book_uuid,
  rating,
  review,
  created_at,
  updated_at,
  dimensions
FROM
  _temp_user_book_rating;

DROP TABLE _temp_user_book_rating;

CREATE TRIGGER IF NOT EXISTS user_book_rating_update_trigger AFTER
UPDATE ON user_book_rating FOR EACH ROW BEGIN
UPDATE user_book_rating
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX IF NOT EXISTS idx_user_book_rating_book ON user_book_rating (book_uuid);

-- user_settings: cascade on user delete
ALTER TABLE user_settings
RENAME TO _temp_user_settings;

CREATE TABLE user_settings (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE,
  UNIQUE (user_id, name)
);

INSERT INTO
  user_settings (
    uuid,
    user_id,
    name,
    value,
    created_at,
    updated_at
  )
SELECT
  uuid,
  user_id,
  name,
  value,
  created_at,
  updated_at
FROM
  _temp_user_settings;

DROP TABLE _temp_user_settings;

CREATE TRIGGER IF NOT EXISTS user_settings_update_trigger AFTER
UPDATE ON user_settings FOR EACH ROW BEGIN
UPDATE user_settings
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

-- alignment_report: cascade on book delete
ALTER TABLE alignment_report
RENAME TO _temp_alignment_report;

CREATE TABLE alignment_report (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  job_uuid TEXT REFERENCES job (uuid) ON DELETE SET NULL,
  book_uuid TEXT REFERENCES book (uuid) ON DELETE CASCADE,
  report TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_alignment_report_job ON alignment_report (job_uuid);

CREATE INDEX IF NOT EXISTS idx_alignment_report_book ON alignment_report (book_uuid);

-- update triggers 88 added for tables that are not rebuilt here, so v3
-- databases (which never ran 88) get them too
CREATE TRIGGER IF NOT EXISTS book_to_creator_update_trigger AFTER
UPDATE ON book_to_creator FOR EACH ROW BEGIN
UPDATE book_to_creator
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TRIGGER IF NOT EXISTS changelog_update_trigger AFTER
UPDATE ON changelog FOR EACH ROW BEGIN
UPDATE changelog
SET
  updated_at = datetime ('now')
WHERE
  uuid = OLD.uuid;

END;

PRAGMA legacy_alter_table = 0;

PRAGMA foreign_keys = 1;
