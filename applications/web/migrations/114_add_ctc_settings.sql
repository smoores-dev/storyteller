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
  '"ctc-local"'
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
  'ctcModel',
  '"onnx-community/mms-300m-1130-forced-aligner-ONNX"'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'ctcModel'
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

INSERT INTO
  settings (name, value)
SELECT
  'ctcServerUrl',
  'null'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'ctcServerUrl'
  );

INSERT INTO
  settings (name, value)
SELECT
  'ctcServerApiKey',
  'null'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'ctcServerApiKey'
  );
