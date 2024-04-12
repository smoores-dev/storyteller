ALTER TABLE user
ADD COLUMN user_permission_id
INTEGER;

UPDATE user
  SET user_permission_id = id;

CREATE TABLE temp_user_permission(
  id INTEGER PRIMARY KEY,
  book_create BOOLEAN NOT NULL DEFAULT 0,
  book_read BOOLEAN NOT NULL DEFAULT 0,
  book_process BOOLEAN NOT NULL DEFAULT 0,
  book_download BOOLEAN NOT NULL DEFAULT 0,
  book_list BOOLEAN NOT NULL DEFAULT 0,
  user_create BOOLEAN NOT NULL DEFAULT 0,
  user_list BOOLEAN NOT NULL DEFAULT 0,
  user_read BOOLEAN NOT NULL DEFAULT 0,
  user_delete BOOLEAN NOT NULL DEFAULT 0
);

INSERT INTO temp_user_permission(
  id,
  book_create,
  book_read,
  book_process,
  book_download,
  book_list,
  user_create,
  user_list,
  user_read,
  user_delete
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
  user_delete
FROM user_permission;

DROP TABLE user_permission;

ALTER TABLE temp_user_permission RENAME TO user_permission;

CREATE TABLE temp_user(
  id INTEGER PRIMARY KEY,
  user_permission_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  hashed_password TEXT NOT NULL,

  FOREIGN KEY(user_permission_id) REFERENCES user_permission(id)
);

INSERT INTO temp_user
(
  id,
  user_permission_id,
  username,
  email,
  full_name,
  hashed_password
)
SELECT
  id,
  user_permission_id,
  username,
  email,
  full_name,
  hashed_password
FROM user;

DROP TABLE user;

ALTER TABLE temp_user RENAME TO user;
