INSERT INTO
  settings (name, value)
SELECT
  'existingBooksScanIntervalMinutes',
  'null'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'existingBooksScanIntervalMinutes'
  );
