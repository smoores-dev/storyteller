CREATE TABLE "migration" (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER migration_update_trigger AFTER
UPDATE ON migration FOR EACH ROW BEGIN
UPDATE migration
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE TABLE "book" (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  title TEXT NOT NULL,
  /* Maintain the old integer ids to avoid breaking changes */
  id INTEGER,
  language TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  publication_date TEXT,
  aligned_by_storyteller_version TEXT,
  aligned_at TEXT,
  aligned_with TEXT,
  description TEXT,
  rating REAL,
  suffix TEXT NOT NULL DEFAULT '',
  subtitle TEXT,
  "duration" real,
  "page_count" integer
);

CREATE TRIGGER book_update_trigger AFTER
UPDATE ON book FOR EACH ROW BEGIN
UPDATE book
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE "user_permission" (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  id INTEGER,
  book_create BOOLEAN NOT NULL DEFAULT 0,
  book_read BOOLEAN NOT NULL DEFAULT 0,
  book_process BOOLEAN NOT NULL DEFAULT 0,
  book_download BOOLEAN NOT NULL DEFAULT 0,
  book_list BOOLEAN NOT NULL DEFAULT 0,
  user_create BOOLEAN NOT NULL DEFAULT 0,
  user_list BOOLEAN NOT NULL DEFAULT 0,
  user_read BOOLEAN NOT NULL DEFAULT 0,
  user_delete BOOLEAN NOT NULL DEFAULT 0,
  settings_update BOOLEAN NOT NULL DEFAULT 0,
  book_delete BOOLEAN NOT NULL DEFAULT 0,
  book_update BOOLEAN NOT NULL DEFAULT 0,
  invite_list BOOLEAN NOT NULL DEFAULT 0,
  invite_delete BOOLEAN NOT NULL DEFAULT 0,
  user_update BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  collection_create BOOLEAN NOT NULL DEFAULT 0
);

CREATE TRIGGER user_permission_update_trigger AFTER
UPDATE ON user_permission FOR EACH ROW BEGIN
UPDATE user_permission
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE "settings" (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  id INTEGER,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER settings_update_trigger AFTER
UPDATE ON settings FOR EACH ROW BEGIN
UPDATE settings
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE "token_revokation" (
  token TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER token_revokation_update_trigger AFTER
UPDATE ON token_revokation FOR EACH ROW BEGIN
UPDATE token_revokation
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  token = OLD.token;

END;

CREATE TABLE status (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER status_update_trigger AFTER
UPDATE ON status FOR EACH ROW BEGIN
UPDATE status
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE "user" (
  id TEXT PRIMARY KEY DEFAULT (uuid ()),
  user_permission_uuid TEXT NOT NULL,
  username TEXT,
  email TEXT NOT NULL UNIQUE,
  invite_key TEXT UNIQUE,
  invite_accepted TEXT,
  name TEXT,
  hashed_password TEXT,
  email_verified TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_permission_uuid) REFERENCES user_permission (uuid) ON DELETE CASCADE
);

CREATE TRIGGER user_update_trigger AFTER
UPDATE ON user FOR EACH ROW BEGIN
UPDATE user
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE TABLE position(
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  locator TEXT NOT NULL,
  timestamp REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  FOREIGN KEY (user_id) REFERENCES user (id),
  UNIQUE (user_id, book_uuid)
);

CREATE TRIGGER position_update_trigger AFTER
UPDATE ON position FOR EACH ROW BEGIN
UPDATE position
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE book_to_status (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid TEXT NOT NULL,
  status_uuid TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  FOREIGN KEY (status_uuid) REFERENCES status (uuid),
  FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TRIGGER book_to_status_update_trigger AFTER
UPDATE ON book_to_status FOR EACH ROW BEGIN
UPDATE book_to_status
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

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
  FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TRIGGER account_update_trigger AFTER
UPDATE ON account FOR EACH ROW BEGIN
UPDATE account
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE TABLE session (
  id TEXT PRIMARY KEY DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  expires TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TRIGGER session_update_trigger AFTER
UPDATE ON session FOR EACH ROW BEGIN
UPDATE session
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE TABLE verification_token (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER verification_token_update_trigger AFTER
UPDATE ON verification_token FOR EACH ROW BEGIN
UPDATE verification_token
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  token = OLD.token;

END;

CREATE TABLE "readaloud" (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid TEXT NOT NULL REFERENCES book (uuid),
  filepath TEXT,
  status TEXT NOT NULL DEFAULT 'CREATED',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  missing INTEGER NOT NULL DEFAULT 0,
  current_stage TEXT,
  stage_progress INTEGER NOT NULL DEFAULT 0,
  queue_position INTEGER,
  restart_pending INTEGER,
  "content_hash" text,
  "manifest" jsonb,
  "page_count" integer,
  "duration" double precision,
  "file_size" integer,
  "cover_blurhash" text,
  is_epub2 BOOLEAN NOT NULL DEFAULT FALSE,
  "cover_colors" text,
  "fingerprint" text
);

CREATE TRIGGER aligned_book_update_trigger AFTER
UPDATE ON "readaloud" FOR EACH ROW BEGIN
UPDATE "readaloud"
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  missing INTEGER NOT NULL DEFAULT 0,
  "content_hash" text,
  "manifest" jsonb,
  "page_count" integer,
  "duration" double precision,
  "file_size" integer,
  cover_blurhash TEXT,
  is_epub2 BOOLEAN NOT NULL DEFAULT FALSE,
  "cover_colors" text,
  "fingerprint" text
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  missing INTEGER NOT NULL DEFAULT 0,
  "content_hash" text,
  "manifest" jsonb,
  "page_count" integer,
  "duration" double precision,
  "file_size" integer,
  cover_blurhash TEXT,
  "cover_colors" text,
  "fingerprint" text
);

CREATE TRIGGER audiobook_update_trigger AFTER
UPDATE ON audiobook FOR EACH ROW BEGIN
UPDATE audiobook
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE creator (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  id INTEGER,
  name TEXT NOT NULL UNIQUE,
  file_as TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER creator_update_trigger AFTER
UPDATE ON "creator" FOR EACH ROW BEGIN
UPDATE "creator"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE tag (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER tag_update_trigger AFTER
UPDATE ON "tag" FOR EACH ROW BEGIN
UPDATE "tag"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE series (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER series_update_trigger AFTER
UPDATE ON "series" FOR EACH ROW BEGIN
UPDATE "series"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE book_to_collection (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  collection_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  FOREIGN KEY (collection_uuid) REFERENCES collection (uuid)
);

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

CREATE TABLE book_to_tag (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  tag_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  FOREIGN KEY (tag_uuid) REFERENCES "tag" (uuid)
);

CREATE TABLE collection_to_user (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  collection_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (collection_uuid) REFERENCES "collection" (uuid),
  FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE INDEX idx_book_to_creator_book_role ON book_to_creator (book_uuid, role);

CREATE INDEX idx_book_to_series_book ON book_to_series (book_uuid);

CREATE INDEX idx_book_to_tag_book ON book_to_tag (book_uuid);

CREATE INDEX idx_book_to_status_book_user ON book_to_status (book_uuid, user_id);

CREATE INDEX idx_ebook_book ON ebook (book_uuid);

CREATE INDEX idx_audiobook_book ON audiobook (book_uuid);

CREATE INDEX idx_readaloud_book ON readaloud (book_uuid);

CREATE TABLE user_reading_preferences (
  uuid text PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id text NOT NULL,
  -- preferences text NOT NULL, -- json blob of ReadingPreferences
  font_size integer,
  font_family text,
  theme text,
  align text,
  spacing text,
  layout text,
  columns integer,
  playback_speed integer,
  line_height integer,
  highlight_color text,
  detail_scope text,
  detail_mode text,
  custom_highlight_color text,
  sync_offset integer,
  created_at text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (user_id) REFERENCES USER (id) ON DELETE CASCADE UNIQUE (user_id)
);

CREATE TABLE user_reading_state (
  uuid text PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id text NOT NULL,
  current_book_id text, -- nullable, foreign key to books
  show_mini_player integer NOT NULL DEFAULT 1, -- boolean
  last_read_at integer, -- nullable timestamp
  created_at integer NOT NULL DEFAULT (unixepoch ()),
  updated_at integer NOT NULL DEFAULT (unixepoch ()),
  FOREIGN KEY (user_id) REFERENCES USER (id) ON DELETE CASCADE,
  FOREIGN KEY (current_book_id) REFERENCES book (uuid) ON DELETE SET NULL UNIQUE (user_id)
);

CREATE INDEX idx_user_reading_preferences_user_id ON user_reading_preferences (user_id);

CREATE INDEX idx_user_reading_state_user_id ON user_reading_state (user_id);

CREATE INDEX idx_user_reading_state_current_book_id ON user_reading_state (current_book_id);

CREATE INDEX idx_user_reading_state_last_read_at ON user_reading_state (last_read_at DESC);

CREATE TABLE annotation (
  uuid text PRIMARY KEY NOT NULL,
  book_uuid text NOT NULL REFERENCES book (uuid) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES USER (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('bookmark', 'highlight', 'note')),
  locator text NOT NULL,
  color text CHECK (
    color IN ('yellow', 'red', 'green', 'blue', 'magenta')
    OR color IS NULL
  ),
  text text,
  note text,
  timestamp integer NOT NULL,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);

CREATE INDEX annotation_book_uuid_idx ON annotation (book_uuid);

CREATE INDEX annotation_user_id_idx ON annotation (user_id);

CREATE INDEX annotation_book_user_idx ON annotation (book_uuid, user_id);

CREATE TRIGGER annotation_update_trigger AFTER
UPDATE ON annotation FOR EACH ROW BEGIN
UPDATE annotation
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE shelf (
  uuid text PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id text NOT NULL,
  name text NOT NULL,
  description text,
  filter TEXT,
  order_by text DEFAULT 'createdAt',
  order_direction text DEFAULT 'desc',
  limit_count integer,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USER (id) ON DELETE CASCADE
);

CREATE INDEX idx_shelf_user ON shelf (user_id);

CREATE TRIGGER shelf_update_trigger AFTER
UPDATE ON shelf FOR EACH ROW BEGIN
UPDATE shelf
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE shelf_book (
  uuid text PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  shelf_uuid text NOT NULL,
  book_uuid text NOT NULL,
  position real,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shelf_uuid) REFERENCES shelf (uuid) ON DELETE CASCADE,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid) ON DELETE CASCADE,
  UNIQUE (shelf_uuid, book_uuid)
);

CREATE INDEX idx_shelf_book_shelf ON shelf_book (shelf_uuid);

CREATE TRIGGER shelf_book_update_trigger AFTER
UPDATE ON shelf_book FOR EACH ROW BEGIN
UPDATE shelf_book
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE home_shelf (
  uuid text PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id text NOT NULL,
  shelf_uuid text,
  shelf_type text NOT NULL,
  position real NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USER (id) ON DELETE CASCADE,
  FOREIGN KEY (shelf_uuid) REFERENCES shelf (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_home_shelf_user ON home_shelf (user_id, position);

CREATE TRIGGER home_shelf_update_trigger AFTER
UPDATE ON home_shelf FOR EACH ROW BEGIN
UPDATE home_shelf
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE shelf_filter_reference (
  uuid text PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  shelf_uuid text NOT NULL,
  entity_type text NOT NULL,
  entity_uuid text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shelf_uuid) REFERENCES shelf (uuid) ON DELETE CASCADE
);

CREATE INDEX idx_shelf_filter_reference_shelf ON shelf_filter_reference (shelf_uuid);

CREATE INDEX idx_shelf_filter_reference_entity ON shelf_filter_reference (entity_type, entity_uuid);

CREATE TRIGGER tag_delete_cleanup_shelf_refs AFTER DELETE ON tag BEGIN
DELETE FROM shelf_filter_reference
WHERE
  entity_type = 'tag'
  AND entity_uuid = OLD.uuid;

END;

CREATE TRIGGER series_delete_cleanup_shelf_refs AFTER DELETE ON series BEGIN
DELETE FROM shelf_filter_reference
WHERE
  entity_type = 'series'
  AND entity_uuid = OLD.uuid;

END;

CREATE TRIGGER status_delete_cleanup_shelf_refs AFTER DELETE ON status BEGIN
DELETE FROM shelf_filter_reference
WHERE
  entity_type = 'status'
  AND entity_uuid = OLD.uuid;

END;

CREATE TRIGGER creator_delete_cleanup_shelf_refs AFTER DELETE ON creator BEGIN
DELETE FROM shelf_filter_reference
WHERE
  entity_type = 'creator'
  AND entity_uuid = OLD.uuid;

END;

CREATE TABLE book_fts_status (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid TEXT NOT NULL UNIQUE REFERENCES book (uuid) ON DELETE CASCADE,
  indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER book_fts_status_update_trigger AFTER
UPDATE ON book_fts_status FOR EACH ROW BEGIN
UPDATE book_fts_status
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_book_fts_status_book ON book_fts_status (book_uuid);

CREATE TABLE ebook_chapters (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  ebook_uuid TEXT NOT NULL REFERENCES ebook (uuid) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  section_id TEXT, -- epub manifest id
  section_href TEXT NOT NULL, -- path within epub, used for Readium navigation
  title TEXT, -- from ToC (null for spine items not in ToC)
  UNIQUE (ebook_uuid, section_href)
);

CREATE INDEX idx_ebook_chapters_ebook ON ebook_chapters (ebook_uuid);

CREATE TABLE readaloud_chapters (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  readaloud_uuid TEXT NOT NULL REFERENCES readaloud (uuid) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  section_href TEXT NOT NULL, -- matches ebook spine href
  title TEXT,
  audio_start_seconds REAL,
  audio_duration_seconds REAL,
  UNIQUE (readaloud_uuid, section_href)
);

CREATE INDEX idx_readaloud_chapters_readaloud ON readaloud_chapters (readaloud_uuid);

CREATE VIRTUAL TABLE book_content_fts USING fts5 (
  book_uuid UNINDEXED,
  section_href UNINDEXED,
  content_index UNINDEXED,
  content,
  tokenize = 'porter unicode61'
)
/* book_content_fts(book_uuid,section_href,content_index,content) */;

CREATE TABLE 'book_content_fts_data' (id INTEGER PRIMARY KEY, block BLOB);

CREATE TABLE 'book_content_fts_idx' (segid, term, pgno, PRIMARY KEY (segid, term)) WITHOUT ROWID;

CREATE TABLE 'book_content_fts_content' (id INTEGER PRIMARY KEY, c0, c1, c2, c3);

CREATE TABLE 'book_content_fts_docsize' (id INTEGER PRIMARY KEY, sz BLOB);

CREATE TABLE 'book_content_fts_config' (k PRIMARY KEY, v) WITHOUT ROWID;

CREATE TABLE "workflow_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at numeric
);

CREATE TABLE `workflow_events` (
  `event_id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `step_id` text,
  `type` text NOT NULL,
  `correlation_id` text,
  `payload` blob,
  `created_at` text NOT NULL
);

CREATE INDEX `idx_events_run` ON `workflow_events` (`run_id`, `event_id`);

CREATE INDEX `idx_events_correlation` ON `workflow_events` (`correlation_id`, `event_id`);

CREATE TABLE `workflow_hooks` (
  `hook_id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `token` text NOT NULL,
  `display_name` text,
  `metadata` blob,
  `owner_id` text NOT NULL,
  `project_id` text NOT NULL,
  `environment` text NOT NULL,
  `received_at` text,
  `disposed_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE INDEX `idx_hooks_run` ON `workflow_hooks` (`run_id`);

CREATE UNIQUE INDEX `idx_hooks_token` ON `workflow_hooks` (`token`);

CREATE TABLE `queue_messages` (
  `message_id` text PRIMARY KEY NOT NULL,
  `queue_name` text NOT NULL,
  `payload` text NOT NULL,
  `idempotency_key` text,
  `status` text DEFAULT 'pending',
  `lock_token` text,
  `attempt` integer DEFAULT 0,
  `max_attempts` integer DEFAULT 3,
  `not_before` text,
  `created_at` text NOT NULL,
  `processed_at` text
);

CREATE INDEX `idx_queue_pending` ON `queue_messages` (`queue_name`, `status`, `not_before`);

CREATE TABLE `workflow_runs` (
  `run_id` text PRIMARY KEY NOT NULL,
  `deployment_id` text NOT NULL,
  `workflow_name` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `input` blob,
  `output` blob,
  `error` blob,
  `execution_context` blob,
  `started_at` text,
  `completed_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE INDEX `idx_runs_status` ON `workflow_runs` (`status`, `run_id`);

CREATE INDEX `idx_runs_workflow` ON `workflow_runs` (`workflow_name`, `run_id`);

CREATE INDEX `idx_runs_deployment` ON `workflow_runs` (`deployment_id`, `run_id`);

CREATE TABLE `workflow_steps` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL,
  `step_id` text NOT NULL,
  `step_name` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `input` blob,
  `output` blob,
  `error` blob,
  `attempt` integer DEFAULT 0,
  `started_at` text,
  `completed_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `retry_after` text
);

CREATE INDEX `idx_steps_run` ON `workflow_steps` (`run_id`, `id`);

CREATE INDEX `idx_steps_step_id` ON `workflow_steps` (`step_id`);

CREATE TABLE `stream_chunks` (
  `chunk_id` text PRIMARY KEY NOT NULL,
  `stream_name` text NOT NULL,
  `data` blob,
  `is_eof` integer DEFAULT 0,
  `created_at` text NOT NULL
);

CREATE INDEX `idx_chunks_stream` ON `stream_chunks` (`stream_name`, `chunk_id`);

CREATE TABLE `workflow_run_versions` (
  `run_id` text PRIMARY KEY NOT NULL,
  `spec_version` integer NOT NULL
);

CREATE TABLE `stream_runs` (
  `run_id` text NOT NULL,
  `stream_name` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`run_id`, `stream_name`)
);

CREATE INDEX `idx_stream_runs_run` ON `stream_runs` (`run_id`);

CREATE TABLE password_reset_token (
  id TEXT PRIMARY KEY DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
);

CREATE INDEX idx_password_reset_token_user_id ON password_reset_token (user_id);

CREATE INDEX idx_password_reset_token_expires_at ON password_reset_token (expires_at);

CREATE UNIQUE INDEX idx_password_reset_token_active_code_hash ON password_reset_token (code_hash)
WHERE
  used_at IS NULL;

CREATE TRIGGER password_reset_token_update_trigger AFTER
UPDATE ON password_reset_token FOR EACH ROW BEGIN
UPDATE password_reset_token
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

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
  FOREIGN KEY (approved_by_user_id) REFERENCES user (id)
);

CREATE INDEX device_authorization_expires_at_idx ON device_authorization (expires_at);

CREATE TRIGGER device_authorization_update_trigger AFTER
UPDATE ON device_authorization FOR EACH ROW BEGIN
UPDATE device_authorization
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE TABLE changelog (
  uuid TEXT PRIMARY KEY DEFAULT (uuid ()),
  tag_name TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL,
  component TEXT NOT NULL,
  description TEXT,
  released_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime ('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime ('now'))
);

CREATE INDEX idx_changelog_component_released_at ON changelog (component, released_at DESC);

CREATE UNIQUE INDEX idx_settings_name ON settings (name);

CREATE TABLE import_rule (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  kind TEXT NOT NULL CHECK (kind IN ('watch', 'ignore')),
  path TEXT NOT NULL,
  import_mode TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_import_rule_path ON import_rule (path);

CREATE TRIGGER import_rule_update_trigger AFTER
UPDATE ON "import_rule" FOR EACH ROW BEGIN
UPDATE "import_rule"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE import_rule_to_collection (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  import_rule_uuid TEXT NOT NULL REFERENCES import_rule (uuid) ON DELETE CASCADE,
  collection_uuid TEXT NOT NULL REFERENCES collection (uuid) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (import_rule_uuid, collection_uuid)
);

CREATE TRIGGER import_rule_to_collection_update_trigger AFTER
UPDATE ON "import_rule_to_collection" FOR EACH ROW BEGIN
UPDATE "import_rule_to_collection"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE "collection" (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL UNIQUE,
  public BOOLEAN NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER collection_update_trigger AFTER
UPDATE ON "collection" FOR EACH ROW BEGIN
UPDATE "collection"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;
