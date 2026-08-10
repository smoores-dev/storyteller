CREATE TABLE IF NOT EXISTS image (
  uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
  sha256 TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  blurhash TEXT,
  colors TEXT,
  source_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS image_update_trigger AFTER
UPDATE ON image FOR EACH ROW BEGIN
UPDATE image
SET
  updated_at = CURRENT_TIMESTAMP
WHERE
  uuid = OLD.uuid;

END;

ALTER TABLE ebook
ADD COLUMN cover_image_uuid TEXT REFERENCES image (uuid) ON DELETE SET NULL;

ALTER TABLE ebook
ADD COLUMN cover_origin TEXT NOT NULL DEFAULT 'unset';

ALTER TABLE ebook
ADD COLUMN cover_extracted_from TEXT;

ALTER TABLE audiobook
ADD COLUMN cover_image_uuid TEXT REFERENCES image (uuid) ON DELETE SET NULL;

ALTER TABLE audiobook
ADD COLUMN cover_origin TEXT NOT NULL DEFAULT 'unset';

ALTER TABLE audiobook
ADD COLUMN cover_extracted_from TEXT;

ALTER TABLE readaloud
ADD COLUMN cover_image_uuid TEXT REFERENCES image (uuid) ON DELETE SET NULL;

ALTER TABLE readaloud
ADD COLUMN cover_origin TEXT NOT NULL DEFAULT 'unset';

ALTER TABLE readaloud
ADD COLUMN cover_extracted_from TEXT;

CREATE INDEX IF NOT EXISTS idx_ebook_cover_image ON ebook (cover_image_uuid);

CREATE INDEX IF NOT EXISTS idx_audiobook_cover_image ON audiobook (cover_image_uuid);

CREATE INDEX IF NOT EXISTS idx_readaloud_cover_image ON readaloud (cover_image_uuid);
