-- give tags an icon and color, mirroring collections (migration 89)
ALTER TABLE tag
ADD COLUMN icon TEXT;

ALTER TABLE tag
ADD COLUMN color TEXT;
