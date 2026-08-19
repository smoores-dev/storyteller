ALTER TABLE status
ADD COLUMN label TEXT;

UPDATE status
SET
  label = name
WHERE
  label IS NULL;
