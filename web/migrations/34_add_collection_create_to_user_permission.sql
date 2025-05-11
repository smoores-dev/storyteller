ALTER TABLE user_permission
ADD COLUMN collection_create BOOLEAN NOT NULL DEFAULT 0;

UPDATE user_permission
SET
  collection_create = book_create;
