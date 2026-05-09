# Riffy

A dashboard + MCP server pair that helps small marketing agencies fold Claude into their daily operations without losing project context.

See [`docs/design.md`](docs/design.md) for the full vision and architecture.

## Status

🚧 **Milestone 0 — Scaffold + tenancy.** Bones only; no auth wired yet.

## Repo layout

```
apps/
  web/         Vite + React + Tailwind dashboard
packages/
  db/          Drizzle schema + migrations (Postgres / Supabase)
  shared/      Zod schemas + domain types
  trpc/        tRPC routers (consumed by web; later: mcp)
docs/          design.md (the source of truth)
```

## Local quickstart

```bash
pnpm install
pnpm typecheck    # all packages must pass
pnpm dev          # boots the web app on http://localhost:5173
```

You'll need a `.env` (see `.env.example` once it exists) with a `DATABASE_URL` pointing at a Postgres instance.

## Conventions

- pnpm workspaces, single `tsconfig.base.json`
- Drizzle for DB; migrations live in `packages/db/migrations/`
- All money amounts are `(amount_decimal, currency_code)` — see D-17
- Multi-tenancy: every business table has `org_id NOT NULL`; every tRPC procedure scopes by it (`orgScopedProcedure` in `packages/trpc`)

## Doc-first workflow

Big decisions are captured in [`docs/design.md`](docs/design.md). Update the doc *with* the code change, not after.
