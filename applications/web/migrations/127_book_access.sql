CREATE TABLE IF NOT EXISTS book_access (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  book_uuid TEXT NOT NULL REFERENCES book(uuid) ON DELETE CASCADE,
  PRIMARY KEY (user_id, book_uuid)
);

CREATE INDEX IF NOT EXISTS idx_book_access_book ON book_access (book_uuid);

DROP VIEW IF EXISTS book_access_view;

CREATE VIEW book_access_view AS
SELECT user.id AS user_id, book.uuid AS book_uuid
FROM user CROSS JOIN book
WHERE
  NOT EXISTS (
    SELECT 1 FROM book_to_collection WHERE book_to_collection.book_uuid = book.uuid
  )
  OR EXISTS (
    SELECT 1 FROM book_to_collection
      JOIN collection ON collection.uuid = book_to_collection.collection_uuid
      WHERE book_to_collection.book_uuid = book.uuid
        AND collection.public = 1
  )
  OR EXISTS (
    SELECT 1 FROM book_to_collection
      JOIN collection_to_user ON collection_to_user.collection_uuid = book_to_collection.collection_uuid
      WHERE book_to_collection.book_uuid = book.uuid
        AND collection_to_user.user_id = user.id
  );

INSERT INTO book_access
SELECT user_id, book_uuid
FROM book_access_view
WHERE true
ON CONFLICT (user_id, book_uuid) DO NOTHING;

DROP TRIGGER IF EXISTS book_to_collection_access_insert;

CREATE TRIGGER book_to_collection_access_insert
AFTER INSERT ON book_to_collection
BEGIN
  INSERT INTO book_access
    SELECT user_id, book_uuid FROM book_access_view
      WHERE book_uuid = NEW.book_uuid
    ON CONFLICT (user_id, book_uuid) DO NOTHING;

  DELETE FROM book_access
  WHERE book_uuid = NEW.book_uuid
    AND (user_id, book_uuid) NOT IN (
      SELECT user_id, book_uuid FROM book_access_view
        WHERE book_uuid = NEW.book_uuid
    );
END;

DROP TRIGGER IF EXISTS book_to_collection_access_delete;

CREATE TRIGGER book_to_collection_access_delete
AFTER DELETE ON book_to_collection
BEGIN
  INSERT INTO book_access
    SELECT user_id, book_uuid FROM book_access_view
      WHERE book_uuid = OLD.book_uuid
    ON CONFLICT (user_id, book_uuid) DO NOTHING;

  DELETE FROM book_access
  WHERE book_uuid = OLD.book_uuid
    AND (user_id, book_uuid) NOT IN (
      SELECT user_id, book_uuid FROM book_access_view
        WHERE book_uuid = OLD.book_uuid
    );
END;

DROP TRIGGER IF EXISTS collection_to_user_access_insert;

CREATE TRIGGER collection_to_user_access_insert
AFTER INSERT ON collection_to_user
BEGIN
  INSERT INTO book_access
    SELECT user_id, book_uuid FROM book_access_view
      WHERE user_id = NEW.user_id
        AND book_uuid IN (
          SELECT book_uuid FROM book_to_collection
            WHERE collection_uuid = NEW.collection_uuid
        )
    ON CONFLICT (user_id, book_uuid) DO NOTHING;
END;

DROP TRIGGER IF EXISTS collection_to_user_access_delete;

CREATE TRIGGER collection_to_user_access_delete
AFTER DELETE ON collection_to_user
BEGIN
  DELETE FROM book_access
  WHERE user_id = OLD.user_id
    AND book_uuid IN (
      SELECT book_uuid FROM book_to_collection
        WHERE collection_uuid = OLD.collection_uuid
    )
    AND (user_id, book_uuid) NOT IN (
      SELECT user_id, book_uuid FROM book_access_view
        WHERE user_id = OLD.user_id
          AND book_uuid IN (
            SELECT book_uuid FROM book_to_collection
              WHERE collection_uuid = OLD.collection_uuid
          )
    );
END;

DROP TRIGGER IF EXISTS collection_access_update;

CREATE TRIGGER collection_access_update
AFTER UPDATE OF public ON collection
WHEN OLD.public IS NOT NEW.public
BEGIN
  INSERT INTO book_access
    SELECT user_id, book_uuid FROM book_access_view
      WHERE book_uuid IN (
        SELECT book_uuid FROM book_to_collection
          WHERE collection_uuid = NEW.uuid
      )
    ON CONFLICT (user_id, book_uuid) DO NOTHING;

  DELETE FROM book_access
  WHERE book_uuid IN (
      SELECT book_uuid FROM book_to_collection
        WHERE collection_uuid = NEW.uuid
    )
    AND (user_id, book_uuid) NOT IN (
      SELECT user_id, book_uuid FROM book_access_view
        WHERE book_uuid IN (
          SELECT book_uuid FROM book_to_collection
            WHERE collection_uuid = NEW.uuid
        )
    );
END;

DROP TRIGGER IF EXISTS book_access_insert;

CREATE TRIGGER book_access_insert
AFTER INSERT ON book
BEGIN
  INSERT INTO book_access
    SELECT user_id, book_uuid FROM book_access_view
      WHERE book_uuid = NEW.uuid
    ON CONFLICT (user_id, book_uuid) DO NOTHING;
END;

DROP TRIGGER IF EXISTS user_access_insert;

CREATE TRIGGER user_access_insert
AFTER INSERT ON user
BEGIN
  INSERT INTO book_access
    SELECT user_id, book_uuid FROM book_access_view
      WHERE user_id = NEW.id
    ON CONFLICT (user_id, book_uuid) DO NOTHING;
END;
