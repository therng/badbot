# Repository Guidelines

## Project Structure & Module Organization
The main web app lives in `src/` and uses the Next.js App Router. UI routes and API handlers are under `src/app/`, shared dashboard components are in `src/components/trading-monitor/`, and trading/domain logic is in `src/lib/trading/` and `src/lib/parser/`. Database schema and migrations live in `prisma/`. Operational scripts are in `scripts/`, static assets in `public/`, and supporting docs/examples in `Docs/`. Mobile experiments live under `apps/mobile/` and are not part of the main web build.

## Build, Test, and Development Commands
- `npm run dev`: start the Next.js app locally.
- `npm run build`: production build; use this as the main verification step before submitting changes.
- `npm run start`: run the standalone production server after a build.
- `npm run lint`: run Next.js ESLint checks.
- `npm run build:worker`: bundle the worker from `src/worker/index.ts`.
- `npm run worker:dev`: run the worker with `ts-node`.
- `npm run db:backfill-report-results`: recompute stored report result rows.
- `npm run db:clean`: run the cleanup script against local data.

## Coding Style & Naming Conventions
Use TypeScript for app and script changes where possible. Follow the existing style: 2-space indentation, semicolons, double quotes, and `@/` path aliases. Keep React components and exported types in `PascalCase`; functions, hooks, and variables use `camelCase`; route folders follow Next.js conventions such as `src/app/api/accounts/[id]/route.ts`. Prefer small, data-driven UI helpers over duplicated markup.

## Testing Guidelines
There is no dedicated automated test suite configured today. Treat `npm run build` and `npm run lint` as the required baseline checks. For data or parser changes, also run the relevant script against representative files, for example `npm run parse:mt5-report -- path/to/report.html`. If you add tests later, place them close to the feature or under a clear `__tests__` folder and use `*.test.ts` naming.

## Commit & Pull Request Guidelines
Recent history is mixed, but descriptive imperative commits are the safest pattern. Prefer messages like `fix: stabilize win stats across timeframes` over vague subjects like `fix bug`. Keep PRs focused, explain user-visible impact, note schema or script changes, and include screenshots for dashboard/UI work. Link the relevant issue or task when available and list the verification commands you ran.

## Security & Configuration Tips
Do not commit `.env` values, database secrets, or imported report data. Review Prisma migrations before applying them, and avoid destructive cleanup commands against shared environments. When changing parsers or backfill scripts, document expected inputs and rollback considerations in the PR.
