# Trading Monitor Frontend

This frontend is now anchored to [`trading_monitor_v2_dark.html`](./trading_monitor_v2_dark.html) as the visual source of truth.

## Current Source Of Truth

- Prototype reference: [`trading_monitor_v2_dark.html`](./trading_monitor_v2_dark.html)
- Runtime page: [`src/app/page.tsx`](./src/app/page.tsx)
- Runtime styles: [`src/app/globals.css`](./src/app/globals.css)

## App Shell

- Mobile-first single-device shell
- Fixed bottom navigation
- Scrollable content region
- Dark theme only
- Desktop keeps the same centered mobile frame instead of switching to a different dashboard layout

## Screens

### Dashboard

- Stacked account cards
- Per-account timeframe controls: `D`, `W`, `M`, `Y`, `A`
- KPI chip order: `Profit`, `Drawdown`, `Win %`, `Trades`
- Growth sparkline above KPI chips
- `Trades` chip toggles the inline YTD table

### Detail

- Opened from dashboard KPI chips
- Supported detail screens:
  - `Profit detail`
  - `Risk & drawdown`
  - `Win statistics`
  - `Equity detail`
- Detail screen inherits the selected account timeframe

### Positions

- Aggregated open positions across accounts
- Shows symbol, side, volume, open price, market price, and floating P/L

### History

- Aggregated recent closed positions across accounts
- Inline expand/collapse row behavior
- One expanded row at a time

### Accounts

- Compact account list
- Uses the same dark card language as the prototype

## Data Mapping

- `/api/accounts`
  - account shell, account status, account list
- `/api/accounts/:id`
  - dashboard KPI values and growth sparkline
- `/api/accounts/:id/profit-detail`
  - profit detail screen
- `/api/accounts/:id/equity-detail`
  - equity and risk detail screens
- `/api/accounts/:id/win-detail`
  - win statistics screen
- `/api/accounts/:id/growth`
  - YTD table data
- `/api/accounts/:id/positions`
  - positions screen and trading history aggregation

## State Rules

- Selected timeframe is stored per account in `localStorage`
- Detail view uses the same timeframe as its parent account card
- YTD table open/close state is local UI state
- Expanded history row state is local UI state

## Styling Rules

- Use semantic colors from the prototype:
  - positive: `#22C55E`
  - negative: `#EF4444`
  - risk warning: `#F59E0B`
  - accent: `#38BDF8`
- Keep the compact spacing and typography proportions from the prototype
- Prefer the prototype class vocabulary: `app`, `scroll`, `card`, `bnav`, `bni`, `kgrid`, `kchip`
- Avoid reintroducing the previous desktop sidebar or glass-dashboard system unless the product direction changes

## Cleanup Note

Older documentation in this file described a larger desktop-oriented component system with sidebar navigation and a separate design language. That is no longer the active frontend plan. The current implementation should follow the dark monitor prototype above.
