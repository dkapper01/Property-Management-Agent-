# Property Management Agent

A property management system for small portfolios (1–20 units) with AI agent integration via the Model Context Protocol (MCP). Track properties, maintenance, leases, finances, and documents in a unified timeline — and let AI agents propose changes through a human-in-the-loop approval workflow.

## Features

- **Property Portfolio** — Manage properties with purchase history, ownership type (Individual / LLC / Partnership), and status tracking (Owner-Occupied / Rented / Vacant / Renovating).
- **Maintenance Tracking** — Log maintenance events with severity levels, cost tracking, and linked assets and vendors.
- **Lease Management** — Track tenants, rent amounts, security deposits, and lease terms.
- **Financial Entries** — Record income, expenses, mortgage payments, insurance, taxes, and more across your portfolio.
- **Asset Inventory** — Catalog roofs, HVAC systems, water heaters, appliances, and other assets with install dates and warranty info.
- **Document Storage** — Upload and organize leases, inspections, insurance policies, and warranties with AI-generated summaries.
- **Vendor Directory** — Maintain a list of contractors and service providers with contact info and categories.
- **Unified Timeline** — View all property-related events chronologically in one feed.
- **AI Agent Integration** — External AI systems can read data and propose changes through 30+ MCP tools, with drafts requiring human approval before being applied.
- **Audit Logging** — Full audit trail of all changes with before/after state snapshots.
- **Role-Based Access** — Support for owner, manager, agent, and ai-agent roles with granular permissions.
- **Authentication** — Email/password, GitHub OAuth, passkeys (WebAuthn), and two-factor authentication.

## Tech Stack

| Layer       | Technology                                    |
| ----------- | --------------------------------------------- |
| Framework   | React Router v7 (SSR)                         |
| UI          | React 19, Tailwind CSS v4, Radix UI           |
| Language    | TypeScript                                    |
| Server      | Express.js, Node.js 22+                       |
| Database    | SQLite via Prisma ORM                          |
| Auth        | Remix Auth, SimpleWebAuthn, bcrypt            |
| Validation  | Zod, Conform                                  |
| AI/Agent    | MCP (Model Context Protocol), JSON-RPC 2.0   |
| Storage     | Tigris / S3-compatible object storage          |
| Monitoring  | Sentry                                        |
| Testing     | Vitest, Playwright, Testing Library           |
| Build       | Vite                                          |

## Getting Started

### Prerequisites

- Node.js 22+
- npm

### Installation

```sh
npm install
```

### Environment Variables

Copy the example env file and fill in your values:

```sh
cp .env.example .env
```

Key variables:

| Variable                  | Description                              |
| ------------------------- | ---------------------------------------- |
| `DATABASE_URL`            | SQLite connection string                 |
| `SESSION_SECRET`          | Secret for session encryption            |
| `RESEND_API_KEY`          | API key for transactional email (Resend) |
| `GITHUB_CLIENT_ID`        | GitHub OAuth app client ID               |
| `GITHUB_CLIENT_SECRET`    | GitHub OAuth app client secret           |
| `MCP_DEV_TOKEN`           | Optional token for MCP auth without a browser session |
| `AWS_ACCESS_KEY_ID`       | Object storage access key                |
| `AWS_SECRET_ACCESS_KEY`   | Object storage secret key                |
| `AWS_ENDPOINT_URL_S3`     | S3-compatible endpoint URL               |
| `BUCKET_NAME`             | Storage bucket name                      |

### Setup

Build the app, run database migrations, and install Playwright browsers:

```sh
npm run setup
```

### Seed the Database

```sh
npx prisma db seed
```

This creates sample data including properties, maintenance events, leases, financial entries, and users with different roles.

### Development

Start the dev server with mocks enabled:

```sh
npm run dev
```

Or without mocks:

```sh
npm run dev:no-mocks
```

### Production

```sh
npm run build
npm run start
```

## MCP Integration

The app exposes an MCP endpoint at `/resources/mcp` that accepts JSON-RPC 2.0 requests. AI agents can use 30+ tools to read property data and propose changes through the draft system.

**Read tools** — `property_list`, `property_get`, `maintenance_list`, `timeline_list`, and more.

**Write tools** — `draft_create_maintenance`, `draft_create_note`, `draft_create_financial_entry`, etc. All writes go through the draft approval workflow.

Agents are assigned the `ai-agent` role with read access and limited create permissions. They cannot directly modify data — all proposed changes must be reviewed and approved by a human.

Authenticate MCP requests with either a browser session cookie or the `MCP_DEV_TOKEN` environment variable.

## Scripts

| Script              | Description                                |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Start dev server with mocks                |
| `npm run build`     | Production build                           |
| `npm run start`     | Start production server                    |
| `npm run setup`     | Build + migrate + generate Prisma + install Playwright |
| `npm run test`      | Run unit tests (Vitest)                    |
| `npm run test:e2e`  | Run E2E tests (Playwright UI)              |
| `npm run lint`      | Lint with ESLint                           |
| `npm run typecheck` | Type-check with TypeScript                 |
| `npm run format`    | Format with Prettier                       |
| `npm run validate`  | Run tests, lint, typecheck, and E2E in parallel |
