-- Make the filepath column non-nullable in the import_skip_path table
-- first create new table (can't change nullability in sqlite...)
CREATE TABLE import_skip_path_new (
  book_uuid TEXT REFERENCES book (uuid),
  filepath TEXT PRIMARY KEY NOT NULL
);

-- copy over the data, ignoring the nulls
INSERT INTO
  import_skip_path_new
SELECT
  *
FROM
  import_skip_path
WHERE
  filepath IS NOT NULL;

-- drop the old table
DROP TABLE import_skip_path;

-- rename the new table to the old table name
ALTER TABLE import_skip_path_new
RENAME TO import_skip_path;
