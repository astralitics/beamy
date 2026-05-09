# CLAUDE.md

Conventions for Claude sessions in the Riffy repo. Anything generic belongs in `~/.claude/CLAUDE.md`.

## Read first

- **Vision + architecture:** [`docs/design.md`](docs/design.md) — source of truth. Sections worth pinning: §4 mental model, §5 data model, §13 decisions log (D-1 through D-18), §15 onboarding flows.
- **Current state:** initial scaffold landed at commit `3904b53`. Milestone 0 is in progress; auth + the first migration are not yet wired (see §11 roadmap).

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
  (later) brand/    Brand schema + validation
docs/               design.md (the spec)
```

The `mcp/` app and the `workflow/` + `brand/` packages don't exist yet — they land in Milestones 3, 4, 6 respectively.

## Daily commands

| Command | What |
| --- | --- |
| `pnpm dev` | Boot the web app on http://localhost:5173 (`pnpm` filter into `@riffy/web`). |
| `pnpm typecheck` | Recursive typecheck across all packages. **Run before committing.** |
| `pnpm db:generate` | `drizzle-kit generate` — emits a new SQL migration from schema files. Reads `DATABASE_URL`. |
| `pnpm db:migrate` | Apply pending migrations against `DATABASE_URL`. Reads `.env`. |

## Architectural invariants (don't break)

- **Multi-tenancy.** Every business table has `org_id NOT NULL`. Every tRPC procedure that touches business data uses `orgScopedProcedure` (in [`packages/trpc/src/init.ts`](packages/trpc/src/init.ts)) — which auto-resolves `(user_id, org_id)` from the auth context. Do NOT write raw queries that ignore `ctx.orgId`. Do NOT add a procedure on `protectedProcedure` for tenant-data access — that path is for org-creation/invite-redemption only. (D-10)

- **Single user → single org in v1.** The schema enforces this with a unique index on `org_memberships.user_id`. Don't loosen it. (D-12)

- **Money is always `(amount, currency_code)`.** Whenever you add a money column, it comes paired with a currency column. Storing amounts as plain numbers is a v1 invariant violation. (D-17)

- **Audit attribution via `actor` strings.** Format: `user:<uuid>` / `agent:claude` / `webhook:<src>`. The tRPC context computes this automatically; pass it through to any helper that writes to `audit_log`. (Mirrors Cadenza's pattern.)

- **Brand writes from agents go through a review queue.** Use the `brand_change_proposals` table; never write `project_brand` directly from an MCP tool. (D-8)

- **Brand intake is a workflow.** Don't build a parallel onboarding flow for it — it runs through the same engine as everything else. (D-14)

- **HITL UI is the dashboard, deep-linked from Claude.** Don't try to embed forms in MCP tool responses or build artifact-based intake in v1. (D-15)

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

- **Drizzle schema changes require regenerating the migration AND restarting the dev server.** The schema is bundled at boot; HMR doesn't repick up new columns. Symptom is `column "X" does not exist` after a migration that ran. Same gotcha as Cadenza.
- **`.env.example` has both `DATABASE_URL` (port 6543, pooler) AND will need `DATABASE_URL_DIRECT` (port 5432) eventually** for Drizzle's migrator advisory locks. Add the direct URL when you set up Supabase.
- **The launch.json at `.claude/launch.json`** is the only one you need — it serves the cwd. Don't add cd-shims.

## What's not in scope yet

See [`docs/design.md` §12](docs/design.md). Highlights:
- No MCP server until Milestone 3
- No workflow engine until Milestone 4
- No background job queue (synchronous workflow runner)
- Cross-org users are deferred (1 user → 1 org in v1)

## Memory + handoffs

When asked to leave a note for the next session, save under `~/.claude/projects/-Users-adrianbazbaz-CursorProjects-riffy/memory/` and add a one-liner pointer to `MEMORY.md`. (Riffy's memory directory will be auto-created on first save.)
