# Riffy — Design Doc (v0, draft for review)

> **Status:** First-pass design. Nothing is built yet. Open questions are flagged inline (`OQ-N`). Decisions live in §13.

---

## 1. The pitch

Riffy is a **dashboard + MCP server pair** that helps small businesses fold Claude/ChatGPT into their daily operations *without* losing the project context every time they open a new chat.

Two consumers, one backend:

- **Web dashboard** — humans curate clients, projects, brand assets, prompt templates, work orders, POs, and finance. They also drive workflow runs and handle human-in-the-loop steps.
- **MCP server** — Claude (or any MCP-aware client) pulls that same curated context and acts on it. "Show me current work orders," "kick off the content workflow for the Acme rebrand," "what's waiting on me?"

The wedge: **structured project context + workflow orchestration with HITL gates**. AI without that becomes a goldfish; with it, it remembers your brand voice, knows which prompts you've vetted, and can hand things back to humans cleanly.

Initial target: **small marketing agencies** (5–20 person teams). They're context-heavy, AI-curious, and already trying to use Claude/ChatGPT but losing time re-explaining themselves.

---

## 2. Naming

**Riffy.** Continues the Astralitics musical line (Cadenza → Riffy). Two syllables, vowel-heavy, Duolingo-friendly mascot energy — a small character who riffs alongside you. Doubles as a verb in conversation: "let's riff on this with Riffy." Domain locked: **riffyai.com**.

Tagline candidates (TBD): *"Riff with AI."* / *"Your small-business sidekick."* / *"Where teams riff with AI."*

---

## 3. Users & personas

Riffy is **multi-tenant SaaS**. Each agency that signs up at riffyai.com gets its own isolated workspace ("org"). Within an agency, multiple team members collaborate on shared projects. **Cross-org access is impossible** at the API layer (every query scopes by `org_id`). Personas below describe roles *within* an agency.

| Persona | What they do | What they need |
|---|---|---|
| **Founder / Owner** | Sets brand, oversees finance, configures workflows | Trusts the AI agent only with curated context |
| **Account / PM** | Owns a project + client relationship | Project workspace; quick HITL approvals; clean Claude handoffs |
| **Specialist** (designer, copywriter, marketer) | Executes work orders inside projects | Prompt library, branding folder, AI assistance scoped to the project |
| **Ops / Bookkeeper** | Closes work orders, runs POs, books invoices | Company-level views (Clients/POs/Finance) — minimal AI friction |

**MCP-side:** every team member adds the Riffy connector to Claude once, OAuths in with their Riffy account, and Claude's calls carry their identity. Per-user inbox, per-user attribution, per-user permission scope.

---

## 4. Mental model

Three nested scopes: **agency (tenant)** → **company workspace** → **project workspace**.

```
┌─────────────────────────────────────────────────────────────────────┐
│ AGENCY  (org / tenant — created on sign-up, isolated from others)   │
│                                                                     │
│   ┌───────────────────────────────────────────────────────────┐    │
│   │ COMPANY WORKSPACE                                          │    │
│   │   Clients · Work Orders · POs · Finance · Services ·       │    │
│   │   Workflows · Prompt Library · Settings                    │    │
│   │                                                            │    │
│   │   ┌────────────────────────────────────────────────┐      │    │
│   │   │ PROJECT WORKSPACE  (one client engagement)     │      │    │
│   │   │   Overview · Brand · Documents · Work Orders · │      │    │
│   │   │   Workflows (project-scoped) · Prompts ·       │      │    │
│   │   │   Activity                                     │      │    │
│   │   │                                                │      │    │
│   │   │   ↳ PM agent scoped to this project's brand,   │      │    │
│   │   │     docs, prompts, history.                    │      │    │
│   │   └────────────────────────────────────────────────┘      │    │
│   └───────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          │ same Postgres, two front-doors per (user, org)
                          │
┌─────────────────────────────────────────────────────────────────────┐
│ MCP SERVER  (per-(user, org) OAuth via Claude Connectors)           │
│   Every call is scoped: this user, acting in this org.              │
│   Tools: list/get/create within the user's org                      │
│   Resources: brand://, doc://, prompt://, workflow://               │
└─────────────────────────────────────────────────────────────────────┘
```

An **Agency** is the tenant boundary — Northstar Studio's data is invisible to Acme Marketing and vice versa. A **Project** (inside an agency) is a context-bag for one client engagement or internal initiative. Almost everything interesting happens *inside* a project; company-level tables are the connective tissue for the agency itself.

