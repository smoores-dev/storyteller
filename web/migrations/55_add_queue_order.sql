ALTER TABLE readaloud
ADD COLUMN queue_position INTEGER;

ALTER TABLE readaloud
ADD COLUMN restart_pending INTEGER;
