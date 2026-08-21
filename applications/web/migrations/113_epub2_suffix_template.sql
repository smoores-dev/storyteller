-- the suffix now also applies to epub3 backups
UPDATE settings
SET
  value = '"_epub{version}"'
WHERE
  name = 'epub2BackupSuffix'
  AND value = '"_epub2"';
