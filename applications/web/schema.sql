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
  subtitle TEXT,
  "duration" real,
  "page_count" integer,
  asset_dir text NOT NULL DEFAULT '',
  "cover_colors_override" text
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
  collection_create BOOLEAN NOT NULL DEFAULT 0,
  user_password_reset BOOLEAN NOT NULL DEFAULT 0
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  label TEXT
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  icon TEXT,
  color TEXT
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

CREATE TABLE changelog (
  uuid text PRIMARY KEY DEFAULT (uuid ()),
  tag_name text NOT NULL UNIQUE,
  version text NOT NULL,
  component text NOT NULL,
  description text,
  released_at text NOT NULL,
  created_at text NOT NULL DEFAULT (datetime ('now')),
  updated_at text NOT NULL DEFAULT (datetime ('now'))
);

CREATE INDEX idx_changelog_component_released_at ON changelog (component, released_at DESC);

CREATE UNIQUE INDEX idx_settings_name ON settings (name);

CREATE TABLE "collection" (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL UNIQUE,
  public BOOLEAN NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  icon TEXT,
  color TEXT
);

CREATE TRIGGER collection_update_trigger AFTER
UPDATE ON "collection" FOR EACH ROW BEGIN
UPDATE "collection"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE UNIQUE INDEX idx_book_asset_dir ON book (asset_dir);

CREATE TABLE shelf (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  filter TEXT,
  order_by TEXT NOT NULL DEFAULT 'createdAt',
  order_direction TEXT NOT NULL DEFAULT 'desc',
  limit_count INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  icon TEXT,
  color TEXT
);

