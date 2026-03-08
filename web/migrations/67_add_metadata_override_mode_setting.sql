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
