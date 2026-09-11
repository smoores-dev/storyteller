INSERT INTO
  settings (name, value)
SELECT
  'ctcModel',
  'null'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'ctcModel'
  );
