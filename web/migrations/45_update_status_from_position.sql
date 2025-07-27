UPDATE book
SET
  status_uuid = est.status_uuid
FROM
  (
    SELECT
      status.name AS status_name,
      status.uuid AS status_uuid,
      position.book_uuid AS book_uuid
    FROM
      position
      INNER JOIN status ON CASE
        WHEN json_extract (position.locator, '$.locations.totalProgression') < 0.98 THEN 'Reading'
        ELSE 'Read'
      END = status.name
  ) AS est
WHERE
  book.uuid = est.book_uuid;
