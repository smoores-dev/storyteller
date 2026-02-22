INSERT INTO
  settings (name, value)
SELECT
  'whisperThreads',
  '1'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'whisperThreads'
  );

INSERT INTO
  settings (name, value)
SELECT
  'whisperModelOverrides',
  '{}'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'whisperModelOverrides'
  );

INSERT INTO
  settings (name, value)
SELECT
  'autoDetectLanguage',
  'false'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'autoDetectLanguage'
  );

INSERT INTO
  settings (name, value)
SELECT
  'whisperServerUrl',
  'null'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'whisperServerUrl'
  );

INSERT INTO
  settings (name, value)
SELECT
  'whisperServerApiKey',
  'null'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'whisperServerApiKey'
  );

-- jess specific fix
DELETE FROM settings
WHERE
  name = 'whisperBuild'
  AND value = 'cpu';

INSERT INTO
  settings (name, value)
SELECT
  'whisperBuild',
  '"cpu"'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'whisperBuild'
  );

INSERT INTO
  settings (name, value)
SELECT
  'parallelWhisperBuild',
  '1'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'parallelWhisperBuild'
  );
