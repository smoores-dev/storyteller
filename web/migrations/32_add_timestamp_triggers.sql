PRAGMA foreign_keys = 0;

CREATE TABLE temp_migration (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO
  temp_migration (id, name, hash)
SELECT
  id,
  name,
  hash
FROM
  migration;

DROP TABLE migration;

ALTER TABLE temp_migration
RENAME TO migration;

CREATE TRIGGER migration_update_trigger AFTER
UPDATE ON migration FOR EACH ROW BEGIN
UPDATE migration
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  id = OLD.id;

END;

CREATE TABLE temp_book (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  title TEXT NOT NULL,
  /* Maintain the old integer ids to avoid breaking changes */
  id INTEGER,
  language TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO
  temp_book (uuid, title, id, language)
SELECT
  uuid,
  title,
  id,
  language
FROM
  book;

DROP TABLE book;

ALTER TABLE temp_book
RENAME TO book;

CREATE TRIGGER book_update_trigger AFTER
UPDATE ON book FOR EACH ROW BEGIN
UPDATE book
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE temp_author (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  id INTEGER,
  name TEXT NOT NULL,
  file_as TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO
  temp_author (uuid, id, name, file_as)
SELECT
  uuid,
  id,
  name,
  file_as
FROM
  author;

DROP TABLE author;

ALTER TABLE temp_author
RENAME TO author;

CREATE TRIGGER author_update_trigger AFTER
UPDATE ON author FOR EACH ROW BEGIN
UPDATE author
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE temp_author_to_book (
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

INSERT INTO
  temp_author_to_book (uuid, id, book_uuid, author_uuid, role)
SELECT
  uuid,
  id,
  book_uuid,
  author_uuid,
  role
FROM
  author_to_book;

DROP TABLE author_to_book;

ALTER TABLE temp_author_to_book
RENAME TO author_to_book;

CREATE TRIGGER author_to_book_update_trigger AFTER
UPDATE ON author_to_book FOR EACH ROW BEGIN
UPDATE author_to_book
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE temp_processing_task (
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

INSERT INTO
  temp_processing_task (uuid, id, type, book_uuid, status, progress)
SELECT
  uuid,
  id,
  type,
  book_uuid,
  status,
  progress
FROM
  processing_task;

DROP TABLE processing_task;

ALTER TABLE temp_processing_task
RENAME TO processing_task;

CREATE TRIGGER processing_task_update_trigger AFTER
UPDATE ON processing_task FOR EACH ROW BEGIN
UPDATE processing_task
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE temp_user_permission (
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
);

INSERT INTO
  temp_user_permission (
    uuid,
    id,
    book_create,
    book_read,
    book_process,
    book_download,
    book_list,
    user_create,
    user_list,
    user_read,
    user_delete,
    settings_update,
    book_delete,
    book_update,
    invite_list,
    invite_delete,
    user_update
  )
SELECT
  uuid,
  id,
  book_create,
  book_read,
  book_process,
  book_download,
  book_list,
  user_create,
  user_list,
  user_read,
  user_delete,
  settings_update,
  book_delete,
  book_update,
  invite_list,
  invite_delete,
  user_update
FROM
  user_permission;

DROP TABLE user_permission;

ALTER TABLE temp_user_permission
RENAME TO user_permission;

CREATE TRIGGER user_permission_update_trigger AFTER
UPDATE ON user_permission FOR EACH ROW BEGIN
UPDATE user_permission
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE temp_invite (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  id INTEGER,
  email TEXT NOT NULL,
  key TEXT NOT NULL,
  user_permission_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_permission_uuid) REFERENCES user_permission (uuid)
);

INSERT INTO
  temp_invite (uuid, id, email, key, user_permission_uuid)
SELECT
  uuid,
  id,
  email,
  key,
  user_permission_uuid
FROM
  invite;

DROP TABLE invite;

ALTER TABLE temp_invite
RENAME TO invite;

CREATE TRIGGER invite_update_trigger AFTER
UPDATE ON invite FOR EACH ROW BEGIN
UPDATE invite
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE temp_user (
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

INSERT INTO
  temp_user (
    uuid,
    id,
    user_permission_uuid,
    username,
    email,
    full_name,
    hashed_password
  )
SELECT
  uuid,
  id,
  user_permission_uuid,
  username,
  email,
  full_name,
  hashed_password
FROM
  user;

DROP TABLE user;

ALTER TABLE temp_user
RENAME TO user;

CREATE TRIGGER user_update_trigger AFTER
UPDATE ON user FOR EACH ROW BEGIN
UPDATE user
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE temp_settings (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  id INTEGER,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO
  temp_settings (uuid, id, name, value)
SELECT
  uuid,
  id,
  name,
  COALESCE(value, 'null')
FROM
  settings;

DROP TABLE settings;

ALTER TABLE temp_settings
RENAME TO settings;

CREATE TRIGGER settings_update_trigger AFTER
UPDATE ON settings FOR EACH ROW BEGIN
UPDATE settings
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

CREATE TABLE temp_token_revokation (
  token TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO
  temp_token_revokation (token)
SELECT
  token
FROM
  token_revokation;

DROP TABLE token_revokation;

ALTER TABLE temp_token_revokation
RENAME TO token_revokation;

CREATE TRIGGER token_revokation_update_trigger AFTER
UPDATE ON token_revokation FOR EACH ROW BEGIN
UPDATE token_revokation
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  token = OLD.token;

END;

CREATE TABLE temp_position (
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

INSERT INTO
  temp_position (uuid, user_uuid, book_uuid, locator, timestamp)
SELECT
  position_uuid,
  user_uuid,
  book_uuid,
  locator,
  timestamp
FROM
  position;

DROP TABLE position;

ALTER TABLE temp_position
RENAME TO position;

CREATE TRIGGER position_update_trigger AFTER
UPDATE ON position FOR EACH ROW BEGIN
UPDATE position
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

PRAGMA foreign_keys = 1;
