INSERT INTO
  settings (name, value)
SELECT
  'existingBooksScanIntervalMinutes',
  '1440'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'existingBooksScanIntervalMinutes'
  );

INSERT INTO
  settings (name, value)
SELECT
  'metadataOverrideMode',
  '"fill-empty"'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'metadataOverrideMode'
  );

INSERT INTO
  settings (name, value)
SELECT
  'scanCronExpression',
  'null'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'scanCronExpression'
  );

ALTER TABLE ebook
ADD COLUMN is_epub2 BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE readaloud
ADD COLUMN is_epub2 BOOLEAN NOT NULL DEFAULT FALSE;
