INSERT INTO
  settings (name, value)
SELECT
  'whisperCpuFallback',
  'null'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'whisperCpuFallback'
  );
