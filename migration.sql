-- v4.0 Schema Improvements
-- 1. Add unique constraint on OpenPosition(account_id, position_no)
--    Enables safe upsert instead of delete-all + re-insert
CREATE UNIQUE INDEX IF NOT EXISTS "OpenPosition_account_id_position_no_key"
  ON "OpenPosition"("account_id", "position_no");

-- 2. Add composite index on Deal(account_id, type)
--    Speeds up balance-deal vs trading-deal filtering in analytics
CREATE INDEX IF NOT EXISTS "Deal_account_id_type_idx"
  ON "Deal"("account_id", "type");

-- 3. Add composite index on Position(account_id, open_time)
--    Speeds up hold-time and trade-activity calculations
CREATE INDEX IF NOT EXISTS "Position_account_id_open_time_idx"
  ON "Position"("account_id", "open_time");

-- 4. Add pips column to Position for O(1) pips lookup
ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "pips" DOUBLE PRECISION;

-- 5. Drop single-account unique on AccountReportResult
--    and re-create as (account_id, source_report_date) to retain history
-- NOTE: Run this only if you want historical result retention.
-- The existing UNIQUE on account_id is kept for now to avoid breaking
-- existing upsert logic. Enable below when ready to migrate:
-- ALTER TABLE "AccountReportResult" DROP CONSTRAINT IF EXISTS "AccountReportResult_account_id_key";
-- CREATE UNIQUE INDEX IF NOT EXISTS "AccountReportResult_account_id_report_date_key"
--   ON "AccountReportResult"("account_id", "source_report_date")
--   WHERE "source_report_date" IS NOT NULL;
