CREATE TABLE IF NOT EXISTS invite(
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  key TEXT NOT NULL,
  user_permission_id INTEGER NOT NULL,

  FOREIGN KEY(user_permission_id) REFERENCES user_permission(id)
);
