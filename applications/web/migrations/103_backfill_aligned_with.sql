UPDATE book
SET
  aligned_with = (
    SELECT
      coalesce(
        json_extract (j.config, '$.transcriptionEngine'),
        'whisper.cpp'
      ) || CASE
        WHEN coalesce(
          json_extract (j.config, '$.transcriptionEngine'),
          'whisper.cpp'
        ) = 'whisper.cpp' THEN ':' || coalesce(json_extract (j.config, '$.whisperModel'), 'tiny')
        WHEN json_extract (j.config, '$.transcriptionEngine') = 'openai-cloud'
        AND json_extract (j.config, '$.openAiModelName') IS NOT NULL THEN ':' || json_extract (j.config, '$.openAiModelName')
        WHEN json_extract (j.config, '$.transcriptionEngine') = 'deepgram'
        AND json_extract (j.config, '$.deepgramModel') IS NOT NULL THEN ':' || json_extract (j.config, '$.deepgramModel')
        ELSE ''
      END
    FROM
      job j
    WHERE
      j.book_uuid = book.uuid
      AND j.type = 'book_align'
      AND j.status = 'DONE'
      AND j.config IS NOT NULL
    ORDER BY
      coalesce(j.finished_at, j.updated_at) DESC
    LIMIT
      1
  )
WHERE
  (
    book.aligned_with IS NULL
    OR book.aligned_with = ''
  )
  AND EXISTS (
    SELECT
      1
    FROM
      job j2
    WHERE
      j2.book_uuid = book.uuid
      AND j2.type = 'book_align'
      AND j2.status = 'DONE'
      AND j2.config IS NOT NULL
  );
