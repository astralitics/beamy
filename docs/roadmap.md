# Beamy — Execution Roadmap (post-M2)

> **Status:** Forward-looking roadmap based on the **Propuesta** review (Rubén Darío 123, 16 vendors, 122 line items). Captures the pivot from "spec / asset / material as the central planning entity" to **work_items + proposals** as the spine, plus the depth-of-execution things that orbit them.
>
> For the long-form spec see [`design.md`](design.md). This file is the prioritized punch list of what to build *next*, in order of leverage.

---

## 0. Where Beamy is today (Nov 2026)

**M0 → M2 are landed.** Project workspace pattern (Vercel/Supabase style two-mode sidebar), entity-level CRUD for projects / rooms / clients / vendors / services / specs / assets / materials / bills / invoices / documents, project-scoped activity feed reading from `audit_log`, and a project assistant (Claude with read-only tool use over the data graph). Storage backed by local Supabase; documents via signed PUT direct to bucket.

**What's strong:** the *recall layer* — assets (per-instance) + materials (per-batch) + documents tagged to either, plus the assistant that can answer "what fridge in the kitchen?" with manufacturer/serial/warranty.

**What's weak:** the *forward-looking workflow layer* — the actual plan, the vendor bids, the schedule, the change orders, the progress billing. M2 was about **what's installed**; M3 is about **what's happening**.

---

## 1. The Propuesta lesson

The Rubén Darío 123 proposal data is more sophisticated than what M2 currently models in three specific ways. These are not nits — they're the data shape execution requires:

1. **`room_ids` is an array, not a single FK.** Line item V14 ("cambio de empaques de policarbonato") applies to `["bano-2", "bano-3", "bano-1"]` simultaneously. Beamy's `assets` / `materials` / `specs` all have a single `room_id`. A line item that spans 3 rooms breaks today.
2. **Vendor quotes have flags as first-class metadata.** `"iva-not-included"`, `"validity-likely-expired"`, etc. Concise procurement state. Beamy has nothing equivalent.
3. **Per-project FX rates.** USD_MXN, EUR_MXN, MXN_MXN at the project root. Vendors quote in their preferred currency; the project totals in MXN. Beamy stores currency per row but has no project-level conversion.

And one *structural* lesson: **the line item is the natural unit of work.** Not specs (one fridge per row, no quantity), not bills (post-work, lump sum). A line item is what:

- A vendor **quoted** (their proposal carries N of these)
- The client **approved**
- The firm **scheduled**
- The crew **executed**
- A bill **drew against** (often partial)
- Optionally became an **asset/material/install record** at the end

This redefines what "the project plan" *is* in Beamy: it's the table of work_items, filtered by status / trade / room / vendor / overdue. The "Work plan" tab gets repurposed from a rooms-only list to this real plan view.

---

## 2. Tier 0 — base (the next PR, then the one after)

These are the new entities required before anything else makes sense. Two PRs:

### 2.1 `work_items` + `proposals` + `work_item_rooms` (M3-A)

**`proposals`** — vendor bid container. One row per vendor's quote PDF.

```
id, org_id, project_id, vendor_id, trade
quote_number, quote_date, valid_until
subtotal, iva, total, currency
flags text[]   -- "iva-not-included", "validity-likely-expired", etc.
status: received | comparing | accepted | rejected | expired
decided_at
source_document_id  -- FK to documents (the PDF)
notes
```

**`work_items`** — the unit of work. One row per Propuesta line item.

```
id, org_id, project_id, proposal_id (nullable), vendor_id (nullable until contracted)
trade
ref            -- vendor's internal code (V01, S1-01) or auto-assigned
description
qty (numeric), unit (text — "ea", "m2", "ml", "lote", "yd")
unit_price (numeric), unit_price_currency
total (numeric, derived), total_currency
status: specified | approved | scheduled | in_progress | done | accepted | cancelled
planned_start, planned_end, actual_start, actual_end  -- all date, nullable
notes
```

**`work_item_rooms`** — M2M join. Lets V14 attach to all three bathrooms cleanly.

Importer: read `Propuesta/00_dashboard/data/proposal.js`, create the project + rooms + vendors + 1 proposal per vendor + 122 work_items + room joins. Loads the Rubén Darío project as a real workable plan in one shot. (`pnpm db:import-propuesta` or similar.)

UI: Work Plan tab becomes the work_items view (table with filters by status / trade / room / vendor / overdue). Rooms section moves to its own sub-section or its own tab.

### 2.2 Overview-as-dashboard (M3-B)

Cards on the Overview tab surfacing **what needs attention**, reading from the data #2.1 lands:

- N work items past `planned_end` (overdue)
- N work items scheduled this week
- N proposals past `valid_until` (need re-quote)
- N proposals in `comparing` state with no decision yet
- Money: committed (sum of accepted-proposal totals) vs billed vs paid, in MXN equivalent
- Plus the existing per-tab pulses (overdue bills, overdue invoices, etc.) consolidated here

Each card deep-links to the relevant tab pre-filtered. The Overview tab becomes the daily-driver landing surface instead of a static fact block.

