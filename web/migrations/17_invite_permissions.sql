ALTER TABLE user_permission ADD COLUMN invite_list BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE user_permission ADD COLUMN invite_delete BOOLEAN NOT NULL DEFAULT 0;

UPDATE
  user_permission
SET
  invite_list = user_create,
  invite_delete = user_create;
