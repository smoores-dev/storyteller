ALTER TABLE user_permission ADD COLUMN book_delete BOOLEAN NOT NULL DEFAULT 0;

UPDATE user_permission SET book_delete = book_create;