### 2.3 Scope-by-room secondary lens (M3-B, same PR)

Lift the `scope-by-room.html` from Propuesta as a second view of the same work_items table. Same data, pivoted: group by room, show every line item that touches that room. Natural for site-walk reviews ("what's happening in the kitchen?"). Toggle between the two views on the Work Plan tab.

---

## 3. Tier 1 — what makes work_items actually usable in execution

These are the depth-of-execution features. Without them, the plan layer is a frozen snapshot, not a living document. Three PRs in this tier; **change orders is mandatory**, the rest in priority order.

### 3.1 Change orders (M3-C) — mandatory

> **Why it's Tier 1, not Tier 2:** the #1 source of budget creep in construction. Without COs, the work_items table becomes fiction the moment execution starts. Day 12, the carpenter pulls baseboards and finds rotted wood. New scope. New money. Client must approve. Skip this and the dashboard's "money committed vs spent" is lying within two weeks.

```
change_orders:
  id, org_id, project_id
  number  -- "CO-01" auto-assigned
  title, description
  status: drafted | sent | approved | rejected | void
  decided_at, decided_by  -- client approval timestamp + name
  signed_document_id  -- FK to documents (the signed PDF)
  total_delta (numeric, can be negative)
  total_delta_currency
  notes
  created_by, updated_by, timestamps

change_order_lines:  -- what the CO actually changes
  id, change_order_id
  work_item_id (nullable — null = new line)
  kind: add | modify | remove
  -- if modify: stores the delta on qty/price/description
  -- if add: stores the full new line spec
  qty_delta, unit_price_delta, description_after
```

UI: COs are their own tab or a section of Work Plan. Each row shows what changed, who approved, how much it moves the budget. Approved COs immediately apply to work_items.

### 3.2 Work item dependencies (M3-D)

```
work_item_dependencies:
  id, work_item_id, depends_on_id, kind: finish_to_start (default) | start_to_start | finish_to_finish
```

Adds `depends_on` semantics to the plan view. "Floor refinish can't start until carpentry is done in those rooms." Enables:

- **"What's blocked"** dashboard card
- **Slip propagation**: when X moves, everything downstream updates
- A simple Gantt-ish timeline view (not full CPM, but enough to see the critical chain)

### 3.3 Progress billing milestones (M3-E)

> **The connective tissue between scope and cash.** INTEGRA's $1M+ smart-home isn't one invoice; it's 30% deposit / 30% delivery / 30% programming / 10% completion. Each milestone is tied to a state transition on its work_items. This is what turns Beamy from "data model" into the firm's books.

```
billing_milestones:
  id, work_item_id (or proposal_id for whole-proposal schedules)
  label  -- "Deposit", "On delivery", "On programming complete", "Final"
  trigger: on_state | on_date | manual
  trigger_state  -- e.g. "in_progress" or "done"
  trigger_date
  pct  -- 0.30 for 30%, or amount + currency for fixed
  amount, currency
  billed_at, bill_id  -- once a bill has been issued for this milestone
```

Bills (existing table) gain `milestone_id` (nullable). The Money tab's pulse cards become honest: committed = sum of milestone amounts whose work_items are accepted, billed = sum of milestones with a bill, paid = sum with `bill.status='paid'`. Retention (10% holdback) falls out naturally as the "final" milestone gated on punch.

---

## 4. Tier 2 — real, but ship after Tier 1 is solid

### 4.1 Site observations / visit log (M3-F)

The day-by-day execution diary. Designer visits twice a week, takes 30 photos. Right now those photos live in WhatsApp; in Beamy they should live tied to rooms + work_items + date.

```
site_visits:
  id, org_id, project_id, visited_at (date), visited_by (user_id or actor)
  weather, on_site_vendors (vendor_id[]), summary
site_observations:
  id, visit_id, room_id (nullable), work_item_id (nullable)
  category: progress | defect | rfi | note | safety
  description
  -- attached photos via documents.site_observation_id (new FK)
```

Mexico City condo projects in particular: HOA typically *requires* a logbook for construction days. This satisfies the legal need and gives the firm a queryable history at the same time.

### 4.2 Bid leveling (multi-proposal compare for one scope)

Right now I assume one proposal = one vendor's quote, and the line items are the line items. But for floor refinishing, you might get 3 quotes. You compare line-by-line ("Lumber/Bona quoted 263 MXN/m²; competitor quotes 245 but excludes baseboards"). You accept one.

Two implementation options:

- **(a) Proposals carry alternates.** Multiple proposals can be flagged as "competing for the same scope". A `proposal_group` row groups them; once one is `accepted`, others auto-`rejected`.
- **(b) Work_items get their bid history.** Each work_item carries `[bid_amounts]` from competing proposals before settling on one.

(a) is cleaner. Defer until at least two projects have used the Tier 0 + Tier 1 stack — pre-optimizing for the multi-bid workflow before knowing how the firm actually leverages bids is wasted modeling.

### 4.3 HOA / building-access constraints

