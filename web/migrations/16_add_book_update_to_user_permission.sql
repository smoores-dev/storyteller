ALTER TABLE user_permission ADD COLUMN book_update BOOLEAN NOT NULL DEFAULT 0;

UPDATE user_permission SET book_update = book_create;
