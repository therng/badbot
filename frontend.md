# Frontend Spec

Primary design source is now [`trading_monitor_redesign.html`](./trading_monitor_redesign.html).  
The app should follow this "Financial Noir" visual system by default.

## Runtime Files

- UI logic: [`src/app/page.tsx`](./src/app/page.tsx)
- Global theme/styles: [`src/app/globals.css`](./src/app/globals.css)
- Font wiring: [`src/app/layout.tsx`](./src/app/layout.tsx)

## Financial Noir Tokens

- Core surfaces: `--bg0`, `--bg1`, `--bg2`, `--bg3`
- Primary accent: `--gold` (`#C8A96E`)
- Positive: `--mint` (`#00D4A4`)
- Negative: `--rose` (`#FF6B6B`)
- Secondary info: `--ice` (`#7EB8F7`)
- Typography:
  - serif: `Cormorant Garamond`
  - mono: `Azeret Mono`

## App Structure

- Mobile-first centered app shell
- Fixed bottom nav with 4 tabs: `Dash`, `Live`, `History`, `Accounts`
- Screens:
  - Dashboard (account cards + sparkline + KPI chips + optional YTD table)
  - Detail (profit/risk/win/equity)
  - Positions (open positions + last-position overlay)
  - History (expandable closed trades)
  - Accounts (compact account summary)

## Behavior Rules

- Timeframe is persisted per account (`localStorage`)
- Detail screen inherits account timeframe
- YTD table opens from `Trades` chip and uses `–` for missing values
- History supports one expanded row at a time
- Overlay on Positions remains enabled and inherits Financial Noir colors

## Cleanup Decision

- Older "glass dashboard" / sidebar-oriented documentation is deprecated.
- Any future style updates should start from `trading_monitor_redesign.html` and then be reflected in `globals.css` and `page.tsx`.
