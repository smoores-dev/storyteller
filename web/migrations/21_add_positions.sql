CREATE TABLE IF NOT EXISTS position(
  position_uuid TEXT PRIMARY KEY DEFAULT (uuid()), 
  user_uuid TEXT NOT NULL,
  book_uuid TEXT NOT NULL,
  locator TEXT NOT NULL,
  timestamp FLOAT NOT NULL,

  FOREIGN KEY(user_uuid) REFERENCES user(uuid)
  FOREIGN KEY(book_uuid) REFERENCES book(uuid)
  UNIQUE(user_uuid, book_uuid)
);
