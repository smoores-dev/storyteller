CREATE TABLE IF NOT EXISTS "migration" (
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

CREATE TABLE IF NOT EXISTS "book" (
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
  narrator TEXT,
  status_uuid TEXT REFERENCES status (uuid),
  suffix TEXT NOT NULL DEFAULT ''
);

CREATE TRIGGER book_update_trigger AFTER
UPDATE ON book FOR EACH ROW BEGIN
UPDATE book
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE IF NOT EXISTS "author" (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  id INTEGER,
  name TEXT NOT NULL,
  file_as TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER author_update_trigger AFTER
UPDATE ON author FOR EACH ROW BEGIN
UPDATE author
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE IF NOT EXISTS "author_to_book" (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  id INTEGER,
  book_uuid TEXT NOT NULL,
  author_uuid TEXT NOT NULL,
  role TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  FOREIGN KEY (author_uuid) REFERENCES author (uuid)
);

CREATE TRIGGER author_to_book_update_trigger AFTER
UPDATE ON author_to_book FOR EACH ROW BEGIN
UPDATE author_to_book
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE IF NOT EXISTS "processing_task" (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  id INTEGER,
  type TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid)
);

CREATE TRIGGER processing_task_update_trigger AFTER
UPDATE ON processing_task FOR EACH ROW BEGIN
UPDATE processing_task
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE IF NOT EXISTS "user_permission" (
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

CREATE TABLE IF NOT EXISTS "settings" (
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

CREATE TABLE IF NOT EXISTS "token_revokation" (
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

CREATE TABLE series (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER series_update_trigger AFTER
UPDATE ON series FOR EACH ROW BEGIN
UPDATE series
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE book_to_series (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  series_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  position REAL,
  featured BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (series_uuid) REFERENCES series (uuid),
  FOREIGN KEY (book_uuid) REFERENCES book (uuid)
);

CREATE TRIGGER book_to_series_update_trigger AFTER
UPDATE ON book_to_series FOR EACH ROW BEGIN
UPDATE book_to_series
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

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

CREATE TABLE tag (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER tag_update_trigger AFTER
UPDATE ON tag FOR EACH ROW BEGIN
UPDATE tag
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE book_to_tag (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  tag_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  FOREIGN KEY (tag_uuid) REFERENCES tag (uuid)
);

CREATE TRIGGER book_to_tag_update_trigger AFTER
UPDATE ON book_to_tag FOR EACH ROW BEGIN
UPDATE book_to_tag
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE collection (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  name TEXT NOT NULL,
  public BOOLEAN NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER collection_update_trigger AFTER
UPDATE ON collection FOR EACH ROW BEGIN
UPDATE collection
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

CREATE TRIGGER book_to_collection_update_trigger AFTER
UPDATE ON book_to_collection FOR EACH ROW BEGIN
UPDATE book_to_collection
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

CREATE TABLE session (
  id TEXT PRIMARY KEY DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  expires TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TABLE verification_token (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER account_update_trigger AFTER
UPDATE ON account FOR EACH ROW BEGIN
UPDATE account
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE TRIGGER session_update_trigger AFTER
UPDATE ON session FOR EACH ROW BEGIN
UPDATE session
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE TRIGGER verification_token_update_trigger AFTER
UPDATE ON verification_token FOR EACH ROW BEGIN
UPDATE verification_token
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  token = OLD.token;

END;

CREATE TABLE IF NOT EXISTS "user" (
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
  FOREIGN KEY (user_permission_uuid) REFERENCES user_permission (uuid)
);

CREATE TRIGGER user_update_trigger AFTER
UPDATE ON user FOR EACH ROW BEGIN
UPDATE user
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE TABLE collection_to_user (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  collection_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (collection_uuid) REFERENCES collection (uuid),
  FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TRIGGER collection_to_user_update_trigger AFTER
UPDATE ON collection_to_user FOR EACH ROW BEGIN
UPDATE collection_to_user
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE IF NOT EXISTS "position" (
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

CREATE TRIGGER position_update_trigger AFTER
UPDATE ON position FOR EACH ROW BEGIN
UPDATE position
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

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
