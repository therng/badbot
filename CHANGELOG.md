# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.2.0] - 2026-05-13

### Added
- Added long-press guidance for DD panel gauges and refreshed loading/performance hints across the dashboard. ([PR #39](https://github.com/therng/analytic/pull/39))

### Changed
- Sorted accounts by weekly growth performance so the strongest accounts surface first.
- Updated heatmap day labels to M/W/F. ([PR #40](https://github.com/therng/analytic/pull/40))
- Simplified the sparkline live beacon to a single ring with a natural heartbeat blink. ([PR #41](https://github.com/therng/analytic/pull/41), [PR #43](https://github.com/therng/analytic/pull/43))
- Muted inactive account names and chart lines for cleaner focus. ([PR #45](https://github.com/therng/analytic/pull/45))

### Fixed
- Kept the chart tooltip visible on desktop click. ([PR #44](https://github.com/therng/analytic/pull/44))
- Tightened open-position expanded-row typography and comment alignment.
- Updated the app version to 6.2.

## [6.0.0] - 2026-05-06

### Changed
- Redesigned KPI and Performance Quality hints as Preview Cards with zoom transitions.
- Redesigned Open Positions row layout with expandable details (S/L, T/P, Comments).
- Optimized Loading Screen candle animation (faster loop cycle).
- Refactored Loading Screen component for better performance.
- Fixed Pips Performance Table to be non-scrollable for better visibility.

### Fixed
- Fixed missing 'memo' import in Performance Quality Panel.
- Resolved Next.js build cache corruption issues.

### Added
- Standard documentation files (CONTRIBUTING, CHANGELOG).

### Fixed
- Fixed Safari Safe Area display issues on the Stats page.
