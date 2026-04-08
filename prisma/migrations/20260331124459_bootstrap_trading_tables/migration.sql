CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE IF NOT EXISTS "Account" (
    "id" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "owner_name" TEXT,
    "company" TEXT,
    "currency" TEXT NOT NULL,
    "server" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "report_date" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AccountSnapshot" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "source_file_name" TEXT,
    "balance" DECIMAL(28,8) NOT NULL,
    "credit_facility" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "floating_pl" DECIMAL(28,8) NOT NULL,
    "equity" DECIMAL(28,8) NOT NULL,
    "free_margin" DECIMAL(28,8) NOT NULL,
    "margin" DECIMAL(28,8) NOT NULL,
    "margin_level" DOUBLE PRECISION,
    "report_date" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OpenPosition" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "position_no" TEXT NOT NULL,
    "open_time" TIMESTAMP(3),
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "price" DECIMAL(28,8) NOT NULL,
    "sl" DECIMAL(28,8),
    "tp" DECIMAL(28,8),
    "market_price" DECIMAL(28,8) NOT NULL,
    "swap" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "profit" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "comment" TEXT,
    "report_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenPosition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Position" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "position_no" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "open_time" TIMESTAMP(3),
    "open_price" DECIMAL(28,8),
    "sl" DECIMAL(28,8),
    "tp" DECIMAL(28,8),
    "close_time" TIMESTAMP(3),
    "close_price" DECIMAL(28,8),
    "commission" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "swap" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "profit" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "comment" TEXT,
    "report_date" TIMESTAMP(3) NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Deal" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "deal_no" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "symbol" TEXT,
    "type" TEXT NOT NULL,
    "direction" TEXT,
    "volume" DOUBLE PRECISION,
    "price" DECIMAL(28,8),
    "commission" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "fee" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "swap" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "profit" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "balance" DECIMAL(28,8),
    "comment" TEXT,
    "report_date" TIMESTAMP(3) NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReportImport" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "report_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportImport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Account_account_number_key" ON "Account"("account_number");
CREATE UNIQUE INDEX IF NOT EXISTS "AccountSnapshot_account_id_key" ON "AccountSnapshot"("account_id");
CREATE INDEX IF NOT EXISTS "OpenPosition_account_id_symbol_idx" ON "OpenPosition"("account_id", "symbol");
CREATE INDEX IF NOT EXISTS "OpenPosition_account_id_report_date_idx" ON "OpenPosition"("account_id", "report_date");
CREATE INDEX IF NOT EXISTS "Position_account_id_close_time_idx" ON "Position"("account_id", "close_time");
CREATE INDEX IF NOT EXISTS "Position_account_id_report_date_idx" ON "Position"("account_id", "report_date");
CREATE UNIQUE INDEX IF NOT EXISTS "Position_account_id_position_no_key" ON "Position"("account_id", "position_no");
CREATE INDEX IF NOT EXISTS "Deal_account_id_time_idx" ON "Deal"("account_id", "time");
CREATE INDEX IF NOT EXISTS "Deal_account_id_report_date_idx" ON "Deal"("account_id", "report_date");
CREATE INDEX IF NOT EXISTS "Deal_symbol_idx" ON "Deal"("symbol");
CREATE UNIQUE INDEX IF NOT EXISTS "Deal_account_id_deal_no_key" ON "Deal"("account_id", "deal_no");
CREATE INDEX IF NOT EXISTS "ReportImport_account_id_idx" ON "ReportImport"("account_id");
CREATE INDEX IF NOT EXISTS "ReportImport_report_date_idx" ON "ReportImport"("report_date");
CREATE UNIQUE INDEX IF NOT EXISTS "ReportImport_account_id_file_hash_key" ON "ReportImport"("account_id", "file_hash");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'AccountSnapshot_account_id_fkey'
    ) THEN
        ALTER TABLE "AccountSnapshot"
        ADD CONSTRAINT "AccountSnapshot_account_id_fkey"
        FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'OpenPosition_account_id_fkey'
    ) THEN
        ALTER TABLE "OpenPosition"
        ADD CONSTRAINT "OpenPosition_account_id_fkey"
        FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Position_account_id_fkey'
    ) THEN
        ALTER TABLE "Position"
        ADD CONSTRAINT "Position_account_id_fkey"
        FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Deal_account_id_fkey'
    ) THEN
        ALTER TABLE "Deal"
        ADD CONSTRAINT "Deal_account_id_fkey"
        FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ReportImport_account_id_fkey'
    ) THEN
        ALTER TABLE "ReportImport"
        ADD CONSTRAINT "ReportImport_account_id_fkey"
        FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
