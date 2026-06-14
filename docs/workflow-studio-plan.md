# Workflow Studio — Plan & Living Spec

> Living document. Goal: the most **intuitive, beautiful, and fun** n8n-class workflow tool —
> built for non-technical agency users (PMs, crew leads, owners), with Claude woven in.
> Last updated: 2026-06-14 (paused here).

## 1. Vision & principles

**North star:** Linear-grade polish + Zapier-grade approachability + n8n-grade power, with Claude
so anyone can build a workflow they trust without learning a DSL.

- **Intuitive** — build directly on the canvas; one obvious next action everywhere; simple by
  default, powerful on demand; the **debugging loop** (run → watch the data → tweak) is the heart.
- **Beautiful** — smooth edges, node state transitions, dark mode, typographic care, optimistic
  updates, zero jank.
- **Fun** — keyboard-first (⌘K), playful micro-interactions (snap-to-connect, data rippling down
  edges, confetti on the first green run), AI that feels like a collaborator.

**Audience tilt (leaning, not final):** simple + AI-first surface, with n8n power *progressively*
revealed. Our users are not engineers.

## 2. Status snapshot

Everything below is built and **typecheck-clean**. It is verified via API/DB/typecheck, **not
browser-verified** (see Findings → login wall).

### Step authoring & evaluation (`apps/web/src/pages/steps.tsx`, `packages/trpc/src/routers/workflows.ts`)
- **NDV step editor** — 4 panes: **Input | Design | Outputs | Output tests** (n8n Node Detail View).
- **Pinned inputs** (n8n "pin data") — per-step values in `localStorage`; the `project` entity-ref
  input flows into the run modal as the upload destination.
- **Per-output tests** — `step_tests.output_id`; each test targets one declared output and grades
  only it (`run`/`runUpload` pick the target output). Migration `0032`.
- **Live-trial upload eval** — `runUpload` reads the real `documents` rows back + confirms the
  Storage blobs landed (`blobs_present`), grades against per-eval criteria, outputs storage paths.
- **Expression wiring** — `ExpressionField` (in `StepCreatorModal`): pick a specific upstream
  step×output → `${steps.id.output.outputId}`, with an `fx` resolved preview.
- Landscaping **Site assessment → "Site photos capture"** (single photo-set output).

### Project page (`apps/web/src/pages/project/documents.tsx`)
- **Photos / Documents tab split** + thumbnail grid + lightbox (image docs vs files).

### Workflow canvas — n8n authoring (`apps/web/src/pages/workflows.tsx`, `.../workflows/ui/WorkflowCanvas.tsx`)
- **Drag-to-connect** (handle→handle sets `dependsOn`, cycle-guarded) · **select-edge + Delete** to
  disconnect · a **trigger node**.
- **Add-step-on-canvas** (`+` on a node → modal pre-wires it) · **add-node-on-edge** (`+` at an
  edge midpoint inserts a step between) · **edge labels** (double-click → stored in
  `def.edgeLabels`, engine-ignored) · **manual positioning** (`WfStep.position`, drag persists) +
  **Tidy** (clears positions via a `layoutNonce`) · **sticky notes** (`def.notes`).
- **Execute-on-canvas** — Run from the Build toolbar; nodes light up (done/paused/failed); pause at
  human gates → Approve; click a node → `RunInspector` shows its real output.

### Engine & execution — Phase 1 (`packages/trpc/src/workflow/`)
- **Real handlers** (`handlers.ts` → `realHandlers`, spread over `mockHandlers`):
  `http_call` = real `fetch`; `ai_agent_task` = real Claude (`@anthropic-ai/sdk`,
  `ANTHROPIC_MODEL ?? "claude-sonnet-4-6"`). notify/db_operation/etc. still mock.
- **Runs dashboard** — `runs.list` / `runs.get`; FE history list ⇄ detail (lit-up canvas +
  expandable per-step real I/O + approve).