CREATE TRIGGER shelf_update_trigger AFTER
UPDATE ON shelf FOR EACH ROW BEGIN
UPDATE shelf
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE shelf_book (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  shelf_uuid TEXT NOT NULL REFERENCES shelf (uuid) ON DELETE CASCADE,
  book_uuid TEXT NOT NULL REFERENCES book (uuid) ON DELETE CASCADE,
  position INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER shelf_book_update_trigger AFTER
UPDATE ON shelf_book FOR EACH ROW BEGIN
UPDATE shelf_book
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_shelf_book_shelf ON shelf_book (shelf_uuid);

CREATE INDEX idx_shelf_book_book ON shelf_book (book_uuid);

CREATE TABLE shelf_filter_reference (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  shelf_uuid TEXT NOT NULL REFERENCES shelf (uuid) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER shelf_filter_reference_update_trigger AFTER
UPDATE ON shelf_filter_reference FOR EACH ROW BEGIN
UPDATE shelf_filter_reference
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_shelf_filter_ref_shelf ON shelf_filter_reference (shelf_uuid);

CREATE TABLE "home_section" (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  shelf_uuid TEXT REFERENCES shelf (uuid) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enabled integer NOT NULL DEFAULT 1,
  config text
);

CREATE TRIGGER home_section_update_trigger AFTER
UPDATE ON home_section FOR EACH ROW BEGIN
UPDATE home_section
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_home_section_user ON home_section (user_id);

CREATE TABLE sidebar_item (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  builtin_key TEXT,
  collection_uuid TEXT REFERENCES collection (uuid) ON DELETE CASCADE,
  shelf_uuid TEXT REFERENCES shelf (uuid) ON DELETE CASCADE,
  position integer NOT NULL,
  hidden integer NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  group_uuid TEXT REFERENCES sidebar_group (uuid) ON DELETE CASCADE
);

CREATE TRIGGER sidebar_item_update_trigger AFTER
UPDATE ON sidebar_item FOR EACH ROW BEGIN
UPDATE sidebar_item
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_sidebar_item_user ON sidebar_item (user_id);

CREATE TABLE external_source (
  uuid text PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name text NOT NULL UNIQUE,
  kind text UNIQUE,
  logo text,
  color text,
  url text,
  rating_min real,
  rating_max real,
  rating_icon text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER external_source_update_trigger AFTER
UPDATE ON external_source FOR EACH ROW BEGIN
UPDATE external_source
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE identifier_type (
  uuid text PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name text NOT NULL UNIQUE,
  kind text UNIQUE,
  url_template text,
  external_source_uuid text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (external_source_uuid) REFERENCES external_source (uuid) ON DELETE SET NULL
);

CREATE TRIGGER identifier_type_update_trigger AFTER
UPDATE ON identifier_type FOR EACH ROW BEGIN
UPDATE identifier_type
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE identifier (
  uuid text PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid text NOT NULL,
  identifier_type_uuid text NOT NULL,
  value text NOT NULL,
  ebook_uuid text,
  audiobook_uuid text,
  readaloud_uuid text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid) ON DELETE CASCADE,
  FOREIGN KEY (identifier_type_uuid) REFERENCES identifier_type (uuid) ON DELETE CASCADE,
  FOREIGN KEY (ebook_uuid) REFERENCES ebook (uuid) ON DELETE CASCADE,
  FOREIGN KEY (audiobook_uuid) REFERENCES audiobook (uuid) ON DELETE CASCADE,
  FOREIGN KEY (readaloud_uuid) REFERENCES readaloud (uuid) ON DELETE CASCADE,
  CHECK (
    (ebook_uuid IS NOT NULL) + (audiobook_uuid IS NOT NULL) + (readaloud_uuid IS NOT NULL) <= 1
  )
);

CREATE TRIGGER identifier_update_trigger AFTER
UPDATE ON identifier FOR EACH ROW BEGIN
UPDATE identifier
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE external_data (
  uuid text PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  identifier_uuid text NOT NULL,
  external_source_uuid text NOT NULL,
  rating real NOT NULL,
  fetched_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (identifier_uuid) REFERENCES identifier (uuid) ON DELETE CASCADE,
  FOREIGN KEY (external_source_uuid) REFERENCES external_source (uuid) ON DELETE CASCADE,
  UNIQUE (identifier_uuid, external_source_uuid)
);

CREATE TRIGGER external_data_update_trigger AFTER
UPDATE ON external_data FOR EACH ROW BEGIN
UPDATE external_data
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE sidebar_group (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position integer NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  kind TEXT,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TRIGGER sidebar_group_update_trigger AFTER
UPDATE ON sidebar_group FOR EACH ROW BEGIN
UPDATE sidebar_group
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_sidebar_group_user ON sidebar_group (user_id);

CREATE TABLE book_to_creator (
  uuid text PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid text NOT NULL,
  creator_uuid text NOT NULL,
  role TEXT,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- cascade! for real!
  FOREIGN KEY (book_uuid) REFERENCES book (uuid) ON DELETE CASCADE,
  -- this is more rare, but still possible
  FOREIGN KEY (creator_uuid) REFERENCES "creator" (uuid) ON DELETE CASCADE
);

CREATE TRIGGER book_to_creator_update_trigger AFTER
UPDATE ON book_to_creator FOR EACH ROW BEGIN
UPDATE book_to_creator
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_book_to_creator_book_role ON book_to_creator (book_uuid, ROLE);

CREATE INDEX idx_book_to_creator_creator ON book_to_creator (creator_uuid);

CREATE TABLE import_rule_to_collection (
  import_rule_uuid text NOT NULL REFERENCES import_rule (uuid) ON DELETE CASCADE, -- this was referencing _temp_import_rule instead
  collection_uuid text NOT NULL REFERENCES collection (uuid) ON DELETE CASCADE,
  PRIMARY KEY (import_rule_uuid, collection_uuid)
);

CREATE TABLE job (
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
  finished_at TEXT,
  stats TEXT
);

CREATE TRIGGER job_update_trigger AFTER
UPDATE ON job FOR EACH ROW BEGIN
UPDATE job
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_job_status_position ON job (status, position);

CREATE UNIQUE INDEX idx_sidebar_group_user_kind ON sidebar_group (user_id, kind)
WHERE
  kind IS NOT NULL;

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

CREATE TRIGGER position_update_trigger AFTER
UPDATE ON position FOR EACH ROW BEGIN
UPDATE position
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_position_book ON position(book_uuid);

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

CREATE TRIGGER book_to_status_update_trigger AFTER
UPDATE ON book_to_status FOR EACH ROW BEGIN
UPDATE book_to_status
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_book_to_status_book_user ON book_to_status (book_uuid, user_id);

CREATE INDEX idx_book_to_status_status ON book_to_status (status_uuid);

CREATE INDEX idx_book_to_status_user ON book_to_status (user_id);

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

CREATE TRIGGER account_update_trigger AFTER
UPDATE ON account FOR EACH ROW BEGIN
UPDATE account
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE INDEX idx_account_user ON account (user_id);

CREATE TABLE session (
  id TEXT PRIMARY KEY DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  expires TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
);

CREATE TRIGGER session_update_trigger AFTER
UPDATE ON session FOR EACH ROW BEGIN
UPDATE session
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE INDEX idx_session_user ON session (user_id);

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
  "fingerprint" text,
  cover_image_uuid TEXT REFERENCES image (uuid) ON DELETE SET NULL,
  cover_origin TEXT NOT NULL DEFAULT 'unset',
  cover_extracted_from TEXT
);

CREATE TRIGGER aligned_book_update_trigger AFTER
UPDATE ON "readaloud" FOR EACH ROW BEGIN
UPDATE "readaloud"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_readaloud_book ON readaloud (book_uuid);

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
  "fingerprint" text,
  cover_image_uuid TEXT REFERENCES image (uuid) ON DELETE SET NULL,
  cover_origin TEXT NOT NULL DEFAULT 'unset',
  cover_extracted_from TEXT
);

CREATE TRIGGER ebook_update_trigger AFTER
UPDATE ON ebook FOR EACH ROW BEGIN
UPDATE ebook
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_ebook_book ON ebook (book_uuid);

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
  "fingerprint" text,
  cover_image_uuid TEXT REFERENCES image (uuid) ON DELETE SET NULL,
  cover_origin TEXT NOT NULL DEFAULT 'unset',
  cover_extracted_from TEXT
);

