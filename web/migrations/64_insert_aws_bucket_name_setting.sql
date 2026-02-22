INSERT INTO
  settings (name, value)
SELECT
  'amazonTranscribeBucketName',
  'null'
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      settings
    WHERE
      name = 'amazonTranscribeBucketName'
  );
