# Trading Monitor Frontend Rebuild Plan

## Summary
- Rebuild the frontend as a dark-mode, mobile-first analytics dashboard optimized for iPhone Safari first and desktop second.
- Remove the global `navTab` model completely. The app has two UI surfaces only:
  - `/` = Dashboard main page
  - `/accounts/[id]` = Separate long-scroll account detail page
- Keep the existing backend APIs unchanged. The rebuild is frontend architecture + UI behavior only.
- Default behavior choices locked from this thread:
  - Dashboard is the main page
  - `Balance` opens the separate account detail page
  - Positions and Trading History live inside the account detail page
  - No separate Accounts screen

## Screen Architecture
- Main page `/`:
  - One vertically stacked Hero Card list on mobile
  - Responsive card grid on desktop
  - No bottom nav, no global screen switcher
  - Each Hero Card contains:
    - first name / account identity
    - growth %
    - account number
    - compact balance/equity sparkline
    - timeframe chips `[D][W][M][Y][A]`
    - KPI chips `[Profit][DD][Win%][Trade]`
    - last-position overlay with breathing animation only when the account is active, guarded by `prefers-reduced-motion`
  - Tap behavior:
    - `Balance` opens `/accounts/[id]`
    - `Growth` opens `/accounts/[id]#growth`
    - `Profit` opens `/accounts/[id]#profit`
    - `DD` opens `/accounts/[id]#risk`
    - `Win%` opens `/accounts/[id]#win`
    - `Trade` opens `/accounts/[id]#activity`
- Account detail page `/accounts/[id]`:
  - Long-scroll layout, not tabs
  - Sticky back control plus a compact section jump rail made from anchors, not tab state
  - Section order:
    - Overview / results in report
    - show chart in $ Balance, Gain, init deposit, Deposit, withdraw 
    - Open Position
    - Working Position
    - Trading History:
      - Vertical scroll list of closed positions
      - One expanded row at a time
      - Buy uses blue, Sell uses red, P/L uses semantic positive/negative colors
      - Missing values always render as `-`

  - Desktop keeps the same content order but can place summary cards/charts in a 2-column layout where it improves density without changing reading order

## Behavior And Data Rules
- Dashboard Hero Card:
  - Chart always uses the selected timeframe’s overview/equity data
  - The KPI values and chart must always move together for the same timeframe
  - The fourth KPI is `Lot`, not `Trades`
- Balance chart on account detail:
  - Single continuous balance line
  - Segment color uses existing semantic colors:
    - normal trading: `#38BDF8`
    - deposit / positive `Type=balance`: `#22C55E`
    - withdrawal / negative `Type=balance`: `#EF4444`
  - Tooltip always shows timestamp, balance, event type, and event amount
  - Use the existing `eventType` / `eventDelta` balance metadata from the equity-detail payload; do not invent a second chart model
- Growth:
  - Growth tap opens the Growth section directly
  - Default Growth presentation is the YTD table in $
  - Table supports multiple yearly rows, horizontal scroll on mobile, empty `-` cells, sticky Year column when available, and summary total in $ below
- Profit:
  - Summary metrics first
  - Sharpe / profit factor / recovery factor as compact gauge bars
  - Ranked symbol-performance list below
- Risk:
  - Drawdown summary first
  - Risk bars use green -> yellow -> red semantics
  - Best/Worst and consecutive metrics are normalized only within each pair
- Win + Activity:
  - Win section owns direction mix, profit/loss mix, and consecutive averages
  - Activity section owns total trades, accumulated lot, trades per week, activity %, algo/manual split
- Trades:
  - Trading summary first
    - total, total in volume, trade per week, trade activities%
    
- States:
  - Keep explicit loading, empty, and error states for every major card/section
  - Use skeletons on main-page cards and major detail charts/sections
