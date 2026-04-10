UPDATE settings
SET
  value = '1440'
WHERE
  name = 'existingBooksScanIntervalMinutes'
  AND value = 'null';

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
