INSERT INTO
  settings (name, value)
SELECT
  'ctcDtype',
  'null'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'ctcDtype'
  );

INSERT INTO
  settings (name, value)
SELECT
  'ctcBatchSize',
  'null'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'ctcBatchSize'
  );
