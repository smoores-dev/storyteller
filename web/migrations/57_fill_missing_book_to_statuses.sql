INSERT INTO
  book_to_status (book_uuid, status_uuid, user_id)
SELECT
  book.uuid as book_uuid,
  (
    SELECT
      uuid
    FROM
      status
    WHERE
      is_default = 1
    LIMIT
      1
  ) as status_uuid,
  user.id as user_id
FROM
  book
  CROSS JOIN user
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      book_to_status
    WHERE
      book_to_status.book_uuid = book.uuid
      AND book_to_status.user_id = user.id
  );
