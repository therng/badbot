# Frontend Specification

Version: 2.0
Status: aligned with current dashboard implementation
Project: badBot trading account monitor

This document replaces the older card-grid spec. The current product direction is a command-center dashboard with a treemap overview, stacked account workspaces, and a responsive layout optimized for desktop and mobile landscape.

## 1. Product Goal

The frontend should help an operator scan multiple MT5 accounts quickly, identify which account carries the most balance exposure, and move from overview to account-level analysis without leaving the main dashboard.

The page should prioritize:

- orientation first
- chart visibility second
- metrics and report context third

This is an operational surface, not a marketing page.

## 2. Target Platforms

Primary target:

- Desktop web, especially widths where multiple regions can be visible at once

Secondary targets:

- Mobile landscape
- Tablet landscape
- Mobile portrait as a compact fallback

Browser support:

- Latest Chrome, Edge, and Safari
- iOS Safari 16.4+ for PWA support

## 3. High-Level Layout

The dashboard is composed of three major layers.

### 3.1 Command Band

The top section provides immediate orientation for the entire dashboard.

Required content:

- dashboard title
- short explanatory copy
- total account count
- total live account count
- total book balance
- total equity
- total floating P/L
- average margin level
- latest sync timestamp

Purpose:

- establish what the screen is
- confirm data freshness
- summarize the portfolio in one scan

### 3.2 Exposure Map

The second section is a treemap-led overview of connected accounts.

It contains:

- a treemap where tile size follows account balance
- a roster panel listing accounts in layout order

Treemap tile content:

- account owner name
- account number
- broker/server label
- compact balance value
- floating P/L
- live or idle status

Purpose:

- surface the largest accounts first
- show exposure concentration visually
- make floating stress or strength visible through semantic tone

### 3.3 Account Workspace Stack

Below the exposure map, each account is rendered as a full-width workspace section rather than a small dashboard card.

Each account section contains:

- account identity and status
- balance headline
- period growth headline
- balance chart as the main visual surface
- timeframe selector
- KPI chips
- account snapshot metrics
- top live symbols list
- desktop analytics rail

The chart must remain the dominant element in each account section.

## 4. Responsive Behavior

### 4.1 Desktop

Recommended behavior:

- command band uses a wide split layout: copy on the left, summary stats on the right
- exposure map uses treemap on the left and roster on the right
- account workspace uses chart pane on the left and context pane on the right
- desktop analytics rail is visible

Design goal:

- keep overview and context visible at the same time
- avoid a card mosaic layout

### 4.2 Mobile Landscape

Mobile landscape is a priority mode, not an afterthought.

Required behavior:

- keep the command band readable in two columns when space allows
- preserve the treemap as a major visual block
- keep chart pane and context pane side by side if the width can support it
- hide or reduce non-essential desktop-only report rails when space becomes tight

Design goal:

- landscape should feel like a compressed workstation, not a stretched portrait screen

### 4.3 Mobile Portrait

Portrait is the compact fallback.

Required behavior:

- stack all major regions vertically
- reduce chart height
- convert dense metric grids to one-column or two-column lists
- preserve readability of labels and numbers

Design goal:

- keep the hierarchy intact even when the layout becomes single-column

## 5. Account Ordering

The dashboard overview should rank accounts by balance descending.

This order is used in:

- treemap placement
- roster listing
- account workspace sequence

The largest account should appear first and should be visually dominant in the exposure map.

## 6. Balance Chart Rules

The balance chart is derived from the balance curve of the selected account and timeframe.

### 6.1 Timeframe Options

Supported options:

- 1D
- 5D
- 1M
- 3M
- 6M
- 1Y
- All

Each account selects timeframe independently.

### 6.2 Chart Behavior

The chart must remain a single continuous balance line.

When the current point represents a balance operation event, the segment color changes to communicate the event type:

- normal trading movement: default chart tone
- balance event with positive delta: deposit tone
- balance event with negative delta: withdrawal tone

Balance event types may include:

- deposit
- withdrawal
- credit
- correction
- other broker balance operations

These events should not be interpreted as normal trade profit or loss.

### 6.3 Live Highlight

If a live balance timestamp exists and is newer than the last historical point, the chart may append a live point so the account view reflects the most recent snapshot.

## 7. KPI and Snapshot Rules

### 7.1 KPI Chips

The KPI chip rail is designed for fast comparison inside one account workspace.

Required KPIs:

- net gain
- drawdown
- win rate
- total trades
- open positions

The values should use compact formatting where appropriate.

