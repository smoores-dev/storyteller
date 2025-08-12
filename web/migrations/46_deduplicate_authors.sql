CREATE TEMP TABLE author_mapping AS
SELECT
  name,
  uuid AS keep_uuid,
  ROW_NUMBER() OVER (
    PARTITION BY
      name
    ORDER BY
      created_at ASC,
      uuid ASC
  ) as rn
FROM
  author;

CREATE TEMP TABLE authors_to_keep AS
SELECT
  name,
  keep_uuid
FROM
  author_mapping
WHERE
  rn = 1;

CREATE TEMP TABLE author_merges AS
SELECT
  a.uuid as old_uuid,
  atk.keep_uuid as new_uuid
FROM
  author a
  JOIN authors_to_keep atk ON a.name = atk.name
WHERE
  a.uuid != atk.keep_uuid;

UPDATE author_to_book
SET
  author_uuid = (
    SELECT
      new_uuid
    FROM
      author_merges
    WHERE
      old_uuid = author_to_book.author_uuid
  )
WHERE
  author_uuid IN (
    SELECT
      old_uuid
    FROM
      author_merges
  );

DELETE FROM author
WHERE
  uuid IN (
    SELECT
      old_uuid
    FROM
      author_merges
  );

DROP TABLE author_mapping;

DROP TABLE authors_to_keep;

DROP TABLE author_merges;
