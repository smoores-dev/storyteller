-- keep only the most-recently-created row per setting name
DELETE FROM settings
WHERE uuid NOT IN (
  SELECT uuid FROM (
    SELECT uuid, ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at DESC) AS rn
    FROM settings
  ) WHERE rn = 1
);

CREATE UNIQUE INDEX idx_settings_name ON settings (name);
