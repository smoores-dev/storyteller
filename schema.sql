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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, publication_date TEXT, aligned_by_storyteller_version TEXT, aligned_at TEXT, aligned_with TEXT, description TEXT, rating REAL, narrator TEXT, status_uuid TEXT REFERENCES status (uuid));
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, collection_create BOOLEAN NOT NULL DEFAULT 0);
CREATE TRIGGER user_permission_update_trigger AFTER
UPDATE ON user_permission FOR EACH ROW BEGIN
UPDATE user_permission
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;
CREATE TABLE IF NOT EXISTS "invite" (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  id INTEGER,
  email TEXT NOT NULL,
  key TEXT NOT NULL,
  user_permission_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_permission_uuid) REFERENCES user_permission (uuid)
);
CREATE TRIGGER invite_update_trigger AFTER
UPDATE ON invite FOR EACH ROW BEGIN
UPDATE invite
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;
CREATE TABLE IF NOT EXISTS "user" (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  id INTEGER,
  user_permission_uuid TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  hashed_password TEXT NOT NULL,
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
CREATE TABLE IF NOT EXISTS "position" (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  locator TEXT NOT NULL,
  timestamp REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_uuid) REFERENCES user (uuid),
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  UNIQUE (user_uuid, book_uuid)
);
CREATE TRIGGER position_update_trigger AFTER
UPDATE ON position FOR EACH ROW BEGIN
UPDATE position
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

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
CREATE TABLE collection_to_user (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_uuid TEXT NOT NULL,
  collection_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (collection_uuid) REFERENCES collection (uuid),
  FOREIGN KEY (user_uuid) REFERENCES user (uuid)
);
CREATE TRIGGER collection_to_user_update_trigger AFTER
UPDATE ON collection_to_user FOR EACH ROW BEGIN
UPDATE collection_to_user
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;
