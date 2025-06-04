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

INSERT INTO
  user (user_permission_uuid, email, invite_key)
SELECT
  user_permission_uuid,
  email,
  key
FROM
  invite;

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
