DROP TABLE processing_task;

ALTER TABLE readaloud
ADD COLUMN current_stage TEXT;

ALTER TABLE readaloud
ADD COLUMN stage_progress INTEGER NOT NULL DEFAULT 0;
