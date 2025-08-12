ALTER TABLE collection_to_user
RENAME TO temp_collection_to_user;

CREATE TABLE collection_to_user (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  user_id TEXT NOT NULL,
  collection_uuid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (collection_uuid) REFERENCES "collection" (uuid),
  FOREIGN KEY (user_id) REFERENCES user (id)
);

INSERT INTO
  collection_to_user
SELECT
  *
FROM
  temp_collection_to_user;

DROP TABLE temp_collection_to_user;
