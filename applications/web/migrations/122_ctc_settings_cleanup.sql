UPDATE settings
SET
  value = '"ctc-local"'
WHERE
  name = 'ctcEngine'
  AND value = '"wav2vec-local"';

UPDATE settings
SET
  value = '"quartznet15x5"'
WHERE
  name = 'ctcModel'
  AND value LIKE '"citrinet%';

DELETE FROM settings
WHERE
  name IN (
    'alignmentGapSeconds',
    'alignmentAudioChapterSeconds',
    'alignmentDropUnread'
  );
