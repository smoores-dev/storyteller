INSERT INTO
  settings (name, value)
SELECT
  'aligner',
  '"whisper"'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'aligner'
  );

INSERT INTO
  settings (name, value)
SELECT
  'ctcEngine',
  '"wav2vec-local"'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'ctcEngine'
  );

INSERT INTO
  settings (name, value)
SELECT
  'ctcDevice',
  'null'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'ctcDevice'
  );

-- INSERT INTO settings(name, value)
-- SELECT
--   'ctcServerUrl',
--   'null'
-- WHERE
--   NOT EXISTS (
--     SELECT
--       1
--     FROM
--       settings
--     WHERE
--       name = 'ctcServerUrl');
--
-- INSERT INTO settings(name, value)
-- SELECT
--   'ctcServerApiKey',
--   'null'
-- WHERE
--   NOT EXISTS (
--     SELECT
--       1
--     FROM
--       settings
--     WHERE
--       name = 'ctcServerApiKey');