**Key relationships:**
- `project.client_id` → nullable (most projects have one client; internal projects don't)
- `work_order.project_id` → nullable (most belong to a project; some are standalone)
- `workflow_definition.scope` → `'company' | 'project'` (some workflows are reusable across projects; some are project-specific customizations)

---

## 5. Data model

### Identity, tenancy & access

```
users                  Supabase Auth (id, email, display_name, avatar_url) — global
orgs                   id, name, slug, description, default_currency,
                       locale, owner_user_id, created_at — one row per agency
org_memberships        user_id, org_id, role (owner | admin | member),
                       invited_by, joined_at — v1: 1 user → 1 org
invitations            id, org_id, email, role, invited_by_user_id,
                       token, expires_at, accepted_at?, accepted_by_user_id?
audit_log              id, org_id, actor (text — "user:<id>" / "agent:claude" /
                       "webhook:<src>"), action, resource_type, resource_id,
                       payload (jsonb), ts
```

**Multi-tenancy is a v1 invariant.** Every business table below has `org_id NOT NULL` with an FK to `orgs`. Every tRPC procedure resolves the active org from the auth context (Cadenza's `orgScopedProcedure` pattern is the model) and filters all reads/writes by it. Cross-org access is impossible at the API layer.

### Company-level

```
clients                id, name, primary_contact, status, notes, tags[]
client_contacts        many-to-one back to clients
vendors                suppliers (for POs); much simpler than Cadenza's
services               services catalog (replaces "products"): name, description,
                       default_rate, billing_unit (hour/project/retainer/...)
purchase_orders        + po_lines        — POs you issue; no inventory receipt step
work_orders            + wo_tasks        — units of delivery; nullable project_id
                                          + client_id, status, assignee, due_date
invoices, payments     finance — port Cadenza's cashflow shape minus inventory cost
prompt_templates       id, scope ('company' | 'project'), project_id?,
                       name, body (markdown), variables (jsonb schema),
                       version  — single table covers both scopes (D-18)
```

### Workflow engine

```
workflow_definitions   id, name, scope ('company' | 'project'), project_id?,
                       version, definition_json (the DAG),
                       created_by_user_id, published_at
workflow_steps         normalized view of step nodes (or kept as JSON in definition)
                       — see §7 for shape

workflow_executions    id, definition_id, definition_version, project_id?,
                       status, started_by_user_id, started_at, completed_at,
                       current_step_id, inputs_json, outputs_json
execution_steps        id, execution_id, step_id, status, attempt,
                       inputs_json, outputs_json, started_at, completed_at,
                       awaiting_user_id?  (who needs to act for HITL)
execution_events       append-only: type (step_started, step_completed,
                       human_input, agent_message, ...), payload, ts
```

### Project workspace

```
projects               id, name, slug, client_id?, status, owner_user_id,
                       created_at, archived_at
project_members        per-project access control (owner/editor/viewer)
                       — most users see all projects, but specialists can
                         be scoped to specific ones
project_brand          one-to-one with project; structured branding (§6)
project_documents      file refs (Supabase Storage) + extracted text +
                       embeddings for RAG
project_workflows      bindings: which workflow_definitions are enabled here,
                       plus project-specific variable defaults
project_threads        conversations between humans and the project's PM agent
                       (for the in-app chat surface, not the MCP-side chats)
brand_change_proposals id, project_id, proposed_by (actor string),
                       path (e.g. "voice.do_say"), proposed_value (jsonb),
                       rationale, status ('pending' | 'approved' | 'rejected'),
                       decided_by_user_id?, decided_at?
                       — agent writes here; humans gate brand updates (D-8)
```

> Project-scoped prompts use the same `prompt_templates` table with `scope='project'` + `project_id` — no separate table (D-18).

### Why `org_id` everywhere

Multi-tenant SaaS — each agency is fully isolated. `org_id` on every business table; every tRPC procedure scopes by it (Cadenza's `orgScopedProcedure` is the reference). The cost of doing this on day one is ~1 week of scaffolding; the cost of retrofitting it later is multi-week with downtime risk. **Day-one is the right call.**

---

## 6. The Branding folder

The asset that makes everything else valuable. Designed so the AI agent can pull *just the slot it needs* (e.g., `brand.voice.do_say`) without re-reading 40KB of prose.

Stored as a **structured `project_brand` row (JSONB) + file refs in Supabase Storage**.

```yaml
identity:
  name: ""
  tagline: ""
  mission: ""
  elevator_pitch: ""
  target_audiences:
    - persona_name: ""
      who: ""              # demographic / firmographic
      pain: ""             # what they're trying to solve
      values: []           # what they care about

voice:
  personality_traits: []   # ["warm", "expert-but-not-stuffy", "playful"]
  do_say: []               # example phrasings that are on-brand
  dont_say: []             # phrases / words to avoid
  reading_level: ""        # "8th grade" / "professional" / "technical"
  languages: []            # ["en", "es-MX"]

visual:
  logos:                   # file refs
    primary: storage_path
    monochrome: storage_path
    mark: storage_path
    lockups: [storage_path, ...]
  colors:                  # design tokens
    primary: "#..."
    secondary: "#..."
    accents: []
    semantic:
      success: "#..."
      warning: "#..."
      error: "#..."
  typography:
    display: { family, source, weights }
    body:    { family, source, weights }
    mono:    { family, source, weights }
  imagery_style: ""        # "documentary photography, warm tones, real people"
  iconography: ""          # "outline, 1.5px stroke, rounded"
  design_tokens:           # exportable JSON (Tailwind/Style Dictionary friendly)
    spacing: {...}
    radii: {...}

content:
  glossary:                # preferred-term map
    - preferred: "client"
      avoid: ["customer", "user"]
      reason: ""
  boilerplate:             # canned blurbs the agent can reference
    about_us_short: ""
    about_us_long: ""
    footer: ""
    bios: [{ name, role, body }]
  style_rules:             # capitalization, oxford comma, em-dash usage
    - ""
  disclaimers:             # legal/compliance copy
    - ""

channels:                  # channel-specific overrides
  web:    { tone, cta_conventions, link_style }
  social: { per_platform: { twitter: {...}, linkedin: {...} } }
  email:  { signatures, templates }
  print:  { color_profile, paper_stock_notes }

references:
  competitors:
    - { name, url, what_we_admire, what_we_avoid }
  inspiration:             # file refs (mood board)
    - storage_path
  prior_work:              # links into project_documents
    - document_id
```

**Editing surfaces:**
1. **Web UI** — form-based editor, one section per tab. Image-heavy sections (logos, mood boards) get drag-and-drop.
2. **MCP write tools** — agent can *propose* a brand update (`propose_brand_change(project_id, path, value)`); the change goes into a review queue, human approves before it's persisted. **Never let the agent write brand directly without approval** — brand drift is a one-way ratchet.

**Read surface:**
- MCP resource: `brand://projects/<id>` returns the full blob (cacheable).
- Tool: `get_brand_slot(project_id, path)` — e.g., `"voice.do_say"`. Lets the agent pull cheap context.

---

## 7. Workflow engine

The hardest design decision in v1. Keep it small and additive.

### Step types (start with five)

| Type | Behavior | HITL? |
|---|---|---|
| `prompt_run` | Bind inputs → render prompt template → call LLM → capture structured output | No |
| `tool_call` | Call a registered tool (HTTP API, image gen, doc gen, another MCP server) | No |
| `human_review` | Present prior step's output → collect `{ decision: approve|edit|reject, edited_output?, comment }` | **Yes** |
| `human_input` | Show a form (JSON Schema → UI) → collect structured input | **Yes** |
| `human_chat` | Open a back-and-forth thread about the prior output until human marks "ship it" | **Yes** |

Anything else (`branch`, `loop`, `parallel`) is sugar — defer.

### Definition shape

```json
{
  "id": "content-draft-v3",
  "name": "Blog post draft → review → image",
  "scope": "project",
  "version": 3,
  "inputs": {
    "topic": { "type": "string", "required": true },
    "target_persona_id": { "type": "string", "required": true }
  },
  "steps": [
    {
      "id": "draft",
      "type": "prompt_run",
      "prompt_template_id": "blog-draft-v2",
      "vars": {
        "topic": "${inputs.topic}",
        "voice": "${brand.voice}",
        "persona": "${brand.identity.target_audiences[?(@.persona_name == ${inputs.target_persona_id})]}"
      },
      "model": "claude-opus-4-7"
    },
    {
      "id": "review",
      "type": "human_chat",
      "depends_on": ["draft"],
      "context": { "draft": "${steps.draft.output}" },
      "exit_when": "human_approves"
    },
    {
      "id": "hero_image",
      "type": "tool_call",
      "depends_on": ["review"],
      "tool": "image_generation",
      "config": {
        "prompt": "${steps.review.output.final_text} --style ${brand.visual.imagery_style}"
      }
    }
  ]
}
```

Variable resolution is the same as GitHub Actions / Temporal: `${inputs.X}`, `${steps.<id>.output.Y}`, `${brand.…}`, `${docs.search("...")}`. Resolved at step-start time.

### Execution lifecycle

```
queued → running → (awaiting_human ↔ running) → completed | failed | cancelled
```

When a step is `human_review` / `human_input` / `human_chat`, the runner:
1. Sets execution status to `awaiting_human`, records `awaiting_user_id` (could be null = "anyone on the team").
2. Surfaces the step in the assignee's inbox + the project's activity feed.
3. Returns from MCP calls with a "paused, link: …" payload — Claude can show the link to the human, or notify them via Slack/email integration later.
4. When the human submits, runner advances to the next step.

**No background worker in v1** — runs are driven by HTTP requests:
- Starting an execution kicks off a job that runs synchronously through automated steps until it hits a HITL gate or completes.
- A pending execution can be advanced by either the dashboard (human submits a form) or MCP (`submit_step_input`).

When throughput needs grow, add a queue (BullMQ + Redis, or Inngest). Don't pre-build it.

### What we explicitly don't do in v1

- **Visual workflow builder.** Workflow definitions are authored as JSON/YAML in the dashboard's code editor (Monaco). A drag-drop builder is a 6-month project; ship value first.
- **Cross-step branching / loops.** Linear DAGs only.
- **Time-based triggers.** All runs are human- or API-initiated.
- **Versioned migrations of in-flight executions.** New version → new runs use it; in-flight runs finish on their pinned version.

---

## 8. MCP server (the differentiator)

### Architecture

Separate Node service, sibling to the web app. Talks to the **same Postgres** for reads; for writes, calls into the **same tRPC procedures** the web app uses (so business rules stay single-source).

```
┌──────────────┐          ┌──────────────┐
│ Claude       │──OAuth──▶│ Riffy MCP     │──────┐
│ Connector    │          │ (HTTP/SSE)   │      │
└──────────────┘          └──────┬───────┘      │
                                 │              │
┌──────────────┐                 │              ▼
│ Riffy Web UI  │─────────────────┴────────▶ tRPC API
└──────────────┘                                │
                                                ▼
                                            Postgres
```

### Auth — per-`(user, org)` scope

**Claude Connectors** — Anthropic's hosted MCP-over-HTTP path — support OAuth 2.1 per user. Flow:

1. Team member adds the Riffy connector to Claude (one-time, via URL).
2. Claude redirects them to Riffy's OAuth consent screen.
3. They sign in with their Riffy account (Supabase Auth, same as the dashboard). Their org membership is implicit (v1 = one org per user — D-12).
4. Connector stores their access token; every MCP call from Claude carries it.
5. Riffy MCP server exchanges token → `(user_id, org_id)`. **Every tool/resource call is scoped to that pair.**

Same session, two surfaces: dashboard logged in via Supabase, MCP authorized via OAuth on top of the same identity. **Cross-org access is impossible** — a token issued for org A cannot read org B's data, full stop.

### Tools (v1 surface)

```
# Read
list_projects()                                       my accessible projects
get_project_context(project_id, slots?)               brand + recent activity + active runs
list_clients() / get_client(id)
list_work_orders(filter?) / get_work_order(id)
list_purchase_orders(filter?) / get_purchase_order(id)
search_documents(query, project_id?)                  RAG over project_documents
get_prompt(id) / list_prompts(project_id?)
get_brand_slot(project_id, path)                      cheap brand context pulls

# Write (require explicit user intent in conversation)
create_work_order(project_id, fields)
update_work_order_status(id, status, note)
add_project_document(project_id, file_url, metadata)
propose_brand_change(project_id, path, value, rationale)   → review queue, not direct write

# Workflows
list_workflows(scope, project_id?)
start_workflow_execution(workflow_id, project_id, inputs)
get_execution_status(execution_id)
list_pending_human_steps()                            "what's waiting on me?"
submit_step_input(execution_id, step_id, payload)     close a HITL gate from MCP
```

### Resources (cheaper than tool calls)

- `brand://projects/<id>` — full brand blob
- `doc://projects/<id>/<doc_id>` — extracted document text
- `prompt://<id>` — prompt template body
- `workflow://<id>` — workflow definition

Resources are how Claude pulls context without burning tool-call tokens. Mark them cacheable with appropriate ETags.

### What we don't do in v1

- **MCP-served HTML for HITL.** Tempting, but: (a) Claude desktop renders external UIs but ChatGPT's connector model is more limited; (b) you'd be building a parallel UI surface. Ship the dashboard URL as the HITL endpoint first; add inline UIs only when a real workflow demands it.
- **Per-user permission scopes inside MCP.** Everyone on the team sees all projects in v1. Add `project_members`-level scoping in v1.5 once we know which permissions actually matter.

---

## 9. UI / navigation

### App shell

Two-mode sidenav (lifted from Cadenza's `TwoLevelSubnav` pattern):

**Company workspace mode (default):**
```
Riffy
├── Home              today's pending HITL + recent activity + agent suggestions
├── Projects          ← gateway to project workspace
├── Clients
├── Work Orders
├── Purchase Orders
├── Finance           Cashflow · Invoices · Payments
├── Services          (services catalog)
├── Workflows         Catalog · Executions · Templates
├── Prompts           (company-level prompt library)
└── Settings          Company · Members · Integrations · AI Connections
```

**Project workspace mode (when inside a project):**
```
← Back to Workspace
[Project: Acme Rebrand]
├── Overview          PM agent chat + status + key links
├── Brand             the structured branding folder
├── Documents         file library, RAG-indexed
├── Work Orders       project-scoped
├── Workflows         project-bound runs + project-scoped definitions
├── Prompts           project-scoped templates
└── Activity          execution timeline + agent actions + audit log
```

### Key pages worth designing carefully

- **Home** — the "what needs me?" screen. List of pending HITL steps (across all projects), recent agent actions waiting acknowledgment, today's due work orders.
- **Project Overview** — chat with project PM agent + at-a-glance status. The agent has full project context loaded into its system prompt (cached aggressively).
- **Brand editor** — section-tabbed form. Logo/color/font sections need real visual editors, not just text inputs.
- **Workflow execution detail** — timeline of steps, current state, inline UI for the active HITL step.
- **Settings → AI Connections** — where users get their Connector URL + see which connectors they've added.

### Design language

Lift Cadenza's: shadcn/ui base, neutral text on tinted chips for status, Tailwind. Don't redesign primitives — build on Cadenza's existing visual language.

---

## 10. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vite + React 19 + TS + Tailwind + shadcn/ui | Lift Cadenza's setup wholesale |
| Routing | React Router v6 | Same |
| API (web) | tRPC | Same; **port** Cadenza's `orgScopedProcedure` middleware (every procedure scopes by `org_id`) |
| ORM / DB | Drizzle + Postgres on Supabase | Same |
| Auth | Supabase Auth (email + Google) | Same; add OAuth provider config for MCP |
| Storage | Supabase Storage | For brand assets + project documents |
| Vector / RAG | pgvector on the same Postgres | One less service |
| LLM | Anthropic SDK directly, Claude Opus 4.7 default | Prompt caching for brand/system context |
| MCP server | Node + `@modelcontextprotocol/sdk` (TypeScript) | Sibling service; HTTP/SSE transport for Connectors |
| Hosting | Vercel (web) + Supabase (DB+Auth+Storage) + Fly.io or Railway (MCP server) | Cheap, fast, no DevOps burden |
| Payments | (later) Stripe | Not in v1 — first 5 customers are hand-onboarded |

Skip from Cadenza's setup: three-rail deploy ceremony, Edge Functions, multi-env promotion scripts. **One Vercel project, one Supabase project, one MCP server until there are real customers** — the multi-tenancy is in the schema, not the infrastructure.

### Repo shape

Single new repo, monorepo workspace:

```
apps/
  web/            Vite + React dashboard
  mcp/            MCP server (Node, @modelcontextprotocol/sdk)
packages/
  db/             Drizzle schema + migrations
  shared/         Zod schemas, domain types
  trpc/           tRPC routers (consumed by both web and mcp)
  workflow/       Workflow runner + step type implementations
  brand/          Brand schema + validation
docs/             design.md (this), workflows.md, mcp.md
```

---

## 11. Roadmap

### Milestone 0 — Scaffold + tenancy (2 weeks)

- New repo, monorepo bootstrapped (pnpm workspaces).
- Lift Cadenza's `apps/web/src/{components,lib}` shell.
- Supabase project created (single env to start).
- Supabase Auth working (email + Google).
- **`orgs` + `org_memberships` schema; sign-up flow that creates a new org and makes the signer owner; "got an invite?" path joins an existing org.**
- **`orgScopedProcedure` tRPC middleware ported from Cadenza — every procedure resolves and filters by `org_id`.**
- Empty tRPC scaffolding, single route working end-to-end with org scoping.

### Milestone 1 — Company shell (1 week)

- Sidenav + layout + Home (placeholder).
- Clients CRUD, Vendors CRUD, Services catalog CRUD.
- Members page (team list, invite link).
- **Done = the agency can put their basic data in.**

### Milestone 2 — Projects + Brand (2 weeks)

- Projects CRUD, project workspace shell, project-mode sidenav.
- `project_brand` schema + section-tabbed editor (identity → voice → visual → content → channels → references).
- File upload to Supabase Storage for logos/mood boards.
- Document upload + naive text extraction (no embeddings yet).
- **Done = a project has rich, structured context a human can fill in.**

### Milestone 3 — MCP server v0 (2 weeks)

- MCP server scaffold, OAuth flow with Supabase as identity provider.
- Read-only tools: `list_projects`, `get_project_context`, `get_brand_slot`, `list_clients`, `list_work_orders`, `search_documents` (lexical first; embeddings later).
- Resources: `brand://`, `doc://`.
- **Two-path setup screen (D-13) goes live with this milestone** — pre-M3, sign-up routes only to the dashboard path.
- **Done = team can add the Riffy connector to Claude and ask it about their projects.** This is the first demoable wow moment.

### Milestone 4 — Workflow engine v0 (3 weeks)

- Workflow definition schema + JSON editor (Monaco).
- Three step types: `prompt_run`, `human_review`, `human_input`.
- Execution runner (synchronous, no queue).
- HITL inbox on Home page.
- Execution detail page with timeline + active step UI.
- MCP tools: `start_workflow_execution`, `get_execution_status`, `list_pending_human_steps`, `submit_step_input`.
- **Ship the brand-intake workflow as the flagship starter** (`human_input → prompt_run → human_review` → writes `project_brand`). Auto-installed on every new org.
- **Done = a real workflow runs end-to-end with an HITL gate, kickable from either Claude or the dashboard.**

### Milestone 5 — Work Orders + Prompts (1 week)

- Work Orders CRUD (company + project scope).
- Prompt library (company + project scope), used by `prompt_run` step type.
- MCP write tools: `create_work_order`, `update_work_order_status`.

### Milestone 6 — RAG + remaining step types (2 weeks)

- pgvector setup, embeddings pipeline for `project_documents`.
- `search_documents` upgraded to hybrid search.
- `tool_call` step type with image-generation provider (Replicate or fal).
- `human_chat` step type.

### Milestone 7 — Finance + POs (2 weeks)

- Port Cadenza's Cashflow + Invoices + POs (minus inventory).
- MCP read tools for finance/PO.

**Total to a real product: ~15 weeks of focused work** (one extra week vs. the prior estimate, absorbed by Milestone 0 multi-tenant scaffolding). Ship Milestone 3 to a friendly first user and start learning before grinding through 4–7.

---

## 12. Out of scope for v1

These are tempting but explicitly excluded — write them down so they can't sneak in.

- Cross-org users (one user belonging to multiple agencies) — v1 is strict 1 user → 1 org (D-12)
- Visual drag-drop workflow builder
- Background job queue / scheduled triggers
- MCP-served HTML for HITL (use dashboard URL instead)
- Versioned migration of in-flight workflow executions
- Per-project ACLs at MCP level (everyone sees everything in v1)
- Inventory, lots, fulfillment — anything goods-tracking
- Tax engine (computing taxes, CFDI, etc.) — money amounts ARE multi-currency from day one (D-17), but no tax-rate logic in v1
- CFDI / e-invoicing
- Native mobile app
- Stripe / billing — first customers are hand-onboarded
- Public client portal

---

## 13. Decisions log

| ID | Decision | Rationale |
|---|---|---|
| D-1 | Single new repo, no carve-out from Cadenza | Different product, different stack opinions; copy patterns, don't share code |
| D-2 | ~~No `org_id`; single team product~~ **Superseded by D-10.** | Reversed once SaaS positioning was confirmed — Riffy serves many agencies, each isolated. |
| D-3 | Small team allowed (multiple users), but no ACLs in v1 | Get team working without paying the permission-design tax up front |
| D-4 | MCP via Claude Connectors (OAuth-over-HTTP), not stdio | Per-user identity is the whole point; stdio means each user manages their own server |
| D-5 | Workflow definitions as JSON/YAML in v1 | Visual builder is too big to ship first; advanced users prefer JSON anyway |
| D-6 | Synchronous workflow runner in v1 | No queue; HTTP request drives execution until HITL or completion |
| D-7 | Brand stored as structured JSONB + file refs | Slot-level retrieval > re-reading prose; agent can fetch exactly what it needs |
| D-8 | Agent never writes brand directly — proposes via review queue | Brand drift is one-way; humans gate it |
| D-9 | Name: **Riffy** (riffyai.com) | Continues musical Astralitics line; Duolingo-style playful, mascot-friendly, domain available |
| D-10 | Multi-tenant SaaS from day one; `org_id` on every business table | Each agency that signs up at riffyai.com gets isolated workspace. Day-one is ~1 week of scaffolding; retrofit is multi-week with downtime risk. |
| D-11 | Sign-up creates a new agency by default; "Got an invite?" link is the secondary path | Most signups are net-new agencies. Invite path is one click away for the rest. |
| D-12 | v1: one user belongs to one org (defer cross-org membership) | Auth complexity isn't worth the 1% case in v1. Add when a real customer asks. |
| D-13 | Two setup paths at sign-in: "Set up with Claude" (conversational via MCP) or "Set up in dashboard" (form-based) | Both write to the same backend. Lets us dogfood MCP from minute zero while keeping a familiar fallback. |
| D-14 | Brand intake is **a workflow** in the catalog, not a hardcoded onboarding flow | Same engine that powers all other workflows runs intake. Saves a parallel codebase and dogfoods the engine. |
| D-15 | HITL UIs are dashboard pages deep-linked from Claude (path A) — not embedded in chat | Only standardized path today. Artifact-based and MCP-UI-extension paths revisited when Anthropic ships them. |
| D-16 | Founder onboarding (agency setup) is short and one-shot; per-project brand intake (much richer) is a separate workflow each team member runs per client | Avoids overloading sign-up; lets the wow moment land at the right time (first project, not first sign-in). |
| D-17 | All money amounts stored as `(amount_decimal, currency_code)` from day one; default currency per-org but amounts can carry their own | Marketing agencies routinely invoice across borders (US agency → CA client). Single-currency in v1 forces a multi-week migration the moment a customer asks. Same "1 week now vs. multi-week later" tradeoff as tenancy. |
| D-18 | Single `prompt_templates` table with `scope` + nullable `project_id`; same pattern as `workflow_definitions` | Two parallel tables (company / project) duplicates structure with no real benefit. Scope column is the right shape. |

---

## 14. Open questions

| ID | Question | Default if no input |
|---|---|---|
| OQ-2 | Org default currency: USD or MXN at signup? | **USD default**, but amounts stored as `(decimal, currency_code)` from day one (D-17) — agencies often invoice cross-border |
| OQ-3 | First-launch geographic focus: MX, US, or both? | **MX** marketing agencies first; US is fast-follow |
| OQ-4 | Hosting region for MCP server? | `us-east` for latency to Anthropic; revisit if MX users matter |
| OQ-5 | Pricing model when we get there? | **Per-user/month**, no usage-based until churn tells us otherwise |
| OQ-6 | Should the project PM agent be one named persona, or configurable per project? | **Configurable** — name, persona traits, allowed tools — but ship a sensible default |
| OQ-7 | RAG: hybrid (pgvector + tsvector) or just keyword in v1? | **Keyword first** (Milestone 3); embeddings in Milestone 6 |
| OQ-8 | MCP write tools: confirm-before-execute pattern? | **Yes** for any destructive write — return a "preview" first; second call commits. Worth its weight in lost-data avoidance. |
| OQ-9 | Multi-language UI from day one (en + es)? | **en only** for v1 — Cadenza taught us i18n is non-trivial; defer until we have an es-only customer |
| OQ-10 | Where does a user manage their MCP connection? | Settings → "AI Connections" page with their connector URL, recent calls, disconnect button |

---

## 15. Onboarding flows

Three distinct flows, designed separately. Don't conflate.

### 15.1 Founder onboarding (Ana)

The agency owner signs up. Goal: get a workspace live and the team invited in <10 minutes. Flow:

1. **Land on riffyai.com** → click "Start your workspace" → sign up with email/Google (Supabase Auth).
2. **Pre-create empty org.** First sign-up call creates the `orgs` row and an `org_memberships` row marking the user as `owner`. Connector URL is live immediately.
3. **Choose setup path** — single screen, two equal-weight cards (D-13):
   - **"Set up with Claude"** — conversational via MCP.
   - **"Set up in dashboard"** — form-based wizard.
   - *(Tertiary link: "Just want to look around?" → opens a sample workspace.)*
4. **Claude path** (the unusual one):
   - Riffy shows a handoff screen: connector URL + copy-paste starter prompt + live status indicator (`⚪ Waiting…` → `🟢 Connected as adrian@northstar.com`).
   - User adds connector to Claude → OAuths back into Riffy → returns to Claude → pastes starter prompt: *"Help me set up my Riffy workspace."*
   - Claude reads the MCP server's `instructions` field, sees the empty workspace, walks Ana through: agency description → invite emails → enable starter workflows. Each answer is an MCP tool call writing to the org.
5. **Dashboard path** — same questions in form shape.
6. **Done.** Ana lands on Home with a populated org and pending team invites.

**What founder onboarding does NOT include:** any project, any client, any brand intake. Those are the team's work, per-project.

### 15.2 Teammate onboarding (Carla)

A team member accepts an invite. Even shorter:

1. **Click invite link** → magic-link sign-in → Carla's `users` row + `org_memberships` row are created with `role = member`.
2. **Brief tour** (skippable) — the dashboard, the sidenav, what's already in here.
3. **Connect Claude** — same connector flow as Ana, except her token is scoped to the same org Ana created. Her per-user inbox starts empty.
4. **Done.** Carla now has identical capabilities (in v1, no per-project ACLs — D-3) but her own per-user attribution.

### 15.3 Per-project brand intake (the real product moment)

Every time a team member onboards a new client engagement, they run the **brand intake workflow** (D-14). This is where Riffy's value lands.

- Triggered from Claude (*"Help me onboard Acme Coffee"*) or from the dashboard (*Projects → New project*).
- The workflow itself: `human_input` (paste URL, upload guidelines, freeform basics) → `prompt_run` (LLM extracts the structured brand schema) → `human_review` (review side-by-side, edit, confirm) → saves to `project_brand`.
- The `human_review` step is the canonical HITL deep-link (D-15): a focused single-step page in the dashboard, opened from Claude as a clickable link, returning to chat when complete.

**This is the workflow that proves the engine works.** Build it well; everything else benefits.

### 15.4 Activation funnel

| Stage | Time | Drop-off risk | Mitigation |
|---|---|---|---|
| Sign up | 2 min | Low | Single screen, no card |
| Pick setup path | 30 sec | Low | Two clear cards |
| Agency setup (Claude or dashboard) | 5 min | Medium | Three small questions; both paths feel native |
| Connect Claude (if not done in step above) | 5 min | **Highest** | Video, copy-paste URL, "stuck" CTA, Day-2 nudge email |
| First Claude query returns real data | 30 sec | Low (if they got here) | **Activation event for founder** |
| First project created, brand intake runs | 15 min | Medium | Starter workflow auto-installed; one-click to start |
| First HITL approval | 30 sec | Low | **Activation event for team — they've felt the loop close** |

---

## 16. What I want from you on this draft

Before I scaffold the repo, your read on:

1. **Naming** — Riffy is locked (riffyai.com). ✓
2. **Tenancy model (§4–5, D-10–12)** — multi-tenant SaaS, 1 user → 1 org in v1. ✓
3. **Scope (§11)** — anything you'd cut from v1 to ship faster, or anything missing?
4. **Open questions (§14)** — call the ones with strong opinions; the rest can ride defaults.
5. **The brand schema (§6)** — does it reflect how *you* would want to give an AI agent context about a brand? Anything missing or over-modeled?
6. **Workflow primitives (§7)** — five step types feel right, or different cut?
7. **Onboarding flows (§15)** — does the Ana / Carla / brand-intake split match how you imagine real users entering the product?

Once those are settled, I'll scaffold the new repo (Milestone 0) and we'll have something running locally within a session.
