CREATE TABLE IF NOT EXISTS user(
  username TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  hashed_password TEXT NOT NULL
);
