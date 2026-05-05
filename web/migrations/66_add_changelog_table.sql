CREATE TABLE IF NOT EXISTS changelog (
  uuid text PRIMARY KEY DEFAULT (uuid ()),
  tag_name text NOT NULL UNIQUE,
  version text NOT NULL,
  component text NOT NULL,
  description text,
  released_at text NOT NULL,
  created_at text NOT NULL DEFAULT (datetime ('now')),
  updated_at text NOT NULL DEFAULT (datetime ('now'))
);

CREATE INDEX IF NOT EXISTS idx_changelog_component_released_at ON changelog (component, released_at DESC);
