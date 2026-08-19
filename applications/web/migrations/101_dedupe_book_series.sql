-- 101_dedupe_book_series: logic lives in src/database/migrations/101_dedupe_book_series.sql.ts
-- (content must stay distinct from 80_import_rule_epub2_strategy.sql -- the
-- migration runner tracks files by content hash, and an identical stub would
-- make one of the two silently skip its js companion)
SELECT
  101;
