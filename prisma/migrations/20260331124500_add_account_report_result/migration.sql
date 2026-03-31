CREATE TABLE "AccountReportResult" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_report_date" TIMESTAMP(3),
    "total_commission" DECIMAL(28,8),
    "total_swap" DECIMAL(28,8),
    "total_net_profit" DECIMAL(28,8),
    "gross_profit" DECIMAL(28,8),
    "gross_loss" DECIMAL(28,8),
    "profit_factor" DOUBLE PRECISION,
    "expected_payoff" DECIMAL(28,8),
    "recovery_factor" DOUBLE PRECISION,
    "sharpe_ratio" DOUBLE PRECISION,
    "balance_drawdown_absolute" DECIMAL(28,8),
    "balance_drawdown_maximal" DECIMAL(28,8),
    "balance_drawdown_maximal_pct" DOUBLE PRECISION,
    "balance_drawdown_relative_pct" DOUBLE PRECISION,
    "balance_drawdown_relative" DECIMAL(28,8),
    "total_trades" INTEGER,
    "short_trades_won" INTEGER,
    "short_trades_total" INTEGER,
    "long_trades_won" INTEGER,
    "long_trades_total" INTEGER,
    "profit_trades_count" INTEGER,
    "loss_trades_count" INTEGER,
    "largest_profit_trade" DECIMAL(28,8),
    "largest_loss_trade" DECIMAL(28,8),
    "average_profit_trade" DECIMAL(28,8),
    "average_loss_trade" DECIMAL(28,8),
    "maximum_consecutive_wins" INTEGER,
    "maximum_consecutive_losses" INTEGER,

    CONSTRAINT "AccountReportResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountReportResult_account_id_key" ON "AccountReportResult"("account_id");
CREATE INDEX "AccountReportResult_computed_at_idx" ON "AccountReportResult"("computed_at");

ALTER TABLE "AccountReportResult"
ADD CONSTRAINT "AccountReportResult_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