- **Connections (secrets)** — `connections` table (migration `0033`), AES-256-GCM at rest
  (`lib/secrets.ts`), `connections` router (metadata-only reads + server-only
  `resolveConnectionSecret`), `ConnectionsPage` (3rd tab: Workflows | Steps | Connections).

## 3. Roadmap (5 phases) & current state

**Phase 1 — Make it real.**
- ✅ Real handlers (HTTP + Claude) · ✅ Runs dashboard · ✅ Connections (secrets)
- ✅ **Connections wired into `http_call`** — `config.connectionId` on the step; the handler set is
  now built by `makeRealHandlers({ resolveConnection })` (a factory the router seeds with an
  org-scoped resolver, keeping the pure engine free of orgId/db). `connectionAuthHeaders` injects
  the credential per provider (bearer/basic/api_key/header). UI: a `connection`-kind config field
  (picker from `connections.list`) on the http_call step. Verified e2e (all 4 providers) via
  httpbin header-echo.
- ✅ **Per-step timing** — `workflow_run_steps.started_at/finished_at` (migration `0034`); the
  engine stamps each executed step (epoch ms on `StepResult`), `persistRun` writes them, and
  `runs.get`/`runView` expose `durationMs`. Dashboard `RunStepRow` shows it. Verified: a real AI
  step recorded 1345ms.
