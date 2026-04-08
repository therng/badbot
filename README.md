# Trading Analytics Dashboard

This is a Next.js application that provides a dashboard for analyzing trading account performance. It uses Prisma to connect to a PostgreSQL database, a background worker to import trading data, and a React-based frontend to display the analytics.

## Getting Started

### Prerequisites

- Node.js (v20.x or later)
- npm
- Docker and Docker Compose

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd analytic
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Copy the `.env.example` file to `.env` and fill in the required values, especially the `DATABASE_URL`.
    ```bash
    cp .env.example .env
    ```

4.  **Start the database:**
    The project uses a PostgreSQL database managed with Docker Compose.
    ```bash
    docker-compose up -d
    ```

5.  **Run database migrations:**
    ```bash
    npx prisma migrate dev
    ```

6.  **Run the development server:**
    ```bash
    npm run dev
    ```

The application should now be running at [http://localhost:3000](http://localhost:3000).

## Architecture

The application is composed of several key parts:

-   **Frontend:** A Next.js/React application that provides the user interface for the dashboard.
-   **Backend:** A set of API routes built with Next.js API routes that serve data to the frontend.
-   **Database:** A PostgreSQL database with a schema managed by Prisma.
-   **Background Worker:** A separate process responsible for fetching and parsing trading reports and importing them into the database.

### Frontend

The frontend is located in `src/app` and `src/components`.

-   `src/app/page.tsx`: The main entry point for the application.
-   `src/components/trading-monitor/DashboardClient.tsx`: The main client-side component that fetches and displays all the trading data. It's a complex component that manages a lot of state and handles user interactions.
-   `src/components/trading-monitor/shared.tsx`: Contains shared components used across the dashboard.
-   `src/components/trading-monitor/formatters.ts`: A collection of utility functions for formatting data for display.

### Backend API

The backend API is located in `src/app/api`. It's built using Next.js API routes.

-   `/api/accounts`: Fetches a list of all trading accounts.
-   `/api/accounts/[id]`: Fetches a detailed overview for a specific account.
-   `/api/accounts/[id]/balance-detail`: Fetches balance and drawdown details.
-   `/api/accounts/[id]/profit-detail`: Fetches detailed profit and loss information.
-   `/api/accounts/[id]/win-detail`: Fetches win rate and related statistics.
-   `/api/accounts/[id]/positions`: Fetches open and historical positions.

The API uses a caching layer (`src/lib/trading/preaggregated-cache.ts`) to improve performance.

### Database

The database schema is defined in `prisma/schema.prisma`. It's a PostgreSQL database, and Prisma is used as the ORM. The schema includes tables for:

-   `TradingAccount`
-   `AccountReportResult`
-   `AccountSnapshot`
-   `OpenPosition`
-   `Position`
-   `Deal`
-   `ReportImport`

### Background Worker

The background worker is located in `src/worker/index.ts`. It's responsible for:

1.  Connecting to an FTP server to download trading reports.
2.  Parsing the HTML reports using `cheerio`.
3.  Storing the parsed data in the PostgreSQL database.

The worker can be run in a few different modes, as defined in the `scripts` section of `package.json`.

## API Reference

### `GET /api/accounts`

-   **Description:** Retrieves a list of all trading accounts.
-   **Response:**
    ```json
    [
      {
        "id": "...",
        "account_number": "...",
        "owner_name": "...",
        ...
      }
    ]
    ```

### `GET /api/accounts/[id]?timeframe=<all|1d|7d|30d>`

-   **Description:** Retrieves a detailed overview for a specific account.
-   **Parameters:**
    -   `id` (required): The ID of the trading account.
    -   `timeframe` (optional): The timeframe for the data. Defaults to `all`.
-   **Response:** A JSON object containing KPIs, balance curve data, and open positions.

### `GET /api/accounts/[id]/balance-detail?timeframe=<...>`

-   **Description:** Retrieves balance and drawdown details for a specific account.
-   **Response:** A JSON object with detailed drawdown and deposit load statistics.

### `GET /api/accounts/[id]/profit-detail?timeframe=<...>`

-   **Description:** Retrieves detailed profit and loss information for a specific account.
-   **Response:** A JSON object with a summary of commissions, swaps, deposits, and withdrawals.

### `GET /api/accounts/[id]/win-detail?timeframe=<...>`

-   **Description:** Retrieves win rate and related statistics for a specific account.
-   **Response:** A JSON object with statistics on short/long trade win rates, largest profit trade, and consecutive wins.

### `GET /api/accounts/[id]/positions?timeframe=<...>`

-   **Description:** Retrieves open and historical positions for a specific account.
-   **Response:** A JSON object containing lists of open and historical positions.
