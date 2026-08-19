-- sidebar group kinds (v2)
-- schema changes + full sidebar reset live in the JS migration
-- (src/database/migrations/104_sidebar_group_kind.sql.ts):
--   * add kind column to sidebar_group, unique per (user_id, kind)
--   * drop unused collapsed / hidden columns
--   * clear all sidebar rows; ensureSidebarDefaults() restocks lazily
SELECT
  4;