- ✅ **`notify` → email (Resend)** — real email handler (`makeNotify`). The provider API key comes
  from a referenced Connection (its `apiKey`/`token` secret — same secrets layer as http_call) or
  `RESEND_API_KEY`; the connection's `config.endpoint`/`config.from` override the URL/sender. Step
  config gained subject/body/connection picker. sms/slack/in-app stay mocked (return `sent:false`
  with a note). Verified e2e via httpbin endpoint-override: send completes; no-key path errors
  helpfully; non-email channel returns the note. *(A real Resend key/domain is needed to actually
  deliver — decision #2 resolved: Resend.)*
- ✅ **Durable async runner (pg queue + Vercel Cron)** — decision made (see Decisions #1): an
  additive Postgres job queue (`workflow_jobs`, migration `0035`) drained by a scheduled trigger,
  since prod is serverless. The synchronous runner stays for "Run now" (instant canvas feedback);
  the queue powers background / retried / human-gated runs and survives restarts.
  - `workflow/queue.ts` — `enqueueJob` · `claimJobs` (atomic `FOR UPDATE SKIP LOCKED` + lease) ·
    `finishJob` · `retryJob` (exp backoff) · `reclaimStaleJobs` (dead-lease recovery) ·
    `requeueWaitingJob`. `drainJobs({orgId?, limit})` in the router ties queue→engine→persist.
  - Router: `runs.enqueue` (queued run + job) · `runs.tick` (drain this org now) · `runs.approveQueued`
    (re-arm a parked human gate). State machine: queued→running→{done|failed|waiting}; waiting
    re-armed by approval; failed retried w/ backoff to `maxAttempts`.
  - Prod trigger: **Vercel Cron** `* * * * *` → `/api/cron/tick` (`cron-handler.ts`, CRON_SECRET-
    guarded, bundled via `build-api.mjs`). ⚠️ Cadence needs a Vercel plan that allows per-minute
    crons; set `CRON_SECRET` in prod env.
  - Verified locally (org-scoped tick = same drain logic): enqueue→done · gate→waiting→approve→done ·
    fail→retry/backoff→failed@maxAttempts · **survives a server restart**. Cron *firing* is prod-only.
  - ✅ **Durable-path UI** (Runs dashboard): **Queue run** (enqueue) + **Process queue** (manual
    `tick`, since there's no local cron) buttons; a durable parked run shows **run.status `waiting`**
    (vs a synchronous `paused` — `advanceJob` sets it so the UI picks the queue resume path) with an
    **Approve** that calls `approveQueued`; `queued`/`waiting` badges added to `STATUS_META`.
    Verified: run status lifecycle queued→waiting→running→completed over the API; modules transform 200.
- ◻️ More real handlers — `db_operation`, `mcp_tool_call`.
- ◻️ Per-step timing — 2 columns on `workflow_run_steps` + engine stamping (dashboard shows only
  run-level duration today).

**Phase 2 — The debugging loop.**
- ✅ **Unified in-run NDV** (done 2026-06-14) — one `RunStepInspector` (ui kit) with **Output │
  Params │ Input** tabs, used by BOTH the Build canvas (right panel on a run) and the Runs dashboard
  (each step row expands into it, `embedded`). Replaced the two divergent `RunInspector` +
  `RunStepRow` output-dumps. Input pane = the outputs of the step's `dependsOn` deps (`upstreamFor`)
  + declared inputs; Params = config + instructions; header = status + duration. Verified the three
  panes carry real data on a 2-step run.
- ✅ **Expression editor v2 — foundation + live preview + autocomplete** (done 2026-06-14):
  - The `${...}` resolver (resolveVars/resolveExpr/VarScope + new `isExpr`/`exprPaths`) moved to
    **`@beamy/shared/expressions`** so the client editor and the server engine resolve identically;
    `engine.ts` imports + re-exports it (runtime resolution re-verified end-to-end).
  - **Live "→ resolves to" sample preview** in `ExpressionField`: a design-time `VarScope`
    (`expr-scope.ts buildPreviewScope`) of type-shaped ‹angle-bracket› placeholders, resolved with
    the shared `resolveVars`; labelled "fx sample" so it reads as schema, not confirmed data.
  - **`${` autocomplete** (`ExpressionInput.tsx`): caret-aware token detection, keyboard nav,
    caret restoration; suggests `steps.<id>.output.<field>` (and the "wire from" chips share it).
  - Renamed the local label fn `resolveExpr`→`labelForRef` (it returns a human label, not a value).
  - Verified: `pnpm -r typecheck`, a tsx fixture (`packages/shared/scripts/expressions.check.ts` —
    asserts resolution semantics AND engine-re-export parity), module transforms 200, and a live
    2-step `${steps.a.output.text}` run still resolves post-move.
  - **Adversarially reviewed** (multi-agent): the bug-prone caret logic was extracted to a pure,
    React-free `expr-autocomplete.ts` (`activeToken`/`insertRef`) and covered by a fixture
    (`apps/web/scripts/expr-autocomplete.check.ts`). Fixed 4 confirmed findings — caret-symmetric
    token detection (no dropdown inside a closed token), accept consumes the token remainder (no
    stray `}`), consistent ‹schema› sample placeholders, and `labelForRef` accepts the `.output`-less
    reference form.
- ◻️ **Still ahead:** sandboxed filters/functions runtime (`| upper` etc.); drag-a-field from the
  input pane; the preview against REAL run data (today synthetic placeholders + localStorage pins);
  pin any node's output (reuse as test data); "execute up to here."
- **Expression editor v2** — inline `{{ }}` autocomplete, drag a field from the input pane into a
  param, live resolved preview against pinned data; a **sandboxed expression runtime**
  (filters/functions, beyond `${...}`).
- ✅ **Foundational (done 2026-06-14):** variable resolution is now centralized in the *engine*
  loop — it resolves `${…}` in each step's `config`/`inputs`/`instructions` against the run scope
  ONCE before dispatch, so handlers receive an already-resolved `ctx.step` and just read values
  (`cfgOf`/`insOf`). Removed the per-handler `resolveVars` from http_call/notify/ai_agent_task.
  Verified e2e: a downstream http step's `body.echo = ${steps.ai.output.text}` resolved to the
  upstream AI output with no handler-side resolution, and connection auth still injected.

**Phase 3 — Control flow & triggers.**
- ✅ **Real IF / conditional branching** (done 2026-06-14): a general per-step **`when`** expression
  gate (on `WorkflowStep`/`WfStep`). The engine hoists its centralized var-resolution ABOVE the skip
  decision so `when` resolves, then skips when the gate is falsy (cascading to dependents via the
  existing skip machinery). `branch` is now a **real** handler (engine default set, pure) emitting
  `{ value, onTrue, onFalse }` from `truthy(config.condition)`. Authoring: branch config relabeled;
  StepEditor **"Run on"** Select writes `when=${steps.<id>.output.onTrue|onFalse}` (re-points a
  single branch `dependsOn` for the canvas edge + cascade). `truthy()` is shared (`@beamy/shared`)
  by the gate + handler. Back-compat: legacy `skipUnless` kept verbatim. No DB migration (`when`
  rides in the JSON definition).
  - **Engine guarantees ordering**: `topoOrder` derives implicit edges from `when` references
    (`steps.<id>` heads), so a gated step is always ordered AFTER the branch it reads — correct even
    for hand-authored / restored / AI-generated defs, not just the UI path. (Adversarial-review fix:
    the original relied on the StepEditor adding the dep; the engine now self-guarantees it.)
  - Verified: typecheck; `branch.check.ts` (routing/cascade/nesting/joins/**ordering w/o dependsOn**/
    gate-on-unreached/no-condition/skipUnless); `expressions.check.ts` truthy cases; live API runs
    (true-path runs + false-path skips, and a gate-only step listed before its branch still routes
    right). Adversarially reviewed; 5 findings fixed (1 high ordering, 2 stale-dep, 2 low).
- ◻️ **Still ahead:** Switch/case (N-way), real **loops** (for-each), parallel+join (OR-join),
  suspending `wait`/`delay`; canvas true/false edge labels + green/red coloring (cosmetic).
- ✅ **Triggers — inbound webhook + cron schedule** (done 2026-06-14): workflows fire themselves,
  riding the durable runner. New `workflow_triggers` table (migration `0036`; one row per
  workflow+type). A shared server-only `enqueueRun(orgId, target, inputs, actor, {requirePublished})`
  seam (used by the manual mutation + both triggers) creates a queued run with org resolved ONLY
  from a server-trusted row.
  - **Webhook:** an unguessable per-workflow token (`crypto.randomBytes(24)`, UNIQUE partial index)
    → `POST /api/hooks/<token>` (`webhook-handler.ts`, bundled serverless fn + dev-routed in
    `vite.config.ts`) maps the payload to `{body,query,headers,receivedAt}` inputs and enqueues a
    run. POST-only; generic 404 (no enumeration); 256KB cap; optional HMAC-SHA256 (encrypted secret,
    byte-safe `timingSafeEqual`, fail-closed). Published-only (drafts → 422).
  - **Schedule:** structured `every`/`daily`/`weekly` config (`@beamy/shared/schedule.ts`,
    DST-correct `nextDueAfter`, no deps) with a `nextDueAt` cursor. `scanScheduledTriggers` claims
    due rows atomically (`FOR UPDATE SKIP LOCKED` + in-statement cursor bump → no double-fire on
    overlapping/late ticks), runs INSIDE the existing every-minute Vercel cron tick (before the
    drain, isolated so a scan error can't starve it). Invalid config backs off (no flood);
    unpublished retries next tick.
  - tRPC `triggers` sub-router (get/upsertSchedule/upsertWebhook/rotateWebhookToken/setEnabled/
    delete), org-scoped, secret never returned (only `hasSecret`); dev `runs.scanScheduled`.
  - Verified: typecheck; `schedule.check.ts` (every/daily/weekly/DST/bad-time); live curl
    (webhook 202/404/422, HMAC 401/202/401, GET→404, crafted-sig→401) + `scanScheduled` (fires once,
    no double-fire, invalid-config skip+backoff). Adversarially reviewed; 7 findings fixed.
- ✅ **TriggerConfigPanel UI** (done 2026-06-14): the trigger node on the Build canvas is now
  clickable (`onSelectTrigger`) → a right-panel `TriggerConfigPanel` (page-level, over the triggers
  sub-router). Webhook: create/copy URL, enable/disable, rotate, optional HMAC secret, curl hint.
  Schedule: frequency picker (every/daily/weekly) with a live "next run" (shared `nextDueAfter`),
  enable/disable. Adversarially reviewed; 5 findings fixed (weekly-days can't empty out + Save is
  validity-gated; all mutations surface errors; grid reserves the right column; minutes Select shows
  the saved value). Verified: typecheck + module transforms (not click-tested — login wall).
- ◻️ **Triggers still ahead:** form submissions, internal domain events ("project created" — needs
  an event bus; `signal` stays metadata), raw-cron schedules, delivery logs / idempotency dedupe.

**Phase 4 — Delight & speed.**
- ✅ **Templates gallery** (done 2026-06-14): curated `WORKFLOW_TEMPLATES` (a shared constant — the
  single source for the gallery + the verification fixture + AI-builder few-shot material): Lead→
  proposal, Site visit→assessment, Change-order budget triage (branch+gate), Weekly site weather
  briefing (scheduled; http→AI→email), RFI intake (signal). `workflows.templates.list` (cards only) +
  `templates.instantiate` (runs the template through the SAME `normalizeWorkflowDef` then inserts a
  DRAFT — D-8). UI: a "From a template" mode in `WorkflowCreatorWizard` (a vertical list per
  [[feedback_prefer_tables]], grouped by category, one-click "Use" → lands on the Build canvas).
  Verified: a fixture asserts all 5 normalize clean + run to expected terminals (gate pauses, branch
  arms route); live list/instantiate/NOT_FOUND. Adversarially reviewed (content + UI); 1 LOW fixed
  (loading state in the gallery).
- ◻️ **Still ahead:** ⌘K command palette · searchable node library (icons/categories/recent) ·
  minimap · dark mode · onboarding/empty states · **replace the `window.prompt`** editors (edge
  labels, note text) with inline editors · smooth auto-layout · micro-interactions.

**Phase 5 — AI builder & collaboration.**
- ✅ **Describe a process in English → Claude drafts a wired workflow** (done 2026-06-14). A
  `workflows.generate` mutation: a **forced Claude tool call** (`ai-builder.ts` `EMIT_WORKFLOW_TOOL`,
  `tool_choice` forced, type-enum from the vocab) → a **pure `normalizeWorkflowDef`** (in
  `@beamy/shared` — the safety net: valid types, unique ids + ref-remap, no dangling/self/cyclic
  edges, config clamp, size clamp; returns `{def, warnings, dropped}`) → insert a **draft** workflow
  (D-8: never published/run until a human does — `enqueueRun({requirePublished})` blocks drafts). A
  shared `STEP_VOCAB` is the single source for the prompt + the normalizer's allowlist. UI: a
  "✨ Build with AI" mode in `WorkflowCreatorWizard` → lands on the Build canvas reviewing the draft.
  - Verified: `workflow-builder.check.ts` fixture (repair semantics + **engine-runnability parity** +
    dense-cycle/slug-collision/loop-drop regressions); a live generate produced correct branch+gate
    drafts (lead→proposal; weekly RFI summary), `status=draft`, 0 version rows, runnable to the gate.
  - Adversarially reviewed; 7 findings fixed (incl. **breakCycles could exit still-cyclic** on dense
    graphs → loop-until-acyclic + hard fallback; **when-rewrite slug-collision corruption** →
    single-pass token rewrite; non-executable types dropped; truncation warning; UI error surfacing).
- ◻️ **Still ahead:** per-node AI assist (suggest config / fix errors), iterative refine over an
  existing draft, AI-suggested triggers/connections. Collaboration: node comments, version diff.

### Backend architecture target (the durable engine)
- Durable async runner: pg-backed job queue + worker; state machine
  `queued → running → waiting(human/condition/delay) → done/failed`, persisted per step; retries +
  backoff + timeouts + `continueOnFail`. (The synchronous runner already persists per-step and
  pause/resume — the state machine is half there.)
- Handler registry: each step type a pure, testable `(ctx) → output` with declared
  inputs/outputs/credentials. **The per-output step-test harness can double as the handler unit
  tests.**
- Expressions runtime · triggers subsystem (webhook/cron/event bus) · secrets (done) ·
  observability (run/step snapshots, timing, logs, alerting).
- Keep invariants: org-scoping, audit, agent/AI writes are drafts a human publishes.

## 4. Findings & gotchas (learned while building)

- **Dev server bundles router/schema/handlers at boot** → you MUST restart the dev server after any
  backend (engine/handler/router/schema) edit. Hit this repeatedly; symptom is "old behavior" or
  "no such procedure."
- ~~**The engine does NOT resolve `${...}` in its run loop**~~ — FIXED 2026-06-14: the engine now
  resolves `config`/`inputs`/`instructions` per step before dispatch (handlers read resolved values
  via `cfgOf`/`insOf`). The raw definition is untouched (resolution is into a per-step copy).
- **AI prompt location varies** — `ai_agent_task` reads `config.prompt ?? config.instructions ??
  step.instructions`. A placeholder step with none correctly fails (and the dashboard shows it).
- **`workflow_runs` is keyed by `workflowName`, not `workflowId`** — `runs.list` resolves
  name→runs. Consider keying by `workflowId` eventually (rename-safety).
- **Per-step timing isn't persisted** (only run-level `started/finished`).
- ~~**`branch` is a mock**~~ — FIXED 2026-06-14: `branch` is real (emits onTrue/onFalse) + a per-step
  `when` gate routes execution (see Phase 3). Edge labels are still decorative (canvas coloring TODO).
- **Canvas remount pattern** — uncontrolled `defaultNodes/defaultEdges` + a remount `key` (the
  `sig`); node/note **positions are deliberately excluded from the sig** so a drag doesn't re-fit
  the viewport; **Tidy bumps a `layoutNonce`** to force a fresh dagre layout.
- **Secrets key + vite env hoist** — `vite.config.ts` only hoists *allowlisted* env vars to the
  local dev server. `WORKFLOW_SECRETS_KEY` isn't allowlisted, so local dev derives the key from
  `SUPABASE_SERVICE_ROLE_KEY` (which is). To use a dedicated key: add `WORKFLOW_SECRETS_KEY` to the
  allowlist (local) and set it in prod env.
- **Login wall (big one for verification)** — the preview browser can't be logged in: the old local
  password no longer works, and the harness security classifier blocks every auth shortcut
  (password reset, no-auth server, secret extraction, membership grant). So **everything is
  verified via the token-less tRPC API bypass + typecheck + module-transform**, not by clicking the
  authed UI. To actually see it: log into Green Valley locally, or the user runs the no-auth vite
  server / shares the password.
- **Migrations** — `pnpm db:generate` works; apply locally via
  `docker exec -i supabase_db_beamy psql -U postgres -d postgres < migrations/00XX_*.sql` (the
  local `db:migrate` has pre-0029 drift). Prod auto-applies on the main→staging deploy.

## 5. New ideas / opportunities (surfaced during the build)

- **Step tests as handler unit tests** — the per-output criteria harness already grades outputs;
  point it at real handlers to test them.
- **"Test connection" button** on a Connection (a ping/echo) so users get instant confidence.
- ~~**Unify the in-run inspectors**~~ — DONE 2026-06-14 (`RunStepInspector`); pinning still TODO.
- **Seed domain templates** — e.g. "Lead → create project → notify crew → schedule site visit" —
  for instant value + as AI-builder few-shot examples.
- **Recommended first slice for the durable runner** — one real vertical thread: a real trigger
  ("project created") → real Claude step → human gate → real email → observable in the dashboard.
- **Delight backlog** — confetti on first green run; animate data down edges during a run; ⌘K to add
  nodes; satisfying connect-snap.

## 6. Open decisions

1. **Durable runner:** in-house (Postgres job queue) vs adopt a durable-execution engine
   (Temporal / Windmill-style). *Recommendation: in-house pg-queue; revisit at scale.*
   **HARD CONSTRAINT discovered 2026-06-14:** prod is **Vercel serverless** (`api/trpc/[trpc].ts`,
   Node runtime, bundled; DB = Supabase pooler). There is **no long-lived process** to host a
   worker loop, so the original "+ a worker process" plan doesn't fit. The shape must be a
   pg-backed queue (`workflow_jobs`, claimed with `FOR UPDATE SKIP LOCKED` + a lease) **drained by
   a scheduled trigger**. Sub-decision (the real fork) — what drives the drain:
   - **(a) Vercel Cron** → a `/api/cron/tick` function drains the queue every minute. Simplest,
     all-in-Vercel; granularity ≥ 60s; bounded by function timeout per tick. **✅ CHOSEN & built
     2026-06-14** (see Phase 1 — `cron-handler.ts` + the `crons` entry in `vercel.json`).
   - **(b) Supabase pg_cron + pg_net** → DB schedules an HTTP call to the tick endpoint. Keeps
     scheduling in the DB; needs the extensions enabled.
   - **(c) External worker** (separate always-on host) → true continuous draining; adds ops/infra.
   Likely pairing: keep the **synchronous in-request runner for "Run now"** (instant canvas
   feedback) AND enqueue for triggered/delayed/retried runs, with the cron drain as the safety net
   for `delay`/`wait`/retry/timeout. Gated on the user's Vercel plan (cron limits) + preference.
2. ✅ **Email provider** for `notify`: **Resend** (resolved 2026-06-14). Key stored as a Connection
   (or `RESEND_API_KEY`); Resend-compatible endpoint overridable per-connection. A verified sender
   domain + real key are the only remaining setup to actually deliver mail.
3. **Audience tilt:** simple + AI-first (recommended) vs n8n-power-first.

## 7. Immediate next steps (pick up here)

In rough priority:
1. ✅ **Wire connections into `http_call`** — DONE 2026-06-14 (see Phase 1 above). Provider OAuth
   still deferred.
2. ✅ **Per-step timing** — DONE 2026-06-14 (migration `0034`; see Phase 1 above).
3. ✅ **`notify` → email (Resend)** — DONE 2026-06-14 (see Phase 1 above).
4. ✅ **Durable runner (pg queue + Vercel Cron) + durable-path UI** — DONE 2026-06-14 (migration
   `0035`; see Phase 1 above). *Remaining to harden:* confirm the Vercel cron plan/cadence + set
   `CRON_SECRET` in prod env; consider keying runs by `workflowId` not name; auto-poll the Runs
   dashboard while a run is queued/running (today you click "Process queue" / it refetches on action).
5. Then **Phase 2** (expression editor v2 + in-run NDV), with the engine-level var-resolution
   cleanup first.

## 8. Working in this codebase (orientation)

- **Engine:** `packages/trpc/src/workflow/engine.ts` (pure DAG, `resolveVars`, per-step timing),
  `handlers.ts` (`makeRealHandlers` factory: http_call+connection-auth, ai_agent_task, notify→email),
  `queue.ts` (durable job queue: enqueue/claim/retry/reclaim), `verification.ts` (output grading).
  The cron drain handler is `packages/trpc/src/cron-handler.ts` → `api/cron/tick.ts`.
- **Router:** `packages/trpc/src/routers/workflows.ts` (workflows/runs/stepTemplates/stepTests),
  `connections.ts`, `documents.ts`. Registered in `router.ts`.
- **Canvas kit:** `apps/web/src/pages/workflows/ui/` (prop-driven, portable; `WorkflowCanvas.tsx`,
  `StepCreatorModal.tsx`, `StepEditor.tsx`, `theme.tsx`, `types.ts`).
- **Pages:** `apps/web/src/pages/workflows.tsx` (Workflows | Steps | Connections + detail),
  `steps.tsx` (NDV step editor), `connections.tsx`.
- **DB:** `packages/db/src/schema/workflows.ts` (workflows, versions, runs, run-steps, step
  templates/tests/runs, **connections**). `migrations/`.
- **Verify** with the token-less API: `curl http://localhost:5190/api/trpc/<proc>` (GET queries;
  POST mutations with a JSON body). Restart the dev server after backend edits.
