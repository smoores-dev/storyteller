-- ts version src/database/migrations/78_asset_dir.sql.ts
ALTER TABLE book
ADD COLUMN asset_dir TEXT NOT NULL DEFAULT '';