CREATE TRIGGER audiobook_update_trigger AFTER
UPDATE ON audiobook FOR EACH ROW BEGIN
UPDATE audiobook
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_audiobook_book ON audiobook (book_uuid);

CREATE TABLE book_to_collection (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  collection_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid) ON DELETE CASCADE,
  FOREIGN KEY (collection_uuid) REFERENCES collection (uuid) ON DELETE CASCADE
);

CREATE TRIGGER book_to_collection_update_trigger AFTER
UPDATE ON book_to_collection FOR EACH ROW BEGIN
UPDATE book_to_collection
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_book_to_collection_book ON book_to_collection (book_uuid);

CREATE INDEX idx_book_to_collection_collection ON book_to_collection (collection_uuid);

CREATE UNIQUE INDEX idx_book_to_collection_unique ON book_to_collection (book_uuid, collection_uuid);

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

CREATE TRIGGER book_to_series_update_trigger AFTER
UPDATE ON book_to_series FOR EACH ROW BEGIN
UPDATE book_to_series
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_book_to_series_book ON book_to_series (book_uuid);

CREATE INDEX idx_book_to_series_series ON book_to_series (series_uuid);

CREATE UNIQUE INDEX idx_book_to_series_unique ON book_to_series (book_uuid, series_uuid);

CREATE TABLE book_to_tag (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  tag_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid) ON DELETE CASCADE,
  FOREIGN KEY (tag_uuid) REFERENCES "tag" (uuid) ON DELETE CASCADE
);

CREATE TRIGGER book_to_tag_update_trigger AFTER
UPDATE ON book_to_tag FOR EACH ROW BEGIN
UPDATE book_to_tag
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_book_to_tag_book ON book_to_tag (book_uuid);

CREATE INDEX idx_book_to_tag_tag ON book_to_tag (tag_uuid);

CREATE TABLE collection_to_user (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  collection_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (collection_uuid) REFERENCES "collection" (uuid) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
);

CREATE TRIGGER collection_to_user_update_trigger AFTER
UPDATE ON collection_to_user FOR EACH ROW BEGIN
UPDATE collection_to_user
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_collection_to_user_collection ON collection_to_user (collection_uuid);

CREATE INDEX idx_collection_to_user_user ON collection_to_user (user_id);

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

CREATE TRIGGER device_authorization_update_trigger AFTER
UPDATE ON device_authorization FOR EACH ROW BEGIN
UPDATE device_authorization
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE INDEX device_authorization_expires_at_idx ON device_authorization (expires_at);

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

CREATE TRIGGER import_rule_update_trigger AFTER
UPDATE ON "import_rule" FOR EACH ROW BEGIN
UPDATE "import_rule"
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE UNIQUE INDEX idx_import_rule_path ON import_rule (path);

CREATE INDEX idx_import_rule_book_uuid ON import_rule (book_uuid);

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

CREATE TRIGGER user_book_rating_update_trigger AFTER
UPDATE ON user_book_rating FOR EACH ROW BEGIN
UPDATE user_book_rating
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_user_book_rating_book ON user_book_rating (book_uuid);

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

CREATE TRIGGER user_settings_update_trigger AFTER
UPDATE ON user_settings FOR EACH ROW BEGIN
UPDATE user_settings
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TRIGGER changelog_update_trigger AFTER
UPDATE ON changelog FOR EACH ROW BEGIN
UPDATE changelog
SET
  updated_at = datetime ('now')
WHERE
  uuid = OLD.uuid;

END;

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

CREATE INDEX idx_alignment_report_job ON alignment_report (job_uuid);

CREATE INDEX idx_alignment_report_book_created ON alignment_report (book_uuid, created_at DESC);

CREATE INDEX idx_identifier_book ON identifier (book_uuid);

CREATE INDEX idx_job_book_created ON job (book_uuid, created_at DESC);

CREATE INDEX idx_book_created_at ON book (created_at DESC);

CREATE TABLE image (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  sha256 TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  blurhash TEXT,
  colors TEXT,
  source_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER image_update_trigger AFTER
UPDATE ON image FOR EACH ROW BEGIN
UPDATE image
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE INDEX idx_ebook_cover_image ON ebook (cover_image_uuid);

CREATE INDEX idx_audiobook_cover_image ON audiobook (cover_image_uuid);

CREATE INDEX idx_readaloud_cover_image ON readaloud (cover_image_uuid);

CREATE TABLE server_identity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  server_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER server_identity_update_trigger AFTER
UPDATE ON server_identity FOR EACH ROW BEGIN
UPDATE server_identity
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;
