# CLAUDE.md

Conventions for Claude sessions in the Beamy repo. Anything generic belongs in `~/.claude/CLAUDE.md`.

## Where Beamy came from

Beamy is a fork of [Riffy](../riffy) — same chassis (multi-tenancy, tRPC tiers, audit, money, workflow plan), different domain. Riffy targets marketing agencies; Beamy targets **construction & design agencies** (projects, vendors, RFIs, submittals, change orders, FF&E, budgets/draws, etc.).

The architectural invariants below carry over verbatim. The domain model in `docs/design.md` is the original Riffy spec, preserved as a pattern reference until the Beamy domain rewrite lands.

## Read first

- **Vision + architecture:** [`docs/design.md`](docs/design.md) — has a "DOMAIN PIVOT" header noting which sections (mental model, data model, decisions log entries about brand) are being replaced. Architectural sections (tenancy, tRPC tiers, audit, money) carry over unchanged.
- **Current state:** scaffold inherited from Riffy at commit `3904b53` (M0 monorepo + tenancy primitives). No auth wired, no migrations applied yet.

The doc is the spec. If code and doc disagree, fix one — don't let them drift.

## Repo layout

```
apps/
  web/              Vite + React 19 + TS + Tailwind dashboard
packages/
  db/               Drizzle schema + migrations (Postgres / Supabase)
  shared/           Zod schemas + domain types
  trpc/             tRPC routers — orgScopedProcedure middleware lives here
  (later) workflow/ Workflow runner + step types
  (later) <domain/> Domain package(s) — names TBD when spec lands (probably project, vendor, etc.)
docs/               design.md (the spec — Riffy original + pending Beamy rewrite)
```

The `mcp/` app and the `workflow/` package don't exist yet. Domain packages will land once the Beamy spec rewrite is done.

## Daily commands

| Command | What |
| --- | --- |
| `pnpm dev` | Boot the web app on http://localhost:5173 (`pnpm` filter into `@beamy/web`). |
| `pnpm typecheck` | Recursive typecheck across all packages. **Run before committing.** |
| `pnpm db:generate` | `drizzle-kit generate` — emits a new SQL migration from schema files. Reads `DATABASE_URL`. |
| `pnpm db:migrate` | Apply pending migrations against `DATABASE_URL`. Reads `.env`. |

## Architectural invariants (don't break)

These carry over from Riffy unchanged — they're the chassis, not the domain.

- **Multi-tenancy.** Every business table has `org_id NOT NULL`. Every tRPC procedure that touches business data uses `orgScopedProcedure` (in [`packages/trpc/src/init.ts`](packages/trpc/src/init.ts)) — which auto-resolves `(user_id, org_id)` from the auth context. Do NOT write raw queries that ignore `ctx.orgId`. Do NOT add a procedure on `protectedProcedure` for tenant-data access — that path is for org-creation/invite-redemption only. (D-10)

- **Single user → single org in v1.** The schema enforces this with a unique index on `org_memberships.user_id`. Don't loosen it. (D-12)

- **Money is always `(amount, currency_code)`.** Construction is money-heavy (budgets, contracts, draws, change orders) so this matters more here than it did in Riffy. Whenever you add a money column, it comes paired with a currency column. (D-17)

- **Audit attribution via `actor` strings.** Format: `user:<uuid>` / `agent:claude` / `webhook:<src>`. The tRPC context computes this automatically; pass it through to any helper that writes to `audit_log`.

- **Agent writes go through a review queue, never directly.** Riffy's pattern was `brand_change_proposals`; Beamy will have its own equivalents (probably `spec_change_proposals`, `change_order_proposals`, etc.). The pattern stays: agents propose, humans approve, then it lands. (D-8)

- **Structured intake is a workflow.** Whatever the construction/design equivalent of "brand intake" is (program brief? scope of work? FF&E intake?), it runs through the same workflow engine — don't build a parallel onboarding flow. (D-14)

- **HITL UI is the dashboard, deep-linked from Claude.** No forms in MCP tool responses, no artifact-based intake in v1. (D-15)

- **Single `prompt_templates` and `workflow_definitions` tables, scope-discriminated.** Both use `scope ('company' | 'project')` + nullable `project_id`. No parallel project-scoped tables. (D-18)

## tRPC procedure tiers

```
publicProcedure         no auth required (ping, etc.)
protectedProcedure      requires authenticated user (sign-up, accept-invite)
orgScopedProcedure      requires user + org membership; injects orgId + role  ← default
```

99% of procedures should be on `orgScopedProcedure`. Promote up the tiers only when you have a concrete reason.

## Sign-up & auth (when wiring it)

- Auth is Supabase JWT (Bearer token in Authorization header). The tRPC handler in Vite middleware should validate it and call `buildContext({ userId })`.
- Sign-up = `protectedProcedure.mutation` that creates the `orgs` row + `org_memberships(role: "owner")` row in one transaction. The `users` row is implicit (Supabase Auth manages it).
- Invite redemption = `protectedProcedure.mutation` that consumes a token from `invitations` and creates an `org_memberships(role: <invitation.role>)` row.

## PR conventions

- **Branch:** `feat/<short-name>` or `docs/<short-name>`.
- **Layer-respecting commits** when a change spans data + transport + UI: `feat(db)` (schema + migration) → `feat(shared,trpc)` (zod + router) → `feat(web)` (UI). One commit if it lives in one layer.
- Don't commit migrations without committing the schema file that generated them. Drift here propagates fast.

## Gotchas (live)

- **Drizzle schema changes require regenerating the migration AND restarting the dev server.** The schema is bundled at boot; HMR doesn't repick up new columns. Symptom is `column "X" does not exist` after a migration that ran.
- **`.env.example` has both `DATABASE_URL` (port 6543, pooler) AND will need `DATABASE_URL_DIRECT` (port 5432) eventually** for Drizzle's migrator advisory locks. Add the direct URL when you set up Supabase.
- **The launch.json at `.claude/launch.json`** is the only one you need — it serves the cwd. Don't add cd-shims.

## What's not in scope yet

- No MCP server (Riffy's M3) — Beamy will have one but design pending
- No workflow engine (Riffy's M4)
- No background job queue (synchronous workflow runner)
- Cross-org users are deferred (1 user → 1 org in v1)
- **The Beamy domain spec itself** — `docs/design.md` is still the Riffy spec. Construction/design domain rewrite is the immediate next milestone after this scaffold lands.

## Memory + handoffs

When asked to leave a note for the next session, save under `~/.claude/projects/-Users-adrianbazbaz-CursorProjects-beamy/memory/` and add a one-liner pointer to `MEMORY.md`. (Beamy's memory directory will be auto-created on first save.)
