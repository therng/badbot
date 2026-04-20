# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`analytic` is a Next.js trading account monitor for MT5-style account data. It is an operational dashboard — not a marketing site — built to help operators quickly identify which accounts matter most, track balance/equity curves, and drill into performance without losing context.

## Core Commands

```bash
npm run dev              # Run dashboard locally
npm run maintain         # Dev server with maintenance mode enabled
npm run build            # Required baseline verification for all app changes
npm run lint             # ESLint checks (Next.js defaults)

# Unit tests (Node built-in runner)
npm run test:formatters  # Test currency/compact formatters
npm run test:parser      # Test MT5 HTML report parser

# Worker (background import job)
npm run worker:once      # Single worker pass
npm run worker:reimport  # Force reimport from configured FTP source
npm run worker:reimport:local  # Force reimport from local files

# Scripts
npm run parse:mt5-report -- path/to/report.html  # Parse an MT5 report
npm run db:backfill-report-results  # Recompute persisted report results
npm run db:remediate-positions      # Dry-run fix for corrupted positions (add --apply to execute)
npm run db:clean                    # Local data cleanup
```

**Verification:** No end-to-end test suite. `npm run build` and `npm run lint` are the baseline. Run `test:formatters` and `test:parser` for logic changes. For parser, analytics, or import changes, also run the relevant script against representative data.

## Architecture

**Stack:** Next.js 15 App Router + React 18, Prisma 6 + PostgreSQL 15, background worker (esbuild-bundled Node.js), Caddy reverse proxy.

**Key directories:**
- `src/app/` — App Router pages, layouts, API routes
- `src/components/trading-monitor/` — Dashboard UI, formatters, account card logic
- `src/lib/trading/` — Analytics, preaggregated cache views, account helpers, types
- `src/lib/parser/` — MT5 HTML report parsing and normalization (uses cheerio)
- `src/lib/time.ts` — Bangkok-timezone utilities (critical for Thai trading hours)
- `src/worker/` — Background FTP import and recompute worker
- `prisma/` — Schema and migrations
- `scripts/` — Operational scripts (cleanup, backfill, parse)
- `apps/mobile/` — Legacy/mobile experiments; not part of the main web build

**API routes (`src/app/api/`):**
- `accounts/` — List all accounts
- `accounts/[id]/` — Account overview with timeframe
- `accounts/[id]/balance-detail/` — Balance curve data
- `accounts/[id]/profit-detail/` — Profit analytics
- `accounts/[id]/win-detail/` — Win rate analytics
- `accounts/[id]/positions/` — Closed positions list
- `accounts/[id]/pips-summary/` — Pips performance summary
- `health/` — Health check
- `loading-insight/` — Startup data for loading screen

All account-level endpoints support `?timeframe=1d|1w|1m|ytd|1y|all`.

**Docker Compose stack:** `db` (postgres:15-alpine) → `web` (Next.js, runs migrations when `RUN_DB_MIGRATIONS=true`) → `worker` → `caddy` (port 80).

## Data Model

Core tables:
- `TradingAccount` — Account metadata (accountNo, owner, company, currency, server, reportDate)
- `AccountSnapshot` — Current state (balance, equity, margin, floatingPL, marginLevel, creditFacility)
- `AccountReportResult` — Precomputed performance metrics (profitFactor, sharpeRatio, drawdown, win stats, streaks)
- `Position` — Closed positions; source for win rate, profit factor, trade counts; includes `pips` column for O(1) lookup
- `Deal` — All transactions; source for balance curve, growth, drawdown, intraday D-timeframe
- `OpenPosition` — Active positions; source for floating P/L and open exposure; unique on `(accountId, positionNo)` for safe upsert
- `ReportImport` — Import tracking with SHA256 file hash deduplication

**v4.0 schema improvements:**
- Unique constraint on `OpenPosition(accountId, positionNo)` enables safe upsert (vs delete-all + re-insert)
- Composite index on `Deal(accountId, type)` for trading vs. balance deal filtering
- Composite index on `Position(accountId, openTime)` for hold-time analytics
- `pips` column on `Position` for O(1) pips lookup

