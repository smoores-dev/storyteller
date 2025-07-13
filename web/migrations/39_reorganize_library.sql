-- This is a no-op placeholder. All of the actual logic lives in
-- the sidecar typescript file
ALTER TABLE book
ADD COLUMN suffix TEXT NOT NULL DEFAULT '';