Project-level resource calendar: work hours (Mon–Fri 9–5), freight elevator slots, parking, dust-corridor rules, advance-notice requirements for deliveries. Affects every schedule line in #3.2.

Schema:

```
project_constraints:
  id, project_id, kind: work_hours | elevator_slot | delivery_window | quiet_period | other
  spec (jsonb) -- e.g. { days: ["mon","tue","wed","thu","fri"], start: "09:00", end: "17:00" }
  notes
```

Scheduling UI greys out non-working times. Mexico City reality.

### 4.4 Per-spec client approval audit trail

Specs already have a `client_approved` state, but no timestamp/record of WHO approved and WHEN. Add `approved_by_user_id` / `approved_signature_document_id` (FK to documents) on `spec_items` and on `change_orders`. Closes the legal loop: every scope change has a paper trail.

---

## 5. Tier 3 — mature-firm features, not urgent

Listed without schema; will be revisited when the lower tiers shake out.

- **Lien waivers and retention.** Per-payment compliance. Each progress payment requires a partial waiver from the vendor; final payment requires a full waiver. Retention (10% holdback) releases after punch is complete.
- **Inspections + permits.** Building inspector signoffs (especially MEP), HOA walkthroughs, occupancy certificate. Light on the Rubén-Darío-class refresh project; heavy on ground-up or structural work.
- **Sub-of-sub awareness.** INTEGRA brings their own networking sub. Grupo AVA brings a glass guy. The contracted vendor isn't always the warm body on site.
- **Time tracking.** Designer hours, PM hours. For firms that bill by hour vs. fixed.
- **Vendor performance ratings.** Post-project: would we use them again? Affects future bid leveling.
- **Sample/receipt tracking.** Paint chips, tile samples, fabric samples → approved by client → sent to vendor as reference → matched against installed lot. Closes a recall loop that today's `materials.lot_number` only half-closes.
- **Safety incidents log.** OSHA-equivalent record. Required at scale.
- **Punch list** *(already in M2 placeholders, deferred to v1.5)* — escalates from "general idea" to "the thing that closes the project" once Tier 1 is built. State machine: open → scheduled → done → verified. Final payment gates on full verification.
- **RFIs** *(already in M2 placeholders, deferred to v1.5)* — question → answer → implemented. Drafted from voice/photo; response attaches to the relevant sheet, spec, or work_item.

---

## 6. Cross-cutting things that orbit the whole stack

Not features per se — design discipline that applies to everything in Tier 0–3.

- **Photo-as-source-of-truth.** For finish work, photos at every state transition. Pre-demo, post-demo, pre-paint, post-paint. Per-room photo timeline. The documents table already supports this (asset_id / material_id / room_id FKs); the UI surfacing is what's missing. Should land alongside #4.1.

- **Multi-currency totals.** Add `project_fx_rates` (project_id + currency_from + currency_to + rate + as_of_date). Every totals view shows in project's `primary_currency` (default MXN for the Propuesta project). Eliminates the "$2.79M MXN-ish" hedge in the current README.

- **WhatsApp as the dominant comms channel.** Worth a thread for later: photo + voice memo import from WhatsApp threads → site_observations rows + transcribed notes. Mexico City small-firm reality. Workflow #6 in design.md gestures at this; Beamy should formalize WhatsApp as a first-class input source eventually.

- **Mexican-tax-treatment awareness.** IVA included vs. not (Propuesta vendor flags surface this). When generating client-facing summaries, totals should always reconcile pre-IVA and post-IVA. Currency conversions happen pre-IVA.

---

## 7. Proposed sprint sequence

- **Sprint M3-α** (1–2 days):
  - PR M3-A: `work_items` + `proposals` + `work_item_rooms` + Propuesta importer.
  - PR M3-B: Overview-as-dashboard + scope-by-room secondary lens.
- **Sprint M3-β** (1–2 days):
  - PR M3-C: Change orders.
  - PR M3-D: Work item dependencies + Gantt-ish view.
- **Sprint M3-γ** (1 day):
  - PR M3-E: Progress billing milestones.

After γ: Beamy can run Rubén Darío 123 end-to-end as a real execution tool, not just a recall record. Tier 2 features layer on as the team uses the product on a second/third real project.

---

## 8. What this means for M2 entities

The pivot doesn't kill M2's existing tables — it reframes them:

- **`spec_items`** stays as the *finish specification* record (the fridge model, the paint color). They feed into work_items at procurement time. May ultimately be merged with work_items if duplication shows up; defer that call to when 1+ project is loaded.
- **`assets`** and **`materials`** become **the install record** at the end of a work_item, not parallel planning entities. Their state field collapses to just identity (no lifecycle). They're the "what got installed" half of the recall demo, exactly what they were designed for.
- **`bills`** gain `milestone_id` and link back to the work_items they cover. Money view becomes traceable to scope.
- **`documents`** already supports the document FKs we'll add (`change_order_id`, `site_observation_id`, etc.) — just new columns, no architecture change.

No M2 entity goes away. Several get more useful once they have a real plan to attach to.