**Source boundaries (critical):**
- Win rate, profit factor, Sharpe, expected payoff, trade streaks → `Position`
- Balance curve, growth, drawdown, intraday D-timeframe → `Deal`
- Floating P/L, open exposure → `OpenPosition`
- Latest balance, equity, margin level → `TradingAccount` / `AccountSnapshot`
- `positionNetPnl = profit + swap + commission` (always include swap + commission)

## Key Conventions

**Code style:** 2-space indent, semicolons, double quotes, `@/` import aliases, `PascalCase` for components/types, `camelCase` for functions/variables/hooks.

**Number formatting:**
- Full currency: always 2 decimals with symbol, no space (`$1,234.57`)
- Compact monetary: no symbol, max 1 decimal, uppercase K/M/B suffixes, strip trailing `.0`
- Never mix compact and full currency in the same metric surface
- Round only at presentation layer; keep backend at full precision

**Growth/analytics:** Follow MQL5-style logic so deposits/withdrawals don't distort performance metrics. Precomputed `AccountReportResult` rows are a cache, not an authoritative source.

**Timezone:** All date/time handling uses Bangkok timezone (Asia/Bangkok, UTC+7). Use helpers from `src/lib/time.ts`. This is critical for correct chart boundaries and trade-time analytics.

**Account ordering:** Balance descending, preserved across breakpoints and orientation changes.

**Financial precision:** Use Prisma `Decimal` for all monetary values in the worker and database layer. Convert to `number` only at the serialization boundary before sending to the client.

## Dashboard Layout Model

- **Desktop:** Overview + stacked account workspaces; analytics rail visible on wider screens
- **Mobile landscape:** Two-zone layout; balance chart dominant; horizontal paging between accounts acceptable
- **Mobile portrait:** Single-column stack; chart above secondary content; KPI chips immediately after chart

**Required KPI chips:** net gain, floating P/L, relative drawdown, margin level, win rate, total trades, open positions.

**Balance chart:** Single continuous line. `D` timeframe uses intraday sparkline anchored to report date with prior-day close as baseline, fixed 0–23 hourly axis in report-local time. Segment color marks balance operations (deposit/withdrawal).

## Key Components

- `DashboardClient.tsx` — Main client component; owns account list state, selected account, timeframe, pull-to-refresh (72px threshold, 116px max), analytics event tracking
- `shared.tsx` — Shared UI: `SparklineChart`, `TimeframeStrip`, `InlineState` skeletons, `TradingMonitorSharedStyles`
- `LoadingScreen.tsx` — Startup splash screen (AI Core aesthetic)
- `SummaryChip.tsx` — KPI chip components
- `OpenPositionsPanel.tsx` — Open positions table
- `TradeHistoryPanel.tsx` — Closed trade history
- `MonthlyPerformanceTable.tsx` — Monthly P&L breakdown
- `PipsPerformanceTable.tsx` — Pips performance by symbol
- `formatters.ts` / `DashboardFormatters.ts` — All number/date formatting helpers
- `useApiResource.ts` — Custom hook for API data fetching with loading/error states

## Environment Variables

See `.env.example` for all variables. Key ones:
- `DATABASE_URL` — PostgreSQL connection string
- `FTP_HOST/PORT/USER/PASS/PATH` — FTP source for report imports
- `WORKER_POLL_MS`, `WORKER_FILE_STABLE_MS`, `WORKER_MIN_FILE_SIZE_BYTES` — Worker tuning
- `NEXT_PUBLIC_MAINTENANCE_MODE` — Enables maintenance mode banner
- `RUN_DB_MIGRATIONS` — Auto-migrate on web container startup

## Agent Workflow Notes

- Before editing, check the worktree — this repo may have unrelated local changes in `apps/mobile/` or elsewhere. Do not revert unrelated changes.
- Dashboard work starts in `src/components/trading-monitor/`, `src/app/globals.css`, and account API routes.
- When modifying responsive behavior, verify desktop AND mobile landscape — not only portrait.
- Keep API and UI terminology aligned.
- Update `AGENTS.md` when dashboard composition, responsive rules, KPI definitions, or API contracts materially change.
- Test file locations: `src/lib/trading/position-metrics.test.ts`, `src/lib/parser/index.test.ts`, `src/components/trading-monitor/DashboardFormatters.test.ts`, `src/lib/time.test.ts`.
