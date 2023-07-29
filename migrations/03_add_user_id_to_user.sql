CREATE TABLE IF NOT EXISTS user_with_id(
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  hashed_password TEXT NOT NULL
);

INSERT INTO user_with_id
(
  username,
  email,
  full_name,
  hashed_password
)
SELECT
  username,
  email,
  full_name,
  hashed_password
FROM user;

DROP TABLE user;

ALTER TABLE user_with_id RENAME TO user;
