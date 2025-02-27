CREATE TABLE migration(
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "book"(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
  id INTEGER, /* Maintain the old integer ids to avoid breaking changes */
  title TEXT NOT NULL,
  epub_filename TEXT,
  audio_filename TEXT,
  audio_filetype TEXT NOT NULL DEFAULT 'mp4'
, language TEXT DEFAULT NULL);
CREATE TABLE IF NOT EXISTS "author"(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
  id INTEGER,
  name TEXT NOT NULL,
  file_as TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "author_to_book"(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
  id INTEGER,
  book_uuid TEXT,
  author_uuid TEXT,
  role TEXT,
  FOREIGN KEY(book_uuid) REFERENCES book(uuid)
  FOREIGN KEY(author_uuid) REFERENCES author(uuid)
);
CREATE TABLE IF NOT EXISTS "processing_task"(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
  id INTEGER,
  type TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(book_uuid) REFERENCES book(uuid)
);
CREATE TABLE IF NOT EXISTS "user_permission"(
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
, book_update BOOLEAN NOT NULL DEFAULT 0, invite_list BOOLEAN NOT NULL DEFAULT 0, invite_delete BOOLEAN NOT NULL DEFAULT 0, user_update BOOLEAN NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS "invite"(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
  id INTEGER,
  email TEXT NOT NULL,
  key TEXT NOT NULL,
  user_permission_uuid TEXT NOT NULL,

  FOREIGN KEY(user_permission_uuid) REFERENCES user_permission(uuid)
);
CREATE TABLE IF NOT EXISTS "user"(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
  id INTEGER,
  user_permission_uuid TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  hashed_password TEXT NOT NULL,

  FOREIGN KEY(user_permission_uuid) REFERENCES user_permission(uuid)
);
CREATE TABLE IF NOT EXISTS "settings"(
  uuid TEXT PRIMARY KEY DEFAULT (uuid()),
  id INTEGER,
  name TEXT NOT NULL,
  value TEXT
);
CREATE TABLE token_revokation(
  token TEXT PRIMARY KEY
);
CREATE TABLE position(
  position_uuid TEXT PRIMARY KEY DEFAULT (uuid()), 
  user_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  locator TEXT NOT NULL,
  timestamp FLOAT NOT NULL,

  FOREIGN KEY(user_uuid) REFERENCES user(uuid)
  FOREIGN KEY(book_uuid) REFERENCES book(uuid)
  UNIQUE(user_uuid, book_uuid)
);
