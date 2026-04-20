# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`analytic` is a Next.js trading account monitor for MT5-style account data. It is an operational dashboard — not a marketing site — built to help operators quickly identify which accounts matter most, track balance/equity curves, and drill into performance without losing context.

## Core Commands

```bash
npm run dev              # Run dashboard locally
npm run build            # Required baseline verification for app changes
npm run lint             # ESLint checks (Next.js defaults)

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

**Verification:** No automated test suite yet. `npm run build` and `npm run lint` are the baseline. For parser, analytics, or import changes, also run the relevant script against representative data.

## Architecture

**Stack:** Next.js 15 App Router + React 18, Prisma 6 + PostgreSQL 15, background worker (esbuild-bundled Node.js), Caddy reverse proxy.

**Key directories:**
- `src/app/` — App Router pages, layouts, API routes
- `src/components/trading-monitor/` — Dashboard UI, formatters, account card logic
- `src/lib/trading/` — Analytics, preaggregated cache views, account helpers
- `src/lib/parser/` — MT5 HTML report parsing and normalization
- `src/worker/` — Background FTP import and recompute worker
- `prisma/` — Schema and migrations
- `scripts/` — Operational scripts (cleanup, backfill, parse)
- `apps/mobile/` — Legacy/mobile experiments; not part of the main web build

**API routes follow:** `src/app/api/accounts/[id]/route.ts` convention. All account-level endpoints support `?timeframe=all|1d|7d|30d`.

**Docker Compose stack:** `db` (postgres:15) → `web` (Next.js, runs migrations when `RUN_DB_MIGRATIONS=true`) → `worker` → `caddy`.

## Data Model

Core tables:
- `TradingAccount` — Account metadata
- `AccountSnapshot` — Current state (balance, equity, margin, floating P/L)
- `AccountReportResult` — Precomputed performance metrics (profit factor, Sharpe, drawdown, win stats)
- `Position` — Closed positions; source for win rate, profit factor, trade counts
- `Deal` — All transactions; source for balance curve, growth, drawdown, intraday D-timeframe
- `OpenPosition` — Active positions; source for floating P/L and open exposure
- `ReportImport` — Import tracking with file hash deduplication

**Source boundaries (critical):**
- Win rate, profit factor, Sharpe, expected payoff, trade streaks → `Position`
- Balance curve, growth, drawdown → `Deal`
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

**Account ordering:** Balance descending, preserved across breakpoints and orientation changes.

## Dashboard Layout Model

- **Desktop:** Overview + stacked account workspaces; analytics rail visible on wider screens
- **Mobile landscape:** Two-zone layout; balance chart dominant; horizontal paging between accounts acceptable
- **Mobile portrait:** Single-column stack; chart above secondary content; KPI chips immediately after chart

**Required KPI chips:** net gain, floating P/L, relative drawdown, margin level, win rate, total trades, open positions.

**Balance chart:** Single continuous line. `D` timeframe uses intraday sparkline anchored to report date with prior-day close as baseline, fixed 0–23 hourly axis in report-local time.

## Agent Workflow Notes

- Before editing, check the worktree — this repo may have unrelated local changes in `apps/mobile/` or elsewhere. Do not revert unrelated changes.
- Dashboard work starts in `src/components/trading-monitor/`, `src/app/globals.css`, and account API routes.
- When modifying responsive behavior, verify desktop AND mobile landscape — not only portrait.
- Keep API and UI terminology aligned.
- Update `AGENTS.md` when dashboard composition, responsive rules, KPI definitions, or API contracts materially change.
