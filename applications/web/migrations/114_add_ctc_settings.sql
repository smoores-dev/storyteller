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

DELETE FROM settings
WHERE
  name = 'ctcEngine';

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
