/* BOOK */

CREATE TABLE IF NOT EXISTS book_with_uuid(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
  id INTEGER, /* Maintain the old integer ids to avoid breaking changes */
  title TEXT NOT NULL,
  epub_filename TEXT,
  audio_filename TEXT,
  audio_filetype TEXT NOT NULL DEFAULT 'mp4'
);

INSERT INTO book_with_uuid
(
  id,
  title,
  epub_filename,
  audio_filename,
  audio_filetype
)
SELECT
  id,
  title,
  epub_filename,
  audio_filename,
  audio_filetype
FROM book;

DROP TABLE book;

ALTER TABLE book_with_uuid RENAME TO book;

/* AUTHOR */

CREATE TABLE IF NOT EXISTS author_with_uuid(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
  id INTEGER,
  name TEXT NOT NULL,
  file_as TEXT NOT NULL
);

INSERT INTO author_with_uuid
(
  id,
  name,
  file_as
)
SELECT
  id,
  name,
  file_as
FROM author;

DROP TABLE author;

ALTER TABLE author_with_uuid RENAME TO author;

/* AUTHOR_TO_BOOK */

CREATE TABLE IF NOT EXISTS author_to_book_with_uuid(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
  id INTEGER,
  book_uuid TEXT,
  author_uuid TEXT,
  role TEXT,
  FOREIGN KEY(book_uuid) REFERENCES book(uuid)
  FOREIGN KEY(author_uuid) REFERENCES author(uuid)
);

INSERT INTO author_to_book_with_uuid
(
  id,
  book_uuid,
  author_uuid,
  role
)
SELECT
  author_to_book.id as id,
  book.uuid as book_uuid,
  author.uuid as author_uuid,
  author_to_book.role as role
FROM author_to_book
JOIN book
  ON author_to_book.book_id = book.id
JOIN author
  ON author_to_book.author_id = author.id;

DROP TABLE author_to_book;

ALTER TABLE author_to_book_with_uuid RENAME TO author_to_book;

/* PROCESSING_TASK */

CREATE TABLE IF NOT EXISTS processing_task_with_uuid(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
  id INTEGER,
  type TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(book_uuid) REFERENCES book(uuid)
);

INSERT INTO processing_task_with_uuid
(
  id,
  type,
  book_uuid,
  status,
  progress
)
SELECT
  processing_task.id as id,
  processing_task.type as type,
  book.uuid as book_uuid,
  processing_task.status as status,
  processing_task.progress as progress
FROM processing_task
JOIN book
  ON processing_task.book_id = book.id;

DROP TABLE processing_task;

ALTER TABLE processing_task_with_uuid RENAME TO processing_task;

/* USER_PERMISSION */

CREATE TABLE IF NOT EXISTS user_permission_with_uuid(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
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
  book_delete BOOLEAN NOT NULL DEFAULT 0
);

INSERT INTO user_permission_with_uuid
(
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
  book_delete
)
SELECT
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
  book_delete
FROM user_permission;

DROP TABLE user_permission;

ALTER TABLE user_permission_with_uuid RENAME TO user_permission;

/* INVITE */

CREATE TABLE IF NOT EXISTS invite_with_uuid(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
  id INTEGER,
  email TEXT NOT NULL,
  key TEXT NOT NULL,
  user_permission_uuid TEXT NOT NULL,

  FOREIGN KEY(user_permission_uuid) REFERENCES user_permission(uuid)
);

INSERT INTO invite_with_uuid
(
  id,
  email,
  key,
  user_permission_uuid
)
SELECT
  invite.id as id,
  invite.email as email,
  invite.key as key,
  user_permission.uuid as user_permission_uuid
FROM invite
JOIN user_permission
  ON invite.user_permission_id = user_permission.id;

DROP TABLE invite;

ALTER TABLE invite_with_uuid RENAME TO invite;

/* USER */

CREATE TABLE IF NOT EXISTS user_with_uuid(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
  id INTEGER,
  user_permission_uuid TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  hashed_password TEXT NOT NULL,

  FOREIGN KEY(user_permission_uuid) REFERENCES user_permission(uuid)
);

INSERT INTO user_with_uuid
(
  id,
  user_permission_uuid,
  username,
  email,
  full_name,
  hashed_password
)
SELECT
  user.id as id,
  user_permission.uuid as user_permission_uuid,
  user.username as username,
  user.email as email,
  user.full_name as full_name,
  user.hashed_password as hashed_password
FROM user
JOIN user_permission
  ON user.user_permission_id = user_permission.id;

DROP TABLE user;

ALTER TABLE user_with_uuid RENAME TO user;

/* SETTINGS */

CREATE TABLE IF NOT EXISTS settings_with_uuid(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
  id INTEGER,
  name TEXT NOT NULL,
  value TEXT
);

INSERT INTO settings_with_uuid
(
  id,
  name,
  value
)
SELECT
  id,
  name,
  value
FROM settings;

DROP TABLE settings;

ALTER TABLE settings_with_uuid RENAME TO settings;
