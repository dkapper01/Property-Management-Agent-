# Property Owner Second Brain

An AI‑native property memory system for small property owners (1–20 units). This is **not** a traditional property management suite. The web app is intentionally minimal and text‑forward; the primary interaction surface is MCP clients (ChatGPT, Claude, etc.) that ingest unstructured inputs and propose structured updates for human approval.

## Product Intent
- Timeline‑first memory for each property
- Markdown‑native notes with tags and backlinks
- Human‑approved DraftChanges (AI can propose, never mutate)
- Full audit history for every mutation
- Calm, Obsidian‑like UI: minimal forms, no dashboards

### Non‑Goals (V1)
- Accounting platform
- Workflow automation or queues
- Vendor marketplace
- Complex tenant CRM
- Predictive scoring or automation

## Core Concepts
- **DraftChange**: AI proposes structured changes; humans approve.
- **TimelineEvent**: Every meaningful change becomes a timeline entry.
- **AuditLog**: Immutable history of every mutation.
- **EntityNote**: Markdown narrative layer for decisions and context.

## Tech Stack
- React Router v7
- Prisma ORM
- SQLite (dev and Fly via LiteFS)
- Tailwind CSS
- MCP JSON‑RPC tool layer

## Data Model (V1)
Entities: Workspace (Organization), Property, Lease, Asset, MaintenanceEvent, FinancialEntry, Document, EntityNote, DraftChange, TimelineEvent, AuditLog.

## Local Development
1. Install deps:
```bash
npm install
```

2. Run dev server (with mocks):
```bash
npm run dev
```

3. Seed data:
```bash
npx prisma db seed
```

## MCP Smoke Test
```bash
MCP_DEV_TOKEN=... MCP_USER_ID=... npm run mcp:smoke
```

## Draft Approval Flow (What happens on approve)
1. Draft operations are validated and applied in a transaction.
2. Each mutation writes an AuditLog.
3. Each mutation emits a TimelineEvent.
4. Draft status becomes `APPLIED`.

## Useful Commands
```bash
npm run dev
npm run dev:no-mocks
npm run build
npm run start
npm run test
npm run test:e2e:run
npm run typecheck
```

## Environment Variables (dev)
See `.env.example` for required variables.

## Deploy (Fly.io)
See `docs/deployment.md` for the full Fly.io production + staging checklist.

## Repository Structure (high‑level)
- `app/` – UI, routes, loaders/actions
- `prisma/` – schema + seed
- `app/utils/` – data access, audit, timeline, MCP server
- `docs/` – product and technical docs

---
If you’re evaluating scope alignment, this project is intentionally narrow: **memory, timeline, and audited AI proposals** — not workflow software.
