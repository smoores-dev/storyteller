ALTER TABLE user_permission ADD COLUMN user_update BOOLEAN NOT NULL DEFAULT 0;

UPDATE
  user_permission
SET
  user_update = user_create;
