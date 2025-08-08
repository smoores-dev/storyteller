PRAGMA foreign_keys = 0;

CREATE TABLE IF NOT EXISTS authjs_user (
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

INSERT INTO
  authjs_user (
    id,
    user_permission_uuid,
    username,
    email,
    invite_accepted,
    name,
    hashed_password,
    created_at,
    updated_at
  )
SELECT
  uuid,
  user_permission_uuid,
  username,
  email,
  strftime ('%FT%TZ'),
  full_name,
  hashed_password,
  created_at,
  updated_at
FROM
  user;

DROP TRIGGER user_update_trigger;

DROP TABLE IF EXISTS collection_to_user;

CREATE TABLE temp_position (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  locator TEXT NOT NULL,
  timestamp REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  UNIQUE (user_id, book_uuid)
);

INSERT INTO
  temp_position (
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
  user_uuid,
  book_uuid,
  locator,
  timestamp,
  created_at,
  updated_at
FROM
  position;

DROP TABLE position;

CREATE TABLE temp_book_to_status (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  book_uuid TEXT NOT NULL,
  status_uuid TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_uuid) REFERENCES book (uuid),
  FOREIGN KEY (status_uuid) REFERENCES status (uuid)
);

INSERT INTO
  temp_book_to_status (
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
  user_uuid,
  created_at,
  updated_at
FROM
  book_to_status;

DROP TABLE book_to_status;

DROP TABLE user;

ALTER TABLE authjs_user
RENAME TO user;

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

CREATE TRIGGER IF NOT EXISTS collection_to_user_update_trigger AFTER
UPDATE ON collection_to_user FOR EACH ROW BEGIN
UPDATE collection_to_user
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

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
  temp_position;

DROP TABLE temp_position;

CREATE TRIGGER IF NOT EXISTS position_update_trigger AFTER
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
  user_uuid,
  created_at,
  updated_at
FROM
  temp_book_to_status;

DROP TABLE temp_book_to_status;

CREATE TRIGGER book_to_status_update_trigger AFTER
UPDATE ON book_to_status FOR EACH ROW BEGIN
UPDATE book_to_status
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

INSERT INTO
  user (user_permission_uuid, email, invite_key)
SELECT
  invite.user_permission_uuid,
  invite.email,
  invite.key
FROM
  invite
  LEFT JOIN user ON user.email = invite.email
WHERE
  user.email IS NULL;

DROP TABLE invite;

CREATE TABLE IF NOT EXISTS account (
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

CREATE TABLE IF NOT EXISTS session (
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

CREATE TABLE IF NOT EXISTS verification_token (
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

PRAGMA foreign_keys = 1;