### 7.2 Snapshot Metrics

The snapshot panel provides current-state account information.

Required metrics:

- equity
- floating P/L
- margin level
- account currency

### 7.3 Top Symbols

The live symbol list is derived from current open positions.

Aggregation rule:

- group open positions by symbol
- count positions per symbol
- sum floating P/L per symbol
- sort by absolute floating P/L descending
- show only the top few items in the summary list

Purpose:

- show where live exposure currently sits without opening the full positions table

## 8. Desktop Analytics Rail

The desktop analytics rail extends each account workspace with secondary report content. It is visible on wider screens and can be hidden on constrained layouts.

The rail contains the following sections.

### 8.1 Gain Stack

- gross profit
- gross loss
- commission
- swap
- deposits
- withdrawals

### 8.2 Drawdown Stack

- absolute drawdown
- maximal drawdown
- relative drawdown
- average loss trade
- maximal consecutive loss
- deposit load

### 8.3 Win Stack

- short trade win percentage
- long trade win percentage
- largest profit trade
- largest loss trade
- maximum consecutive wins
- maximum consecutive losses
- maximum consecutive profit amount

### 8.4 Trade Stack

- trade activity percentage
- trades per week
- average hold time
- expected payoff
- profit factor
- recovery factor
- sharpe ratio

The three score metrics should use semi-circle gauges.

### 8.5 Growth Matrix

The growth matrix is a year-by-month table.

Required behavior:

- rows represent calendar years
- columns represent months
- each row ends with a year total
- sticky year and sticky year total are preferred when space allows

### 8.6 Live Opens

The live opens table shows current open positions.

Required columns:

- row number
- open time
- symbol
- side
- open price
- SL
- TP
- market price
- commission
- swap
- floating profit
- comment

Default ordering:

- most recent open first, if data arrives that way

## 9. Growth Calculation

Growth should follow MQL5-style logic so deposits and withdrawals do not distort performance.

Concept:

- the account history is broken into segments by balance operations
- each segment has its own opening balance
- performance is compounded across segments

Reference algorithm:

```text
initial_deposit = first non-zero funding balance
current_segment_opening_balance = initial_deposit
K = 1

for each segment separated by balance operations:
  segment_ratio = closing_balance_before_operation / current_segment_opening_balance
  K = K * segment_ratio
  current_segment_opening_balance = balance_after_operation

growth_pct = (K - 1) * 100
```

Rules:

- deposits and withdrawals are excluded from performance
- if no balance operations exist, simple opening-to-closing growth can be used
- zero opening balance segments are invalid and should be skipped with a warning

## 10. States

### 10.1 Loading

Loading should use section skeletons that preserve the final layout shape:

- command band skeleton
- overview skeleton
- account workspace skeleton

### 10.2 Empty

Empty states should be explicit and operational.

Examples:

- no accounts connected
- no live positions
- no growth matrix yet

### 10.3 Error

Errors should appear inline within the affected region rather than replacing the entire page.

Examples:

- accounts unavailable
- account card unavailable
- desktop report unavailable

## 11. Pull to Refresh

On touch devices, the dashboard supports pull to refresh.

Behavior:

- pull gesture starts only when the scroll position is at the top
- a refresh indicator appears above the scroll content
- releasing after the threshold triggers a refresh of the list and account overview requests
- the indicator remains visible briefly so the refresh feedback is perceptible

## 12. Visual System

The current visual direction is a modern dark command surface.

Core rules:

- dark graphite shell
- cool blue and mint accents
- restrained scanline or grid texture
- strong typography hierarchy
- monospace for labels and numeric utility text
- semantic tone for positive, negative, warning, and neutral values

Avoid:

- bright decorative gradients behind routine data
- generic dashboard card mosaics
- excessive borders around every minor element
- marketing copy inside operational panels

## 13. Data Contract Notes

Canonical frontend assumptions:

1. The main dashboard reads the account list from `/api/accounts`.
2. Each account workspace reads account-level overview data from `/api/accounts/[id]?timeframe=...`.
3. Current-state widgets use live account fields and open position snapshots.
4. Growth, profit, drawdown, and win analytics are derived from positions and deals for the selected timeframe.
5. Precomputed report-result tables should not replace source-derived analytics if the source data is available.

## 14. Documentation Intent

This document is intended to describe the current product direction and implementation target.

If the UI changes materially, update this file first in these areas:

- command band content
- responsive breakpoints and behavior
- treemap sizing or coloring logic
- account workspace composition
- analytics rail sections
