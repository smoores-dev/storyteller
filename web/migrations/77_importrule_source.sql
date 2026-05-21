-- tag ignore rules with what created them so the UI can hide the auto-generated
-- ones and so deleting a book cascades to remove its import-side ignores.

ALTER TABLE import_rule
ADD COLUMN source TEXT NOT NULL DEFAULT 'user'
  CHECK (source IN ('user', 'import-relocate', 'import-backup', 'prevent-reimport'));

ALTER TABLE import_rule
ADD COLUMN book_uuid TEXT DEFAULT NULL
  REFERENCES book (uuid) ON DELETE CASCADE;

CREATE INDEX idx_import_rule_book_uuid ON import_rule (book_uuid);
