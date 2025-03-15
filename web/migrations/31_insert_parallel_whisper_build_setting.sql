INSERT INTO settings (name, value)
    SELECT 'parallel_whisper_build', value
    FROM settings
    WHERE name = 'parallel_transcodes';
