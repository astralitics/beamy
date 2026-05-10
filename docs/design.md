# Beamy — Design Doc (v0)

> **Status:** First-pass design, freshly forked from Riffy's chassis. Nothing built yet beyond the M0 scaffold. Decisions live in §18 (D-1..D-52 — Riffy's chassis decisions inherited verbatim where they carry; D-19..D-52 are Beamy-specific). Open questions in §19.

---

## 1. The pitch

**Beamy is the firm's brain.** Once your projects, vendors, assets, finishes, drawings, and money live in Beamy, it answers any client question in seconds, runs your firm's repeatable workflows for you, and never forgets anything you've ever done. The structuring is real work — but it pays back compounded, project after project.

Concretely: a **dashboard + in-app chat + MCP server triple** for the 5–15 person construction or design agency. The firm's tribal knowledge becomes queryable, draftable, and recallable instead of living in heads, Drives, spreadsheets, and emails.

**The core insight:** these principals already know AI could help — they're using Claude/ChatGPT in tabs already. They can't get value out of it because their data isn't structured. Beamy guides them through structured intake — at their pace, partial completion welcome — and turns the curated data into recall, drafts, and automation. **Onboarding never ends** — every new project, vendor, install, and SOP is more structuring. As soon as a piece of data lands in Beamy, Claude can read it, draft from it, recall it, and act on it.

Three consumers, one backend:

- **Web dashboard** — humans curate projects, vendors, clients, drawings, specs, assets, bills, invoices, todos, and workflows. They drive HITL gates.
- **In-app chat** — same backend, in-product copilot. For team members who don't want to leave Beamy.
- **MCP server** — for users who live in Claude.ai. Same `(user_id, org_id)` scope, same data, same procedures. (Riffy gated this to M3; Beamy treats it as v1 because the principal-as-Claude-user is already there.)

The wedge: **structured project context + live API integrations (money + drawings) + workflow orchestration with HITL gates**. Memory, PM, and workflows are three views of the same structured data.

Initial target: **a 5-person construction GC and a 10-person interior architecture firm** — both real, both observed up close. They share the same underlying pains, so the same product serves both.

---

## 2. Naming

**Beamy.** Short, single-syllable root with a real double meaning — a *beam* is a structural element (construction) and the horizontal line connecting note flags (music). Continues the Astralitics line (Cadenza → Riffy → Beamy), keeps the subtle music thread, signals "structure" to construction users.

The mascot is the same shape as Riffy's: a small character sitting next to you, holding a level. (D-36 supersedes Riffy's D-9.)

---

## 3. Users & personas

Beamy is **multi-tenant SaaS**. Each agency that signs up gets its own isolated workspace ("org"). Within an agency, multiple team members collaborate on shared projects. **Cross-org access is impossible** at the API layer. Personas describe roles within an agency.

| Persona | Reality | What they need |
|---|---|---|
| **Principal / Owner** | Buyer + heaviest power user. Often already a Claude.ai user. Wears 5 hats: estimator, PM, salesperson, accountant, foreman. | One screen for "what needs me?", AI that recalls everything, money visibility, fewer dropped balls. |
| **Project Manager** | Day-to-day project execution; site visits, vendor coordination, client updates. | Project workspace, mobile-friendly site logging, draft assistance for emails/RFIs. |
| **Admin / Bookkeeper** | AP/AR, compliance docs, invoicing. May or may not exist; in 5-person firms the principal is the bookkeeper. | Money workflows that don't fight QuickBooks, compliance dashboard, batch ops. |
| **Specialist** (super, foreman, designer) | Narrow scope — site work, drawings, FF&E selection. | Mobile site visits, quick photo + voice logging. Read-only on most things. |
| **Client** *(read-only, v1.5+)* | Sees their own project portal. Approves change orders, sees decisions, receives closeout package. | Out-of-scope for v1 (handled via emailed PDFs/links). |

**MCP-side:** every team member adds the Beamy connector to Claude once, OAuths in with their Beamy account, and Claude's calls carry their identity. Per-user inbox, per-user attribution, per-user permission scope (in v1.5; v1 has no per-project ACLs).

---

## 4. Mental model

Three nested scopes: **agency (tenant)** → **company workspace** → **project workspace**.

```
┌───────────────────────────────────────────────────────────────────────┐
│ AGENCY  (org / tenant — created on sign-up, isolated from others)     │
│                                                                       │
│   ┌─────────────────────────────────────────────────────────────┐    │
│   │ COMPANY WORKSPACE                                            │    │
│   │   Vendors · Clients · Services ·                             │    │
│   │   Money (Bills · Invoices · Payments · Banking) ·            │    │
│   │   Compliance (COI/W9 by vendor) ·                            │    │
│   │   Workflows · Prompt Library · Settings                      │    │
│   │                                                              │    │
│   │   ┌─────────────────────────────────────────────────────┐   │    │
│   │   │ PROJECT WORKSPACE  (one client engagement)           │   │    │
│   │   │   Overview (project agent chat) ·                    │   │    │
│   │   │   Drawings (sheet sets, versioned) ·                 │   │    │
│   │   │   Specs & Finishes ·                                 │   │    │
│   │   │   Assets (installed — the recall layer) ·            │   │    │
│   │   │   RFIs · Submittals · Change Orders ·                │   │    │
│   │   │   Punch List · Site Logs · Daily Reports ·           │   │    │
│   │   │   Documents · Money (project-scoped) ·               │   │    │
│   │   │   Workflows · Activity                               │   │    │
│   │   │                                                      │   │    │
│   │   │   ↳ Project agent scoped to this project's data,     │   │    │
│   │   │     drawings, specs, installs, history.              │   │    │
│   │   └─────────────────────────────────────────────────────┘   │    │
│   └─────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────┘
                           │
                           │ same Postgres, three front-doors per (user, org)
                           │
   ┌───────────────────────┼─────────────────────┬──────────────────┐
   │                       │                     │                  │
┌──┴──────────────┐ ┌─────┴────────┐  ┌─────────┴────────────┐
│ Web Dashboard   │ │ In-app Chat  │  │ MCP Server           │
│ (Supabase JWT)  │ │ (same auth)  │  │ (per-(user, org)     │
│                 │ │              │  │  OAuth via Connectors)│
└─────────────────┘ └──────────────┘  └──────────────────────┘
                       │
                       └──────▶ same tRPC routers ──▶ Postgres
```

An **Agency** is the tenant boundary — Henderson Construction's data is invisible to Anderson Interiors. A **Project** is a context-bag for one engagement (a kitchen reno, a ground-up custom, a 6-month interior fit-out). Almost everything interesting happens *inside* a project; company-level tables (vendors, clients, money, compliance) are the connective tissue for the agency itself.

**Key relationships:**
- `project.client_id` → required for billable projects (most), nullable for internal/spec work
- `vendor` records persist across projects — the same electrician on 14 projects is one row
- `bill.project_id` / `invoice.project_id` / `change_order.project_id` — project-scoped money is the dominant case
- `workflow_definition.scope` → `'company' | 'project'` (some workflows reusable, some project-specific)
- `prompt_template.scope` → same shape (D-18)

### The wedge framing — structuring is the product (D-22)

These firms' tribal knowledge lives in heads, Drives, spreadsheets, emails. They can't extract AI value because the inputs aren't structured. Beamy's job is to guide them through structuring it — and pay it back compounded.

**Forms-first, with permanent input-ergonomics pressure.** The primary input path is the dashboard's structured forms — projects, vendors, assets, finishes, money. We expect customer effort; the structuring is the work that pays back. But "fill out a 50-question wizard" is a non-starter — **partial completion is first-class.** A vendor with name + phone is valid. A project with name + client + address is valid. Required fields stay minimal; everything else fills in over time.

Every input surface gets relentless ergonomic attention: voice memo → Claude pre-fills the form, PDF drop → Claude extracts the fields, "tell me about it" textarea → Claude drafts the record, smart defaults from past projects, saved templates per project type. All routed through `change_proposals` (D-28) — Claude drafts go to a queue, the principal approves. ***"How does this feel to enter on a phone in the field?"*** is a question on every PR.

The corollary: **onboarding never ends** (D-37). The day a principal stops adding new projects/vendors/SOPs is the day the firm stops growing. Beamy's UX accommodates this — there's no "you've finished setup" moment.

---

## 5. Data model

> Conventions follow [US National CAD Standard v6](https://www.nationalcadstandard.org/) (sheet numbering), [CSI MasterFormat 2020](https://www.csiresources.org/standards/masterformat) (spec sections), and AIA contract documents (G701, G702/G703, G716/F706) where applicable. Where small-firm practice diverges from AIA orthodoxy, we follow practice and capture the divergence as a decision.

### Identity, tenancy & access (carries from Riffy)

```
users                  Supabase Auth (id, email, display_name, avatar_url) — global
orgs                   id, name, slug, default_currency, locale,
                       owner_user_id, created_at
org_memberships        user_id, org_id, role (owner | admin | member),
                       invited_by, joined_at
                       (v1: 1 user → 1 org — D-12)
invitations            id, org_id, email, role, invited_by, token,
                       expires_at, accepted_at?, accepted_by_user_id?
audit_log              id, org_id, actor (text — "user:<id>" / "agent:claude" /
                       "webhook:<src>"), action, resource_type, resource_id,
                       payload (jsonb), ts
```

**Multi-tenancy is a v1 invariant.** Every business table below has `org_id NOT NULL`. Every tRPC procedure resolves the active org from the auth context (`orgScopedProcedure`) and filters all reads/writes by it. Cross-org access is impossible at the API layer (D-10).

### Company-level

```
clients                id, name, primary_contact, address, status, notes, tags[]
client_contacts        many-to-one back to clients (name, role, email, phone)

vendors                id, name, trade ('electrical' | 'plumbing' | 'framing' | ...),
                       primary_contact, address, status,
                       default_rate_amount, default_rate_currency, billing_unit,
                       payment_terms_id, ein?, w9_document_id?, notes, tags[]
vendor_contacts        many-to-one
vendor_compliance      vendor_id, doc_type ('w9' | 'coi_general' | 'coi_workers_comp' |
                       'license' | 'other'), document_id, effective_from, expires_at,
                       coverage_amount?, coverage_currency?, status
                       — drives compliance dashboard + reminder workflows

services               services catalog (firm's standard offerings)
                       id, name, description, default_rate_amount, default_rate_currency,
                       billing_unit (hour | project | retainer | unit | sq_ft)

prompt_templates       id, scope ('company' | 'project'), project_id?,
                       name, body (markdown), variables (jsonb schema),
                       version  — single table covers both scopes (D-18)
```

### Money — see §9 for the full engine

```
bills                          id, org_id, vendor_id, project_id?, bill_number,
                               issued_date, due_date, status (draft | open |
                               partially_paid | paid | voided),
                               subtotal_amount, tax_amount, total_amount, currency,
                               external_source ('qb' | 'stripe' | 'plaid' | 'manual'),
                               external_id?, external_sync_token?, last_synced_at?,
                               is_superseded boolean default false, superseded_by_id?,
                               source_document_id?  -- the PDF this bill was extracted from
bill_lines                     id, bill_id, line_no, description, quantity,
                               unit_amount, unit_currency,
                               total_amount, total_currency,
                               cost_center_id?, expense_category_id?
vendor_payments                id, org_id, vendor_id, bank_account_id?,
                               method ('check' | 'ach' | 'card' | 'wire' | 'other'),
                               scheduled_for?, paid_at?, status,
                               total_amount, total_currency,
                               external_source, external_id?, external_payment_id?
bill_payment_allocations       bill_id, payment_id, amount, currency
                               — M:N (a payment can settle multiple bills, a bill
                                 can be paid by multiple payments)

invoices                       id, org_id, client_id, project_id?, invoice_number,
                               issued_date, due_date, status (draft | sent |
                               partially_paid | paid | voided), subtotal, tax,
                               total, currency, external_source, external_id?,
                               retention_percent?, retention_amount?, retention_released_at?
invoice_lines                  id, invoice_id, line_no, description, quantity,
                               unit_amount, unit_currency, total_amount, total_currency,
                               service_id?, project_phase_id?
client_payments                id, org_id, client_id, invoice_id?, method,
                               received_at, status, total_amount, total_currency,
                               external_source, external_id?
invoice_payment_allocations    invoice_id, payment_id, amount, currency

bank_accounts                  id, org_id, name, account_class ('asset' | 'liability'),
                               currency, opening_balance, opening_date,
                               external_source, external_id?
bank_transactions              id, org_id, bank_account_id, ts, amount (signed),
                               description, balance_after?, source ('plaid' | 'csv' |
                               'manual' | 'seed'), external_id?,
                               matched_to_type?, matched_to_id?, imported_batch_id?

integration_connections        id, org_id, provider ('qb' | 'stripe' | 'plaid'),
                               external_account_id (qb realm_id / stripe account_id /
                               plaid item_id), credentials_encrypted,
                               connected_at, disconnected_at?, status, last_sync_at?,
                               last_sync_cursor?
integration_webhook_events     id, provider, external_event_id, payload (jsonb),
                               received_at, processed_at?, error_class?
                               — unique on (provider, external_event_id) for dedup
```

### Project workspace

```
projects                  id, org_id, name, slug, client_id?, address,
                          project_type ('residential_renovation' | 'residential_new' |
                          'commercial_fitout' | 'interior_design' | ...),
                          contract_amount?, contract_currency?,
                          status ('lead' | 'active' | 'on_hold' | 'completed' | 'archived'),
                          started_at?,
                          substantial_completion_at?,                    -- D-43: explicit, dated event;
                          substantial_completion_signed_document_id?,    -- triggers retainage clock, warranty start,
                          substantial_completion_certified_by_user_id?,  -- punch creation, owner occupancy
                          closed_out_at?,
                          owner_user_id, created_at
project_phases            id, project_id, phase_label text,    -- D-41: soft tag, not state machine
                                                               -- per-org configurable list with sensible defaults:
                                                               --   design: pre_design, sd, dd, cd, bidding, ca
                                                               --   construction: pre_construction, mobilization, demo,
                                                               --     site, foundation, framing, roofing, mep_rough,
                                                               --     insulation, drywall, finishes_interior,
                                                               --     finishes_exterior, punch, closeout
                          started_at?, completed_at?, planned_start?, planned_end?
project_members           project_id, user_id, role ('owner' | 'editor' | 'viewer')

rooms                     id, project_id, name,
                          room_type ('kitchen' | 'master_bath' | 'powder' | 'living' |
                          'dining' | 'bedroom' | 'office' | 'mudroom' | 'laundry' |
                          'mechanical' | 'exterior' | 'other')?,
                          notes, primary_photo_id?
                          -- Anchor for asset.room_id + material_applications.room_id

assets                    id, org_id, project_id, room_id?,
                          category ('appliance' | 'plumbing_fixture' | 'light_fixture' |
                          'hardware' | 'furniture' | 'casework' | 'mechanical_equipment' |
                          'electrical_equipment' | 'other'),
                          csi_section?,                            -- typically Div 11 (Equipment) or 12 (Furnishings)
                          parent_asset_id?,                        -- D-46: sub-component hierarchy
                                                                   --        (fridge → compressor + water filter)
                          manufacturer, model_number, product_line?,
                          serial_number?,                          -- per-instance occurrence identity
                          asset_tag?,                              -- internal QR/UUID; serial may be missing/duplicate

                          -- Procurement lifecycle
                          state ('specified' | 'client_approved' | 'ordered' |
                                 'in_production' | 'shipped' | 'received' |
                                 'installed' | 'punched' | 'accepted'),
                          vendor_id?, supplier_purchase_order_ref?,
                          lead_time_weeks?, ordered_at?, expected_delivery_at?, received_at?,
                          approved_at?, approved_by_user_id?,

                          -- Pricing
                          unit_cost_amount, unit_cost_currency,    -- trade cost
                          client_price_amount?, client_price_currency?,  -- with markup

                          -- Install record
                          install_date?, installed_by_vendor_id?,
                          install_photo_id?,

                          -- Warranty (the recall payload)
                          warranty_start_date?, warranty_end_date?,
                          warranty_terms_text?, warranty_terms_document_id?,
                          warranty_provider?,
                          receipt_document_id?,

                          notes, custom_attributes (jsonb)?
                          -- The recall record for individually-identifiable maintained items.
                          -- "What fridge in the Anderson kitchen?" hits this row.

asset_service_events      id, asset_id, event_type ('install' | 'repair' | 'maintenance' |
                          'replacement' | 'inspection'),
                          performed_at, performed_by_vendor_id?, summary,
                          photo_ids[], cost_amount?, cost_currency?
                          -- Service history per asset (CMMS pattern). Mostly empty in v1; populates over time.

materials                 id, org_id, project_id,
                          category ('paint' | 'tile' | 'flooring' | 'grout' |
                          'wallpaper' | 'countertop_material' | 'cabinet_finish' |
                          'trim_material' | 'roofing_material' | 'siding' | 'other'),
                          csi_section?,                            -- typically Div 09 (Finishes)
                          manufacturer, product_line, color_name?,
                          color_code?, finish_code?, sheen?,       -- paint-specific
                          sku?,
                          lot_number?,                             -- D-47: dye lot — recall critical
                                                                   --        for tile/paint/flooring repair matching

                          -- Procurement lifecycle (same shape as assets but no warranty)
                          state ('specified' | 'client_approved' | 'ordered' |
                                 'shipped' | 'received' | 'installed'),
                          vendor_id?, supplier_purchase_order_ref?,
                          lead_time_weeks?, ordered_at?, received_at?,
                          approved_at?, approved_by_user_id?,

                          -- Quantities
                          unit_of_measure ('sqft' | 'sqm' | 'gallons' | 'liters' |
                                           'linear_ft' | 'linear_m' | 'boxes' | 'each'),
                          quantity_installed numeric?, quantity_unit text?,

                          -- Pricing
                          unit_cost_amount, unit_cost_currency,
                          client_price_amount?, client_price_currency?,

                          -- Install record
                          install_date?, installed_by_vendor_id?,
                          install_photo_id?, sample_photo_id?,
                          spec_sheet_document_id?, safety_data_sheet_document_id?,

                          -- Attic stock (D-48 — leftover for repair matching)
                          attic_stock_quantity?, attic_stock_unit?,
                          attic_stock_location?,                   -- "garage shelf B"

                          notes, custom_attributes (jsonb)?
                          -- The recall record for batch-installed consumables.
                          -- "What tile + grout did we use in the Anderson primary bath?" hits this row +
                          -- material_applications.

material_applications     id, material_id, room_id, surface ('floor' | 'wall' |
                          'ceiling' | 'cabinet_face' | 'countertop' | 'backsplash' |
                          'trim' | 'exterior' | 'other'),
                          coverage_quantity numeric?, coverage_unit text?,
                          notes
                          -- A material gets installed across N surfaces in N rooms.
                          -- Most paint applications: kitchen walls + ceiling (2 rows).
                          -- Most tile: bath floor + bath wall (2 rows).

drawings                  id, project_id, sheet_number text,  -- 'A-101', 'A1.0', 'Sheet 3' — store raw
                          discipline_code text?,                -- NCS Level 1: G/H/V/B/C/L/S/A/I/Q/F/P/D/M/E/W/T/R/X/Z/O
                                                                -- (note: 'I' for Interiors, 'F' for Fire — NCS canon)
                          sheet_type_code text?,                -- NCS sheet type digit: 0/1/2/3/4/5/6/7/8/9
                          sheet_sequence text?,                 -- last 2 digits or whatever the firm used
                          title, current_revision_id
                          -- D-38: store sheet_number as raw text + parsed components; no NCS enforcement
drawing_revisions         id, drawing_id, rev_label text,       -- '0','1','2' | 'A','B','C' | firm-specific
                          issue_state ('SD' | 'DD' | 'IFP' | 'IFB' | 'IFC' |
                          'addendum_1' | 'addendum_2' | 'asi_1' | 'as_built' | ...),
                          issue_date, description (rev cloud reason),
                          file_id (link into documents),
                          extracted_text?  -- for search; populated by `unpdf` server-side
drawing_sets              id, project_id, name, issued_at, issue_state,
                          drawing_revision_ids[]  -- a set is a snapshot of revisions
                          -- D-31: per-sheet revisions are canonical; combined bookmarked PDF generated on demand

documents                 id, org_id, project_id?, file_path (Supabase Storage),
                          mime_type, file_size_bytes, original_filename,
                          uploaded_by_user_id, uploaded_at,
                          doc_type ('photo' | 'pdf' | 'drawing' | 'contract' |
                          'invoice' | 'receipt' | 'warranty' | 'other'),
                          extracted_text?, extracted_metadata (jsonb)?,
                          ocr_status, ocr_completed_at?
photos                    id, document_id, project_id, taken_at?,
                          location_room?, location_surface?,
                          tagged_asset_id?, tagged_finish_id?, tagged_punch_item_id?,
                          condition ('progress' | 'defect' | 'install' | 'reference')

rfis                      id, project_id, rfi_number text,    -- e.g. 'RFI-0042' or 'GC-RFI-007'; firm-configurable prefix
                          subject, question, suggested_resolution?,
                          from_party text?, addressee_user_id?, addressee_vendor_id?,
                          addressee_email?,
                          status ('draft' | 'open' | 'closed'),  -- Procore convention; closed-draft = closed without ever opened
                          requested_response_by?, responded_at?, response_text,
                          cost_impact_note?, schedule_impact_note?,
                          related_drawing_revision_ids[], related_spec_section?,
                          attachments_document_ids[]
submittals                id, project_id, submittal_number text,  -- '<csi>-<seq>-<rev>' e.g. '09 91 23-001-1'
                          csi_section text?,                       -- 6-digit MasterFormat (D-38: optional)
                          submittal_type ('shop_drawing' | 'product_data' | 'sample' |
                          'mockup' | 'qc_submittal' | 'om_manual' | 'closeout'),
                          action_class ('action' | 'informational'),
                          target_type ('asset' | 'material')?,     -- polymorphic — submittal is for a procured item
                          target_id?,                              -- → assets.id OR materials.id
                          vendor_id, current_version,
                          status ('submitted' | 'under_review' | 'approved' |       -- A
                          'approved_as_noted' | 'revise_resubmit' | 'rejected' |    -- AAN | R&R | R
                          'fio'),                                                    -- For Information Only
                          submitted_at, reviewed_at?, reviewed_by_user_id?
submittal_versions        id, submittal_id, version_number, document_id,
                          submitted_at, status, review_comments

change_orders             id, project_id, co_number, title, description,
                          state ('proposed' | 'signed' | 'rejected' | 'void'),  -- D-39: 2-state default for small firms
                          stage ('pco' | 'cor' | 'co' | 'ccd')?,                -- optional upgrade path to AIA 3-stage + CCD
                          cost_impact_amount, cost_impact_currency,
                          schedule_impact_days,
                          contract_sum_before, contract_sum_after,
                          contract_time_before_days?, contract_time_after_days?,
                          requested_by, requested_at, signed_at?,
                          signed_by_client_user_id?, signature_document_id?

schedule_of_values        id, project_id, version, status ('draft' | 'active'),
                          locked_at?
                          -- D-40: SOV is the primary persisted entity; G702/G703 forms rendered on demand
sov_lines                 id, sov_id, line_no, description, scheduled_value_amount,
                          scheduled_value_currency, csi_section?
pay_applications          id, project_id, sov_id, app_number, period_start, period_end,
                          retainage_percent, status, certified_amount?, certified_at?,
                          certified_by_user_id?, document_id?  -- the rendered G702 PDF
pay_application_lines     pay_app_id, sov_line_id,
                          completed_previous, completed_this_period, materials_stored,
                          completed_to_date, percent_complete, balance_to_finish, retainage

punch_items               id, project_id, item_number, location_room?,
                          trade?, description, condition ('defect' | 'incomplete' |
                          'preference'), assigned_to_vendor_id?,
                          status ('open' | 'in_progress' | 'ready_for_review' | 'closed' |
                          'reopened'),
                          scheduled_for?, completed_at?, verified_by_user_id?,
                          verified_at?, primary_photo_id NOT NULL  -- photo per item is the killer feature; schema enforces

daily_logs                id, project_id, log_date, weather_conditions?,
                          crews_on_site (jsonb)?, work_performed,
                          deliveries (jsonb)?, visitors (jsonb)?, issues,
                          authored_by_user_id, voice_memo_document_id?

site_visits               id, project_id, visited_at, visitor_user_id,
                          summary, voice_memo_document_id?,
                          related_punch_item_ids[], related_rfi_ids[],
                          photo_ids[]

todos                     id, org_id, project_id?, vendor_id?,
                          owner_user_id (personal todos: scoped to a single user),
                          title, description, due_at?,
                          status ('open' | 'doing' | 'done' | 'cancelled'),
                          source ('manual' | 'workflow' | 'agent_proposal'),
                          source_workflow_run_id?
                          — personal + project-shared todos, same table

threads                   id, org_id, project_id?, scope ('chat' | 'rfi' | 'punch' |
                          'spec' | 'change_order'), participant_user_ids[],
                          related_resource_type?, related_resource_id?
thread_messages           id, thread_id, author_actor (text), body, ts, attachments[]
                          — the in-app chat surface
```

### Workflow engine — see §11

```
workflow_definitions      id, name, description, scope ('company' | 'project'),
                          project_id?, version, definition_json, status,
                          created_by_user_id, published_at,
                          trigger_type ('manual' | 'scheduled' | 'signal'),
                          trigger_config (jsonb)
workflow_runs             id, definition_id, definition_version, project_id?,
                          status ('queued' | 'running' | 'awaiting_human' |
                          'completed' | 'failed' | 'cancelled'),
                          started_by_user_id?, started_at, completed_at,
                          current_step_id, inputs_json, outputs_json,
                          trigger_source ('manual' | 'cron' | 'signal:<name>')
workflow_run_steps        id, run_id, step_id, type, status, attempt,
                          inputs_json, outputs_json, started_at, completed_at,
                          awaiting_user_id?
workflow_run_events       append-only: type (step_started, step_completed,
                          human_input, agent_message, signal_received, ...),
                          payload (jsonb), ts

change_proposals          id, org_id, project_id?, proposed_by (actor string),
                          target_resource_type ('asset' | 'material' |
                          'change_order' | 'bill' | 'invoice' | 'todo' | ...),
                          target_resource_id?, proposed_op ('create' | 'update' |
                          'delete'), proposed_value (jsonb),
                          rationale, status ('pending' | 'approved' | 'rejected'),
                          decided_by_user_id?, decided_at?
                          — generalizes Riffy's brand_change_proposals (D-28)
```

### Why `org_id` everywhere

Multi-tenant SaaS — each agency is fully isolated. `org_id` on every business table; every tRPC procedure scopes by it. The cost of doing this on day one is ~1 week of scaffolding; the cost of retrofitting it later is multi-week with downtime risk. **Day-one is the right call.** (D-10)

---

## 6. Tenancy & auth (carries from Riffy)

- **Auth:** Supabase Auth (email + Google) for web + chat. OAuth 2.1 (Claude Connectors) for MCP — issues the same `(user_id, org_id)`.
- **Sign-up = `protectedProcedure.mutation`** that creates the `orgs` row + `org_memberships(role: "owner")` row in one transaction. The `users` row is implicit (Supabase Auth).
- **Invite redemption = `protectedProcedure.mutation`** consuming a token from `invitations` and creating an `org_memberships(role: <invitation.role>)` row.
- **v1: 1 user → 1 org** (D-12). The schema enforces this with a unique index on `org_memberships.user_id`.

---

## 7. tRPC procedure tiers (carries from Riffy)

```
publicProcedure         no auth (ping, health)
protectedProcedure      requires authenticated user (sign-up, accept-invite, list-orgs)
orgScopedProcedure      requires user + org membership; injects orgId + role  ← default
```

99% of procedures should be on `orgScopedProcedure`. Promote up only with a concrete reason. **Do NOT add a procedure on `protectedProcedure` for tenant-data access.** (Cadenza's anti-pattern: trusting cookie-resolved `ctx.orgId` on `publicProcedure`. Don't repeat it.)

---

## 8. Audit (carries from Riffy)

Every business write goes through `db.transaction(async (tx) => { … insert business row; tx.insert(audit_log).values({ actor: ctx.actor, action, resource_type, resource_id, payload }) })`. The pattern is non-negotiable.

`actor` string format: `"user:<uuid>" | "agent:claude" | "webhook:<src>"`. Computed once in tRPC context, stamped on every audit-log entry.

Future: a generic `finance_events` log layered on top of the existing `audit_log` once finance data needs SOX-friendly per-entity timelines. Not v1.

---

## 9. Money (the engine)

Beamy is finance-heavy by design. Construction is money-heavy: bills to subs, invoices to clients, retainage, change orders, draws, vendor terms, AP/AR aging. This section pins the architecture and the path to a reusable `@common/finance` package shared across Beamy, Cadenza, Riffy, and future Astralitics apps.

### 9.1 Posture (D-24)

**Beamy is never the accounting ledger of record.** The user's accounting tool — QuickBooks Online for v1 — is the source of truth. Beamy is the operational/contextual layer that overlays project + vendor + workflow context onto financial data. Reconciliation lives in QB (and eventually the user's bank).

This means:
- We don't build a chart of accounts.
- We don't do double-entry bookkeeping.
- We don't compute taxes (D-34 — single-jurisdiction firms don't need it; defer).
- We do sync bills, invoices, payments, vendors, and customers in both directions with QB.
- We do hold project + vendor + workflow context that QB will never have.

### 9.2 Money primitives (D-17 carries)

- **All money amounts stored as `(amount, currency_code)` pairs.** Both set or both null. Decimal strings end-to-end (`numeric(18,4)` in DB, regex-validated string at the edge — never floats).
- **Per-org `default_currency`** is a UX hint, not a constraint. Each amount carries its own currency.
- **No FX engine in v1** (D-33). Single home currency per org is the default; the column exists for the day a US firm hires a Canadian sub.

The shared package (`@common/finance`) exports:
- `money(name)` Drizzle column factory → `numeric(18,4)`
- `currency(name)` → `text`
- `moneyPair` Zod schema with `superRefine` enforcing both-or-neither
- `auditColumns` mixin (`createdAt`, `updatedAt`, `createdBy`, `updatedBy`)

### 9.3 Integration architecture (D-25, D-26, D-27)

Every record sourced from an external system carries:
- `external_source text NOT NULL` — `'qb' | 'stripe' | 'plaid' | 'manual'`
- `external_id text` — provider's ID (QB realm_id+id pair, Stripe charge id, Plaid transaction id)
- `external_sync_token text?` — for QB optimistic concurrency
- `last_synced_at timestamptz?`
- `sync_status text NOT NULL` — `'unsynced' | 'synced' | 'drift_detected' | 'ignored'` (D-49)
- `last_compared_at timestamptz?`

Unique index: `(external_source, external_id)` for dedup.

**Predicted-vs-actual flip pattern (D-26):** every integration-sourced record has `is_superseded boolean default false` + `superseded_by_id uuid?`. Beamy can write predictions (e.g., a draft bill from a PDF Claude extracted before the sub officially invoices); when QB sends the actual, the prediction flips to superseded, the actual lands fresh.

**Adapter contract (D-27):**

```ts
interface IntegrationAdapter<TConnectInput, TPullCursor, TEntity> {
  readonly provider: 'qb' | 'stripe' | 'plaid';

  // OAuth/Link kickoff — returns a redirect URL or link_token
  startConnect(orgId: string): Promise<{ url?: string; linkToken?: string; state: string }>;

  // Exchange code/public_token for credentials, persist to integration_connections
  finishConnect(orgId: string, input: TConnectInput): Promise<{ externalAccountId: string }>;

  // Revoke + clear credentials
  disconnect(orgId: string): Promise<void>;

  // Incremental pull. cursor is opaque per provider:
  //   QB → ISO timestamp (CDC changedSince)
  //   Stripe → event id + created_at, OR none if pure webhook-driven
  //   Plaid → next_cursor string from /transactions/sync
  pullChanges(orgId: string, cursor: TPullCursor | null): Promise<Result<{
    entities: TEntity[];
    nextCursor: TPullCursor;
    hasMore: boolean;
  }, ProviderError>>;

  // Outbound write (Plaid throws NotSupported — read-only)
  pushChange(orgId: string, entity: TEntity): Promise<Result<{ externalId: string; version?: string }, ProviderError>>;

  // Webhook ingestion: verify signature, return canonical event for the queue
  parseWebhook(rawBody: Buffer, headers: Record<string, string>): Promise<Result<{
    externalEventId: string;
    eventType: string;
    orgIdHint?: string;          // Stripe: from event.account; QB: from realmId; Plaid: from item_id
    payload: unknown;
  }, ProviderError>>;
}

type ProviderError =
  | { class: 'rate_limit'; retryAfterMs?: number }
  | { class: 'auth_failed'; needsReauth: boolean }
  | { class: 'schema_mismatch'; details: string }
  | { class: 'transient'; cause: unknown }
  | { class: 'other'; cause: unknown };
```

Same shape on every integration boundary, swappable for testing. Plaid implements `pushChange` as a `NotSupported` throw — keeps the interface symmetric and makes the read-only nature explicit at the type level.

**Webhook ingestion (generic):** one `integration_webhook_events` table for all providers — schema in §5. Unique index on `(provider, external_event_id)` for dedup. Provider-specific event-id synthesis where the provider doesn't natively give us one (QB: `realmId + entity_id + lastUpdated + operation`; Plaid: rely on the cursor's natural idempotency since `/transactions/sync` is replay-safe).

**Token storage (D-45):** OAuth credentials encrypted via **envelope encryption** — per-row data encryption key (DEK) wrapped by a key-encryption key (KEK) managed in AWS KMS / GCP KMS / Supabase Vault. Don't rely solely on Postgres `pgcrypto`; that puts the key on the DB host. Aligns with [RFC 9700](https://datatracker.ietf.org/doc/rfc9700/) and Google's OAuth best practices. Rotate refresh tokens on every refresh (QB now rotates ~daily as of Nov 2025; Stripe and Plaid don't rotate but should still be re-stored on every refresh to update `last_refreshed_at`).

### 9.4 Rail-agnostic AR/AP closure (D-50)

AR and AP closure in Beamy is **independent of payment rail.** A Beamy invoice or bill is closeable via:

- **Manual mark** — principal records "check #1247 cleared today, $4,200" (check / wire / cash / ach_direct / card / other)
- **QB sync** — payment lands in QB → CDC pulls it → Beamy auto-closes the matching invoice/bill
- **Stripe webhook** (v1.5+) — `invoice.paid` event lands → Beamy auto-closes
- **Plaid** (v1.5+) — bank deposit matches an outstanding invoice amount → reconciliation surface offers a one-click match

The `invoice` / `bill` is the canonical entity. The `payment` record carries the rail (`rail: 'manual_check' | 'manual_wire' | 'manual_ach' | 'manual_card' | 'manual_other' | 'qb_sync' | 'stripe' | 'plaid_match'`). v1 ships **manual + qb_sync rails only**; Stripe and Plaid light up as optional rails post-v1, when a customer asks. Construction-firm clients pay by check, wire, or ACH-direct as often as digitally — building Stripe-as-central-AR-loop would have been overbuilt for the GC use case.

### 9.5 Domain entities (Cadenza-shape, Riffy-discipline)

Drawn from the Cadenza audit's keystone patterns:

- **Bill ↔ Payment ↔ Allocation triple** — `bills` + `vendor_payments` + `bill_payment_allocations` (M:N). Same on the AR side: `invoices` + `client_payments` + `invoice_payment_allocations`.
- **Header rolls up child events** — bills carry `subtotal/tax/total/paid_to_date`. Payments arriving against bills update rollups in a transaction.
- **Snapshot, don't derive** — invoice lines snapshot service rate at issue time; bills snapshot vendor address. "Issued documents are historical records."
- **State machine on header rows** — `status` enum with explicit transitions. State-changing writes are audit-logged by definition.
- **Bank ledger pattern** — `bank_accounts` (asset|liability) + signed `bank_transactions` + match polymorphic `(matched_to_type, matched_to_id)` to reconcile against bills/invoices/transfers.

### 9.6 What ships in v1 vs placeholder

| Layer | v1 | Placeholder strategy |
|---|---|---|
| Money primitives, audit columns | **Build** | — |
| Bills, invoices, payments, allocations tables | **Build** | — |
| External-id + external-source columns + dedup index | **Build** | — |
| QB Online — read-only auto sync (pull bills, invoices, payments, vendors, customers) | **Build** | — |
| QB Online — manual push-to-QB on user approval (e.g., Claude-extracted bill → principal approves → "Push to QB" button creates the bill in QB) | **Build** | Full automatic two-way sync deferred — manual button keeps principal in control of every write |
| Reconciliation surface — unmatched in Beamy / unmatched in QB / drift detection (vendor or amount or date mismatches) with link/resync/ignore actions | **Build** | First-class because we *expect* drift between systems and we want the principal to see + resolve it (D-49) |
| Manual payment recording with rail enum (check / wire / ACH-direct / card / cash / other) | **Build** | The universal AR/AP closure path; rail-agnostic. |
| Stripe — receive client payments via Connect Standard + Invoicing API | **Defer to v1.5** | Optional payment rail; many construction-firm clients pay by check/wire. Lights up when a customer asks. (D-50) |
| Plaid — bank transactions sync | **Stub interface** (`csv` source ships as fallback) | Real impl when a customer asks |
| Webhook ingestion table + dedup | **Build** | — |
| Predicted-vs-actual `is_superseded` column | **Build (column in place)** | Reconciliation logic minimal in v1; QB writes overwrite predictions |
| Tax engine | **Skip** (D-34) | Cadenza's `tax_lines` pattern documented; revisit for multi-state |
| FX / multi-currency conversion | **Skip** (D-33) | Column exists; conversion deferred |
| Accrual log + reconciliation primitives | **Skip** | Pattern documented; needed when reconciliation becomes a real feature |
| Effective-dated history (rates, fees) | **Skip** | Not needed until pricing rules get complex |

### 9.7 Path to `@common/finance` (D-35)

For Beamy v1: the shared engine lives at `packages/finance/` *inside Beamy*, with a clean export surface (the keystones above + the adapter interfaces). No cross-repo dependency yet — we don't refactor a working Cadenza on an unproven shared package.

**Extraction trigger:** when Beamy's finance flows stabilize (~M5/M6) AND Cadenza or Riffy hit a finance feature where they'd need the same primitives, we extract `packages/finance/` into a separate published package and migrate the consumers. Three real consumers driving the API beats hypothetical generality.

---

## 10. Documents — photos, PDFs, CAD

Construction is document-heavy: photos of every install, multi-hundred-page drawing sets, contract PDFs, manufacturer warranties, invoice PDFs.

### 10.1 What's first-class in v1 (D-30, D-31)

- **Photos** — phone upload → tag (project + room + scope + condition + asset/finish/punch link). Storage: Supabase Storage. Thumbnailing on upload.
- **PDFs (general)** — upload + display. PDF text extraction (vector text) for searchable storage. OCR for scanned PDFs deferred to v1.5.
- **PDFs (bill/invoice)** — Claude extracts vendor + line items + amounts on upload, pre-fills a draft bill record awaiting principal review (D-32). The killer ingestion path.
- **CAD plans (PDF format)** — first-class. Sheet-indexed (`A-101`, `S-201`, etc.), revision-tracked (`IFP → IFB → IFC → as-built`), set-versioned. Searchable text inside drawings.

### 10.2 What's deferred

- **DWG inline render** — store + download in v1; auto-convert to PDF on upload for preview in v1.5. (Most small firms work in PDF anyway; DWG is the architect's source format that gets converted before issue.)
- **Markup tools** (cloud markups, redlines) — defer. Bluebeam-replacement-level work isn't v1 scope.
- **Drawing-content Q&A** — *"what does sheet A4.2 say about kitchen tile?"* — works in v1 via extracted text + standard RAG. Vision-based drawing analysis deferred.

### 10.3 Schema (referenced from §5)

- `documents` — generic file table, `doc_type` discriminates
- `photos` — extends `documents` with location/tagging
- `drawings` + `drawing_revisions` + `drawing_sets` — versioning + indexing model

### 10.4 Tooling stack

| Layer | Pick | Why |
|---|---|---|
| Browser viewer | **`react-pdf` + `react-window`** | `react-pdf` actively maintained (v10.4 as of Mar 2026); `@react-pdf-viewer/core` is effectively abandoned (~3 years stale). `react-window` for page virtualization — pdf.js explicitly recommends not rendering >25 pages simultaneously. |
| Text extraction (server) | **`unpdf`** (wraps pdf.js) | Serverless-friendly, no native binary needed (unlike `node-poppler`). `pdf-parse` is fine but older. Modern CAD-exported PDFs have vector text — no OCR required. |
| OCR fallback (v1.5) | `tesseract.js` or Claude vision | Only for scanned legacy drawings; lazy-trigger when user searches a sheet whose `extracted_text` is empty. |
| DWG handling | **PDF-only required; DWG accepted as opaque attachment** | ODA File Converter requires ~$50k/yr Sustaining membership for SaaS use — non-viable. Most firms already convert DWG→PDF before sharing. Add CloudConvert API as a managed conversion path in v1.5 when users ask. |
| Markup | **Defer entirely v1** | Bluebeam-killer is not the target. Users mark up locally and upload as a new revision. Aligns with D-15 (HITL = dashboard, not embedded UI surfaces). |
| Storage | **Supabase Storage v1** | Tight integration with Supabase Auth + RLS. Plan R2 migration when egress crosses ~$200/mo or first customer hits very large sets. |
| Upload path | **Direct-to-storage signed POST** | Don't proxy multi-hundred-MB uploads through tRPC handlers — function timeouts will kill them. |
| Storage layout | `{org_id}/projects/{project_id}/drawings/{set_id}/{sheet_id}/{revision_id}.pdf` | `org_id` as top prefix makes per-tenant lifecycle/audit/migration trivial. Aligns with D-10. |

Drawing sheets are searchable via Postgres `tsvector` over `drawing_revisions.extracted_text` from M2 onward, with `sheet_number` + `discipline` as filter columns for filter-first queries. **Hybrid retrieval (tsvector + pgvector via RRF) lands at M6** (D-52), scoped to long-form docs only — chunked at ~512 tokens with 10% overlap, embedded with OpenAI `text-embedding-3-small`. Structured records (assets, materials, bills) stay on SQL + tsvector forever; Claude routes via tool selection.

### 10.5 The recall loop

The reason documents matter: they're what makes the recall demo work. The 14-month-later question *"what fridge did we install in the Anderson kitchen?"* returns:
- Asset record (manufacturer, model, SKU)
- Photo (the install shot)
- Spec item (lead time, vendor, install date)
- Original receipt PDF (warranty terms extracted)
- Bill (what we paid) → Vendor → Contact

Six joined records; one Claude query.

---

## 11. Workflow engine — typed steps, scheduled & signal-driven runs

The architectural keystone. Workflows in Beamy are not thin todo templates; they're structured definitions where every step is typed, the firm's tribal knowledge is codified into reusable artifacts, and AI handles the busywork while humans drive value-creation.

(Refines Riffy's Milestone 4 plan with the VitoriaConsulting step-type pattern.)

### 11.1 Step types (eight)

| Type | Behavior | Driver | HITL? |
|---|---|---|---|
| `ai_research` | Claude reads context, returns structured findings (prior projects, competitive landscape, etc.) | LLM | No |
| `ai_draft` | Claude drafts a structured artifact (proposal, RFI text, change order narrative, weekly update) | LLM | No |
| `api_call` | Hit a registered tool (QB, Stripe, DocuSign, an MCP server, image gen) | HTTP | No |
| `human_validate` | Present prior step's output → collect `{decision, edited_output?, comment}` | UI | **Yes** |
| `human_decide` | Present a structured choice → collect a selection (e.g., "approve PO at $X / counter at $Y / decline") | UI | **Yes** |
| `human_input` | Show a form (JSON Schema → UI) → collect structured input | UI | **Yes** |
| `wait_on_signal` | Pause until external signal fires (`permit.issued`, `payment.received`, `inspection.passed`) | Event bus | **No (gated by world)** |
| `schedule_resume` | Pause until a wall-clock time (`+30 days`, `next monday 9am`) | Cron | No |

Anything else (`branch`, `loop`, `parallel`, `compose`) is sugar — defer.

### 11.2 Trigger types (D-29)

Workflow definitions declare a trigger type:

- **`manual`** — user-initiated (from chat, dashboard, or MCP). Most workflows.
- **`scheduled`** — cron-style. Runs without human kickoff. Examples: monthly compliance sweep (#21), year-end 1099 prep (#23), Friday client-update batch.
- **`signal`** — fires when a system event lands. Examples: `permit.issued` triggers the demo-prep workflow; `bill.paid` triggers vendor-rating refresh; `change_order.signed` triggers the budget-update workflow.

Scheduled and signal-driven runs are **first-class**, not bolted on later. (Riffy didn't have these; Beamy needs them — see #21, #23, #20 in §12.)

### 11.3 Definition shape

```jsonc
{
  "id": "kitchen-redesign-bid",
  "name": "Bid kitchen redesign",
  "scope": "company",
  "version": 4,
  "trigger": { "type": "manual" },
  "inputs": {
    "client_id": { "type": "string", "required": true },
    "scope_summary": { "type": "string", "required": true },
    "site_address": { "type": "string", "required": true }
  },
  "steps": [
    {
      "id": "find_comparables",
      "type": "ai_research",
      "prompt_template_id": "find-comparable-projects-v2",
      "vars": {
        "scope": "${inputs.scope_summary}",
        "max_age_months": 18,
        "project_type": "kitchen_renovation"
      },
      "output_schema": {
        "comparables": [
          { "project_id": "string", "scope_match": "number",
            "actual_cost": { "amount": "string", "currency": "string" },
            "variance_to_estimate": "number" }
        ]
      }
    },
    {
      "id": "draft_estimate",
      "type": "ai_draft",
      "depends_on": ["find_comparables"],
      "prompt_template_id": "kitchen-estimate-v3",
      "vars": {
        "scope": "${inputs.scope_summary}",
        "comparables": "${steps.find_comparables.output.comparables}"
      },
      "output_schema": "EstimateDraft"
    },
    {
      "id": "review_estimate",
      "type": "human_validate",
      "depends_on": ["draft_estimate"],
      "context": { "draft": "${steps.draft_estimate.output}" },
      "exit_when": "approved"
    },
    {
      "id": "generate_proposal_pdf",
      "type": "api_call",
      "depends_on": ["review_estimate"],
      "tool": "doc_render",
      "config": {
        "template_id": "proposal-template-v5",
        "data": "${steps.review_estimate.output}"
      }
    },
    {
      "id": "send_proposal",
      "type": "human_validate",
      "depends_on": ["generate_proposal_pdf"],
      "exit_when": "sent"
    }
  ]
}
```

Variable resolution: `${inputs.X}`, `${steps.<id>.output.Y}`, `${project.<field>}`, `${vendor("<id>").<field>}`, `${docs.search("query")}`. Resolved at step-start time.

### 11.4 Execution lifecycle

```
queued → running → (awaiting_human ↔ running) → completed | failed | cancelled
                  ↘ awaiting_signal → running     (for wait_on_signal)
                  ↘ scheduled_pause → running     (for schedule_resume)
```

When a step is HITL-flavored: runner sets status to `awaiting_human`, records `awaiting_user_id` (nullable = "anyone on team"), surfaces in inbox + activity feed, returns from MCP/chat with a "paused, link: …" payload — Claude can show the human the link, or notify via Slack/email integration later.

When a step is `wait_on_signal`: runner subscribes the run to the named signal; the next time that signal fires for the matching project/entity, the runner advances.

When a step is `schedule_resume`: runner persists a wake-up time; cron sweeps and resumes.

**No background worker queue in v1.** Synchronous runner advances through automated steps until it hits a HITL/signal/scheduled gate or completes. Throughput needs grow → add BullMQ + Redis later.

### 11.5 The `change_proposals` table (D-28)

Generalizes Riffy's `brand_change_proposals`. Any agent-driven mutation goes through it: Claude proposes, human approves or rejects in the dashboard, then the change lands. Used by the AI-step types when they touch persisted state (creating a bill, updating a spec, generating a change order).

```
change_proposals  org_id, project_id?, proposed_by, target_resource_type,
                  target_resource_id?, proposed_op, proposed_value (jsonb),
                  rationale, status, decided_by_user_id?, decided_at?
```

This makes agent actions reversible-by-default: "reject" deletes the proposal; "approve" applies it as a normal write (with full audit trail).

### 11.6 What we explicitly don't do in v1

- Visual workflow builder (Monaco JSON editor only)
- Cross-step branching / loops (linear DAGs)
- Versioned migration of in-flight runs (new version = new runs)
- Cross-org workflow sharing (a marketplace of seeded templates is M-later)

---

## 12. Workflow library — the 24

Twenty-four canonical workflows the firm's tribal knowledge maps to. **Not all ship in v1.** v1 ships ~6 (the wedge demos); the rest are spec'd here so the data model + workflow engine accommodate them when they land.

Tagging: `[T]` triggered, `[S]` scheduled, `[Σ]` signal-driven. Build phase noted in brackets at the end (`v1` = ships in initial product, `v1.5` = post-launch, `v2` = much later).

| # | Workflow | Type | Phase |
|---|---|---|---|
| 1 | **Lead → bid → proposal** — leverage past project data; AI drafts proposal PDF | `[T]` | v1 |
| 2 | **Project intake / kickoff** — from accepted bid, hydrate project + todos + kickoff email | `[T]` | v1 |
| 3 | **Spec / finish lock-in** — approval state machine per spec item; PO on approval | `[T] [Σ]` | v1 |
| 4 | **Vendor onboarding** — W9, COI, terms; compliance auto-tracked | `[T]` | v1 |
| 5 | **Material procurement & lead-time tracking** — slip-detection nudges | `[T] [S]` | v1.5 |
| 6 | **Site visit / daily log** — phone capture, voice → structured | `[T]` | v1 |
| 7 | **Change order (lite)** — record + cost impact + **schedule impact** + manual signed-PDF upload. State machine `proposed → signed → rejected`. **No e-sign integration in v1** — that's v1.5 with DocuSign. | `[T]` | **v1 (lite)** / v1.5 (e-sign) |
| 8 | **Subcontractor invoice → payment** — PDF in, QB sync out | `[T]` | v1 |
| 9 | **Client progress billing** — monthly proposal of due invoices | `[S]` | v1.5 |
| 10 | **Weekly client update** — Friday batch, AI drafts from week's site logs / change orders / spec approvals / photos. Pure `ai_research → ai_draft → human_validate`. No external integrations needed. | `[S]` | **v1** |
| 11 | **Punch list / close-out** — defects → assignment → verification | `[T] [Σ]` | v1.5 |
| 12 | **Warranty / post-occupancy lookup** — recall queries, draft inquiry emails | `[T]` | v1 |
| 13 | **Permit application & tracking** — state machine + plan-check responses | `[T] [Σ]` | v1.5 |
| 14 | **Design package handoff** (interior firm) — SD/DD/CD assembly | `[T]` | v1.5 |
| 15 | **RFI cycle** — drafted from voice/photo, response auto-attached to sheet/spec | `[T]` | v1.5 |
| 16 | **Submittal review** — version chain, AI drafts review comments | `[T]` | v1.5 |
| 17 | **Weekly trade scheduling** — multi-trade tetris, conflict surfacing | `[S]` | v2 |
| 18 | **Inspection coordination** — slip-detection vs project schedule | `[Σ] [S]` | v2 |
| 19 | **Project closeout package** — assembled at substantial completion | `[Σ]` | v1.5 |
| 20 | **Retention release** — auto-drafted at +30 days post-completion | `[S]` | v1.5 |
| 21 | **Compliance sweep** — monthly auto-run; COI/W9 expirations | `[S]` | v1 |
| 22 | **Project P&L recap** — actual job costing at closeout | `[Σ]` | v1.5 |
| 23 | **Year-end 1099 prep** — January auto-run | `[S]` | v1.5 |
| 24 | **Project portfolio capture** — case study + photographer scheduling | `[Σ]` | v2 |

**v1 cut (10 workflows):** 1, 2, 3, 4, 6, 7-lite, 8, 10, 12, 21. These are the wedge:
- **Sales / onboarding moments:** #1 (bid), #2 (kickoff), #4 (vendor onboarding)
- **Daily use:** #6 (site log), #3 (spec lock-in), #7-lite (change order capture)
- **Money:** #8 (sub invoice → payment)
- **AI doing real work:** #10 (Friday client updates), drafting + validate pattern
- **Hero recall demo:** #12 (warranty / post-occupancy lookup)
- **Scheduled automation proof:** #21 (compliance sweep)

Everything else is a deepening of these primitives, layered on as customers ask.

**Cold-start caveat:** #1 and #12 both depend on accumulated past-project data. Day 1, both demos are weak (no comparable kitchens to estimate from; no installed assets to recall). The workflows themselves still ship in v1 so the data loop kicks in early — but expect both to feel underwhelming until ~3 months of real use have passed.

**Key design loop:** workflows back-feed each other. P&L recap (#22) feeds estimating (#1). Closeout package (#19) feeds portfolio (#24). Spec lock-in (#3) feeds warranty lookup (#12). The data loop is the moat.

---

## 13. Onboarding — the live-project path

Three distinct flows. Don't conflate.

### 13.1 Founder onboarding (the principal)

**Goal:** workspace live in <5 minutes. No upfront wizard — *the live project IS the onboarding* (D-22).

1. Land on beamy.com → click "Start your workspace" → sign up (Supabase Auth).
2. Pre-create empty org. Connector URL is live immediately.
3. **Single screen: "What project are you in the middle of?"** Three fields: project name, client name, address. That's it. No phase, no scope, no budget required.
4. Workspace lands on the Project Overview page for the new project.
5. **Single-player default UX (D-23):** no "invite your team" CTA staring at them. No "assigned to" dropdowns. They're the only user.

That's it. From here the principal adds vendors (when first invoiced), assets (when first installed), bills (when first received) — incrementally. Onboarding never ends (D-37).

### 13.2 The "set up with Claude" path (D-13 carries)

Alternative to the dashboard: connect Beamy's MCP server to Claude.ai, paste a starter prompt:

> *"Help me set up Beamy. I'm running a [GC / interior firm], we're [N] people, and I'm in the middle of a [kitchen reno / commercial fitout / ...]."*

Claude reads the MCP `instructions` field, sees the empty workspace, walks the principal through hydrating the live project — vendors involved so far, todos outstanding, recent installs. Each answer is an MCP tool call writing to the org.

### 13.3 Teammate onboarding

When the principal eventually invites someone (month 3, not day 1):

1. Click invite link → magic-link sign-in → `org_memberships` row created with `role = member`.
2. Brief tour (skippable).
3. Connect Claude (same connector, scoped to the same org).
4. Done. (No per-project ACLs in v1 — everyone sees everything within the org. D-3.)

### 13.4 Per-project intake

For each new project after the first, the principal can run a project-intake workflow (#2 in §12) which structures the kickoff in 6 minutes — vendor shortlist from past projects, kickoff email drafted, deposit invoice issued, todos populated. **This is where Beamy's value compounds** — the second, fifth, twentieth project takes seconds because the firm's pattern is structured.

---

## 14. Integrations roadmap

Per-org OAuth state lives in `integration_connections` (§5). Webhook events land in `integration_webhook_events` (§5) keyed by `(provider, external_event_id)` for dedup.

### 14.1 QuickBooks Online (v1, read-only)

- **OAuth:** Intuit OAuth 2.0; scope `com.intuit.quickbooks.accounting`. Callback returns `code` + `realmId` (the QB company ID — bound to its tokens, embedded in every API URL). Access tokens expire in **60 min**; refresh tokens now rotate every ~24h with a 5-year hard ceiling (Intuit policy update Nov 2025) — store the explicit expiry returned in the refresh response.
- **Sync model:** **CDC endpoint** is the primary path: `GET /v3/company/{realmId}/cdc?entities=Invoice,Payment,Bill,Customer,Vendor&changedSince=<ISO8601>`. Max 30 days lookback per call, max 1000 objects per response. Persist high-water-mark per `(realm, entity)`, advance after success.
- **Webhooks:** entity-references only (not full payloads — must re-fetch). Verify `intuit-signature` header (HMAC-SHA256 over raw body, base64-decoded, constant-time compare). Best-effort, not guaranteed → CDC is fallback every 1–6h. (D-49: CDC primary, webhooks accelerate.)
- **Concurrency:** every entity carries a `SyncToken` (optimistic-lock version). Updates **must** include current `SyncToken` + `sparse: true`. Stale-token error is `5010` — refetch and retry.
- **Rate limits:** 500 req/min/realm, 10 concurrent, 40 req/min on `/batch`. 429 with `Retry-After`.
- **DB shape:** every QB-mirrored row carries `qb_realm_id`, `qb_id`, `qb_sync_token`, `qb_last_synced_at`. Composite unique `(org_id, qb_realm_id, qb_id)` since QB ids are realm-scoped.

### 14.2 Stripe (v1.5+, optional payment rail)

Beamy is rail-agnostic for AR closure (D-50). v1 ships manual payment recording + QB-sync as the rails. Stripe Connect Standard + Invoicing API ships v1.5 as one optional rail among several, when a customer's client base actually wants to pay digitally.

When it does ship, the design pattern below applies.

- **Connect model (D-44):** **Stripe Connect Standard** per org. Each firm has its own real Stripe account; we issue invoices on their behalf via the `Stripe-Account` header. Standard has zero per-account fees (Express is $2/mo + payout fees) and Stripe handles all KYC. Skip Custom (KYC liability) and Express (we don't need branded onboarding shell).
- **Product choice:** **Stripe Invoicing API** (not Payment Links / Checkout Sessions). Hosted invoice URL, ACH + card, dunning, automatic email reminders — all the B2B AR primitives we'd otherwise rebuild.
- **Webhooks:** subscribe at the Connect (platform) level — one endpoint receives events for all connected accounts; the `account` field on the event tells us which org. Verify `Stripe-Signature` via SDK's `constructEvent` (HMAC-SHA256, 5-min timestamp tolerance).
- **v1 events:** `invoice.paid`, `invoice.payment_failed`, `invoice.finalized`, `invoice.voided`, `charge.dispute.created`. Skip `customer.subscription.*`. Dedup on `event.id` with unique constraint; return 2xx fast (<5s); do work async.
- **DB shape:** `stripe_account_id` on `integration_connections`. On `invoices`: `stripe_invoice_id`, `stripe_customer_id`, `stripe_hosted_invoice_url`, `stripe_payment_intent_id`. On `client_payments`: `stripe_charge_id`, `stripe_balance_transaction_id`.

### 14.3 Plaid (v1.5+, stub in v1)

- **Use case:** read-only bank transactions to match deposits against outstanding invoices and debits against paid bills. Products: **Transactions** (and `Auth` only if we ever do account-number display). No money movement.
- **Flow:** Link → exchange `public_token` for **permanent `access_token` + `item_id`** via `/item/public_token/exchange`. Re-link via Update Mode (same `access_token` survives).
- **Sync:** **`/transactions/sync`** with cursor (legacy `/transactions/get` is dead). First call omits cursor; subsequent calls pass `next_cursor`. Webhook `SYNC_UPDATES_AVAILABLE` triggers a sync.
- **Lifecycle gotchas:** `ITEM_LOGIN_REQUIRED` → surface "reconnect" CTA opening Update Mode. `PENDING_EXPIRATION` → trigger Update Mode preemptively. Pending vs posted transactions arrive as `removed` (pending) + `added` (posted) on `/sync`.
- **Historical depth:** `transactions.days_requested` defaults to 90, max 730. Set at link time — can't extend later without a new Link flow.
- **v1 strategy:** stub the adapter; implement CSV import as the fallback path so users with bank-statement PDFs aren't blocked. Real Plaid lights up when first customer asks.

### 14.4 Other integrations

| Integration | v1 scope | Notes |
|---|---|---|
| DocuSign / Dropbox Sign | Defer (v1.5) | Workflow #7 (CO e-sign) ships with manual PDF + scanned signature in v1. |
| Email (inbound) | Defer (v1.5) | Manual PDF upload in v1. Auto-pull from inbox lights up workflow #8. |
| Image generation (Replicate/fal) | Defer (v2) | Marketing/portfolio output (workflow #24). |
| Vendor portals | Defer | Most subs don't have APIs. |
| AHJ / permit portals | Defer | Workflow #13 lives in manual mode forever — every jurisdiction is bespoke. |

---

## 15. Tech stack (carries from Riffy)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vite + React 19 + TS + Tailwind + shadcn/ui | Inherited from Riffy/Cadenza |
| Routing | React Router v7 | Same |
| API (web + chat) | tRPC | Same; `orgScopedProcedure` middleware non-negotiable |
| ORM / DB | Drizzle + Postgres on Supabase | Same |
| Auth | Supabase Auth (email + Google) | Same; OAuth provider config for MCP |
| Storage | Supabase Storage (R2 migration plan) | Photos, PDFs, drawings v1; swap to Cloudflare R2 when egress > ~$200/mo |
| PDF viewer | `react-pdf` + `react-window` | Active maintenance; virtualized for 200+ page drawing sets |
| PDF text extraction | `unpdf` (server-side) | Serverless-friendly; vector-text directly without OCR |
| Search (structured) | Postgres `tsvector` (GIN indexes) | Forever — exact-match wins for SKU/serial/lot/sheet_number queries |
| RAG (long-form docs) | pgvector + tsvector via RRF; HNSW; iterative scans (pgvector ≥ 0.8.0) | M6+; scoped to drawings/contracts/emails only — never structured records (D-52) |
| Embedding model | OpenAI `text-embedding-3-small` (1536 dim) | Cheap, ubiquitous; swap to Cohere `embed-v4` if Spanish recall lags |
| LLM | Anthropic SDK directly, Claude default | Prompt caching for project context |
| Voice transcription | Whisper API (OpenAI) v1 | Predictable cost; revisit Claude-with-audio when GA |
| Secrets | KMS-managed KEKs wrapping per-row DEKs (envelope encryption) | OAuth tokens for QB/Stripe/Plaid; D-45 |
| MCP server | Node + `@modelcontextprotocol/sdk` | Sibling service; HTTP/SSE transport |
| Hosting | Vercel (web) + Supabase + Fly.io/Railway (MCP) | Cheap, fast |
| Payments (v1) | Manual recording with rail enum | Universal AR/AP closure; rail-agnostic (D-50) |
| Payments (v1.5+) | Stripe Connect Standard + Invoicing API | Optional rail when customer asks; D-44 |
| Accounting | QuickBooks Online (Intuit OAuth) | Read-only sync v1; CDC + webhooks |
| Banking (deferred) | Plaid `/transactions/sync` cursor pattern | v1.5; CSV import fallback in v1 |

### Repo shape

```
apps/
  web/           Vite + React dashboard (+ in-app chat surface)
  mcp/           MCP server (Node, @modelcontextprotocol/sdk)
packages/
  db/            Drizzle schema + migrations
  shared/        Zod schemas, domain types
  trpc/          tRPC routers (consumed by web + mcp)
  workflow/      Workflow runner + step type implementations
  finance/       Money primitives + adapter contracts (extract → @common/finance later — D-35)
  drawings/      Sheet indexing + revision tracking (later)
docs/            design.md, workflows.md (the library), integrations.md
```

---

## 16. Roadmap (milestones)

Inherits M0 from Riffy. Roughly 6–9 months of focused build to a real v1.

### M0 — Scaffold + tenancy ✓ (inherited from Riffy)

- Monorepo, pnpm workspaces, `@beamy/*` packages
- `orgs` + `org_memberships` schema; `orgScopedProcedure` middleware
- Auth + sign-up flow
- Empty tRPC scaffolding

### M1 — Core entities + auth + i18n scaffold (2 weeks)

- Sidenav + layout + Home (placeholder)
- Clients, vendors, services CRUD with the audit-log + transaction pattern
- Members page (team list, invite link)
- `vendor_compliance` schema (W9 + COI tracking)
- **i18n scaffold (D-51):** translation key infra (next-intl or react-i18next), per-org `locale` column, Intl API for dates/numbers/currency. Strings begin as English-only; Spanish lands progressively as MX customer onboards.
- **Done = the firm can put their basic data in. Locale-aware formatting works for US + MX.**

### M2 — Recall demo (2.5 weeks)

- Projects CRUD, project workspace shell, `rooms` CRUD per project
- `assets` schema + UI (manufacturer, model, serial, warranty, install, vendor link, parent-child hierarchy)
- `materials` schema + UI (manufacturer, color, lot number, coverage, attic stock) + `material_applications` (room + surface)
- `asset_service_events` (mostly empty surface in v1; the table exists for future fill-in)
- Photo upload (mobile-friendly), tag-by-asset / material / room
- `documents` + `photos` infra (Supabase Storage with `{org_id}/projects/...` layout)
- **tsvector** indexes on:
  - `assets` searchable fields (name, manufacturer, model, notes)
  - `materials` searchable fields (name, manufacturer, color_name, notes)
  - `drawing_revisions.extracted_text` (with `sheet_number` + `discipline` as filter columns)
- Filter UI for room + category + state (the dominant query shape — *"what fridge in the Anderson kitchen"* is a SQL query, not search)
- **No pgvector yet (D-52).** Resist. Exact-match on SKU / serial / lot is what wins the recall demo.
- **Done = the recall demo works for both kinds.** *"What fridge in the Anderson kitchen?"* returns the asset row + warranty + install photo. *"What tile + grout in the Anderson primary bath?"* returns the material row + lot number + applications + attic stock + sample photo.

### M3 — Money core (rail-agnostic) (2 weeks)

- `bills`, `invoices`, `vendor_payments`, `client_payments`, `*_payment_allocations` schemas
- Manual bill/invoice entry + PDF upload + AI extraction (bill side only)
- **Manual payment recording with `rail` enum** — check / wire / ACH-direct / card / cash / other. Closes AR/AP without any external integration.
- AR aging + AP aging reports (per project, per vendor, per client)
- `integration_connections` + `integration_webhook_events` infra (scaffold ready for QB in M4)
- **Done = AR/AP loops close end-to-end via manual rail. The principal can record any check, wire, or ACH that arrives.**

### M4 — QuickBooks integration + reconciliation (US + MX) (4 weeks)

- Intuit OAuth flow + token storage (KMS envelope encryption — D-45)
- **Both QB regions:** US (`quickbooks.api.intuit.com`) and Mexico (different endpoint host + slightly different entity shapes). Same adapter contract; per-`integration_connections.region` discriminator.
- **Read-only auto sync** via CDC endpoint: bills, invoices, payments, vendors, customers (background poll + webhooks-as-accelerator)
- **Manual push-to-QB** action on bills + invoices (principal approves Beamy record → button creates QB record + captures `qb_id`). Keeps principal in control of every write.
- **Reconciliation page** — three tabs (unmatched in Beamy, unmatched in QB, discrepancies). Per-row actions: link pair, force resync, mark ignored. Drives `sync_status` state machine.
- External-id-based dedup; conflict resolution = QB wins on auto-pull, principal wins on manual push.
- **Done = a QB-using firm in either region sees their AP/AR overlaid with project context, can push Beamy-originated records to QB on approval, and has a clear surface for resolving drift.**

### M5 — Workflow engine + seed templates (4 weeks)

- `workflow_definitions` + `workflow_runs` + `workflow_run_steps` + `workflow_run_events` schemas
- Synchronous runner; eight step types live (research, draft, api_call, validate, decide, input, signal, schedule)
- Trigger types: manual + scheduled + signal
- Monaco JSON editor for definitions
- HITL inbox on Home page
- Execution detail page with step timeline
- **Seeded templates v1 (10 workflows):** #1 (bid), #2 (kickoff), #3 (spec lock-in), #4 (vendor onboarding), #6 (site log), #7-lite (change order), #8 (sub invoice), #10 (weekly client update), #12 (warranty lookup), #21 (compliance sweep)
- **Done = all 10 v1 workflows run end-to-end with HITL gates, kickable from dashboard or Claude.**

Internal ship order within M5 (lowest to highest dependency on accumulated data):
1. Engine + 5 daily-use templates (#2, #3, #4, #6, #8) — week 1–2.5
2. Hero + AI-only templates (#10, #12, #7-lite) — week 2.5–3.5
3. Scheduled + cold-start templates (#1, #21) — week 3.5–4

### M5.5 — `packages/finance` extraction discipline (3 days)

- Tighten `packages/finance/` exports
- Document the API surface for future `@common/finance` consumers
- Add unit tests around the adapter contract
- **Not** publishing yet — just paying down extraction debt while it's small.

### M6 — MCP read + in-app chat + hybrid RAG (3 weeks)

- MCP server scaffold; OAuth via Supabase as identity provider
- **pgvector + hybrid RAG infrastructure (D-52):**
  - `document_chunks` table (project_id, document_id, chunk_no, content, embedding vector(1536), sheet_number?, discipline?, page?)
  - Single global HNSW index, iterative scans on (pgvector ≥ 0.8.0)
  - Embedding pipeline: chunk at ~512 tokens with 10% overlap, embed with OpenAI `text-embedding-3-small`, upsert. Triggered on document upload/revision via Postgres `LISTEN/NOTIFY` worker.
  - Hybrid retrieval procedure: parallel tsvector + pgvector queries → RRF merge → `org_id` filter on both legs.
- **Structured read tools (SQL-backed):** `list_projects`, `get_project_context`, `get_assets`, `get_asset`, `get_materials`, `get_material`, `list_bills`, `list_invoices`, `list_vendors`, `get_workflow_run_status`, `list_pending_human_steps`
- **RAG tool:** `search_documents(project_id?, query, top_k?)` — wraps hybrid retrieval; for prose-heavy queries
- **Document follow-up:** `get_document(id, page_range?)`
- Resources: `project://`, `asset://`, `material://`, `drawing://`, `workflow://`
- In-app chat surface (same backend, embedded UI)
- Aggressive Anthropic prompt caching on Claude calls (project context, common system prompts)
- **Done = principal in Claude.ai or in-app chat can ask any question about any project and get the right answer — Claude routes between SQL tools (structured queries) and RAG (prose).**

### M7 — MCP write tools + change_proposals (1.5 weeks)

- Write tools (proposal-routed): `propose_create_asset`, `propose_create_bill`, `propose_change_order`, `propose_todo`
- `change_proposals` review queue UI
- Direct-write tools (low-stakes): `add_todo`, `update_todo_status`, `log_site_visit`, `start_workflow_run`, `submit_step_input`
- **Done = Claude can propose meaningful state changes; humans approve.**

### M8 — PDF + CAD + drawing sets (2.5 weeks)

- Drawing schema (`drawings` + `drawing_revisions` + `drawing_sets`)
- Sheet upload with revision tracking; issue-state machine
- pdf.js viewer with sheet navigation
- Server-side PDF text extraction (vector text)
- Search across drawing set
- **Done = drawings live in Beamy with real version awareness; *"what does sheet A4.2 say about kitchen tile?"* works.**

### M9 — Scheduled workflows (1 week)

- Cron sweeper for `workflow_definitions` with `trigger.type = 'scheduled'`
- Workflow #21 (compliance sweep) live + seeded for every org
- Wake-up resume for `schedule_resume` steps
- **Done = compliance sweep runs every 1st of the month auto, no human kickoff needed.**

---

**Total: ~23–27 weeks of focused work to v1** (with US + MX parallel — D-51, hybrid RAG — D-52). Ship M2 to *both* friendly first users (the MX firm and the US firm) and start learning before grinding through M3+. M3+M4 in particular benefit hugely from real customer data shaping the integration UX. M5 is the longest single milestone — 4 weeks for the engine plus 10 seeded workflow templates. M6 expanded to 3 weeks to absorb hybrid RAG infrastructure.

### Post-v1 (light up as customers ask)

- **Stripe Connect Standard + Invoicing API** — optional digital payment rail (~2 weeks). Customers whose clients want to pay by ACH/card without a check.
- **Plaid `/transactions/sync`** — read-only bank reconciliation rail (~1.5 weeks). Match deposits against outstanding invoices, debits against paid bills.
- **DocuSign / Dropbox Sign** — change-order e-sign automation (workflow #7, ~1 week).
- **Inbound email integration** — auto-pull vendor invoice PDFs from a forwarding inbox (workflow #8 enrichment, ~1 week).

---

## 17. Out of scope for v1

Tempting but explicitly excluded. Document so they can't sneak in.

- **Cross-org users** (one user belonging to multiple agencies) — strict 1 user → 1 org (D-12)
- **Visual workflow builder** — Monaco JSON only
- **Background job queue** — synchronous runner; add BullMQ/Redis later
- **Per-project ACLs** — everyone in the org sees everything (D-3)
- **Inventory / lots / fulfillment** — not what these firms do
- **Tax engine** (D-34)
- **FX conversion** (D-33)
- **DWG inline render** — store + download v1, convert + render v1.5
- **Drawing markup tools** — view-only v1
- **Client portal** — clients receive PDF + e-mail v1
- **Mobile native app** — mobile web v1
- **Inbound email integration** — manual PDF upload v1
- **DocuSign / e-sign** — manual signature scan v1

---

## 18. Decisions log

Inherits Riffy's chassis decisions verbatim where they carry. New Beamy decisions start at D-19.

| ID | Decision | Rationale |
|---|---|---|
| D-1 | Single new repo, no carve-out from Cadenza | Different product, different stack opinions; copy patterns, don't share code (yet — see D-35) |
| D-3 | Small team allowed (multiple users), but no ACLs in v1 | Get the team working without paying the permission-design tax up front |
| D-4 | MCP via Claude Connectors (OAuth-over-HTTP), not stdio | Per-user identity is the whole point |
| D-5 | Workflow definitions as JSON in v1 | Visual builder is too big to ship first |
| D-6 | Synchronous workflow runner in v1 | No queue; HTTP request drives execution |
| D-8 | Agent never writes critical state directly — proposes via review queue | Generalized to `change_proposals` (see D-28) |
| D-10 | Multi-tenant SaaS from day one; `org_id` on every business table | Day-one is ~1 week; retrofit is multi-week with downtime risk |
| D-11 | Sign-up creates a new agency by default; "got an invite?" link is the secondary path | Most signups are net-new agencies |
| D-12 | v1: one user belongs to one org | Auth complexity isn't worth the 1% case in v1 |
| D-13 | Two setup paths at sign-in: "Set up with Claude" (conversational via MCP) or "Set up in dashboard" (form-based) | Both write to the same backend |
| D-15 | HITL UIs are dashboard pages deep-linked from Claude/chat | Only standardized path today |
| D-17 | All money amounts stored as `(amount, currency_code)`; default currency per-org but amounts can carry their own | Cross-border vendors/clients realistic in construction (US firm hires Mexican fabricator) |
| D-18 | Single `prompt_templates` and `workflow_definitions` tables, scope-discriminated | Two parallel tables duplicate structure with no benefit |
| **D-19** | Beamy is the construction/design fork of Riffy; chassis carries | Multi-tenancy, tRPC tiers, audit, money primitives, workflow engine inherited verbatim. Domain model + integrations are Beamy-specific. |
| **D-20** | Combined construction + interior design (single product, not two) | Both observed agencies share the same data model — projects, vendors, assets, finishes, money, drawings. Splitting would duplicate everything. |
| **D-21** | Three consumers (web + in-app chat + MCP) all v1, MCP not deferred | Riffy gated MCP to M3; for Beamy, the principal-as-Claude-user is the buyer's natural surface. We carry the architecture from day 1; MCP server itself ships at M6 but the data model + auth flow are MCP-aware throughout. |
| **D-22** | Structuring is the product. **Forms-first input with partial-completion tolerance.** No 50-question gating wizards. **Ease-of-input is a permanent design constraint** applied to every surface (voice-to-form, photo extraction, smart defaults, saved templates). | These firms can't get AI value without structured data — and they need to do real work to put their data into structure. Half-filled records are first-class. AI is the quality-of-life layer on top of forms (via `change_proposals`), not a replacement for them. |
| **D-23** | Multi-user infrastructure, single-player UX default | Schema enforces multi-user from day 1; UX defaults to single-player (no "assign to" dropdowns, no "share with team" CTAs) until the principal invites someone. |
| **D-24** | Live API integrations for money (QB, Stripe, Plaid) — Beamy is never the accounting ledger of record | Reconciliation lives in user's accounting tool; Beamy overlays project + vendor + workflow context. |
| **D-25** | `external_source` + `external_id` on every integration-sourced record | Single dedup convention across QB/Stripe/Plaid/future. Unique index on `(external_source, external_id)`. |
| **D-26** | Predicted-vs-actual via `is_superseded` flip | Beamy can write predictions (Claude-extracted bills, projected payments); when the actual lands from the integration, the prediction flips to superseded. |
| **D-27** | Adapter contract returns `Result<T, ProviderError>` with `error_class` enum | Same shape on every integration; `class: 'rate_limit' \| 'auth_failed' \| 'schema_mismatch' \| 'transient' \| 'other'` drives retry routing. |
| **D-28** | `change_proposals` table generalizes Riffy's `brand_change_proposals` (D-8 broadens) | Same agent-proposes-human-approves pattern, but for any resource type (asset, bill, change order, todo, etc.). |
| **D-29** | Workflow steps are typed (8 types); scheduled and signal-driven runs are first-class | Scheduled workflows (compliance sweep, retention chase, 1099 prep) are pure-AI executors that need no human kickoff. Signal-driven runs (permit-issued → demo-prep) bind workflow execution to system events. |
| **D-30** | Photos + PDFs + CAD plans first-class v1; DWG store-only v1, inline render v1.5 | Recall demo requires photos. Drawing search requires PDF text. DWG is rare enough to defer. |
| **D-31** | Drawings are versioned (revision chain) + sheet-indexed; multi-sheet sets first-class | Construction drawings always re-issue; misreading a stale rev is a real defect risk. The data model has to know. |
| **D-32** | Bill PDF auto-extraction in v1; broader PDF extraction v1.5 | The AP path is the highest-leverage extraction case (Claude reads invoice PDF → drafts bill record → human approves). Other extraction (contracts, warranties) deferred. |
| **D-33** | Single home currency per org v1; FX conversion deferred | `currency` column exists everywhere; conversion logic added when a customer hits real cross-border. |
| **D-34** | Tax engine deferred entirely | Small construction firms in single jurisdiction don't need it. Cadenza's `tax_lines` pattern documented for the day this changes. |
| **D-35** | `packages/finance` lives inside Beamy first; extract to `@common/finance` after Beamy stabilizes (~M5+) | Beamy is the PoC that drives requirements. Three real consumers (Beamy, Cadenza, Riffy) shape the API better than hypothetical generality. |
| **D-36** | Name: **Beamy** | Supersedes Riffy's D-9. Single-syllable root, music + construction double meaning. |
| **D-37** | Onboarding never ends — every new project/vendor/SOP is more structuring | Corollary of D-22. UX accommodates this — there's no "you've finished setup" moment. |
| **D-38** | Sheet numbers stored as raw text + parsed `(discipline_code, sheet_type_code, sheet_sequence)` columns; no NCS enforcement | Residential firms use `A-1.0`, commercial firms use NCS `A-101`, some firms use `Sheet 3`. Validating against NCS would block real users. Same applies to CSI MasterFormat: store as text, optional. |
| **D-39** | Change order 2-state default (`proposed` / `signed`); intermediate PCO/COR/CCD states available as optional upgrade via `stage` column | The full AIA G701 three-stage chain is enterprise theater for a 5-person GC. The discipline that matters is **time impact** capture — small firms routinely accept money + forget to extend the schedule. |
| **D-40** | Schedule of Values is the primary persisted entity; G702/G703 PDFs rendered on demand | Most residential pay apps are milestone-based ("deposit / rough-in / drywall / final"). G702/G703 is a bank artifact, not a workflow. Generate on demand when a draw requires it. |
| **D-41** | Project phase is a soft tag (per-org configurable list with sensible defaults), not a state machine | Small firms don't run CMAA-style phase-gate reviews. Phase is a label for filtering daily reports/photos/pay app draws — not a gate. |
| **D-42** | **Assets and materials are two first-class, separate entities** — assets carry per-instance identity (serial, warranty, sub-components via `parent_asset_id`); materials carry per-batch identity (lot/dye-lot, quantity, coverage via `material_applications`). Each table carries its own procurement lifecycle. No third `spec_items` table. | The industry models these separately almost universally — Procore (Equipment vs Specifications), interior design tools (FF&E Schedule vs Finish Schedule), CMMS (asset-only with hierarchy), CSI (Div 11/12 vs Div 09), IFC (`IfcFurnishingElement / IfcDistributionElement` vs `IfcCovering`). The only tools that conflate them (Buildertrend Selections, Houzz Pro Selections Tracker) only do so during procurement and don't carry unified records into warranty/recall — exactly Beamy's value prop. |
| **D-43** | Substantial Completion is an explicit, dated, signed event on the project | Retainage release, warranty start, punch creation, owner occupancy — all hinge on it. Make it an explicit transition with a signed document, not an inferred state from `completed_at`. |
| **D-44** | Stripe Connect Standard for per-org payment integration (not Express or Custom) | Construction firms already have or can create real Stripe accounts; they want their own dashboard for disputes/payouts. Standard has zero per-account fees and Stripe handles KYC. Express + Custom add cost or KYC liability for no marketplace upside. |
| **D-45** | OAuth credentials encrypted via envelope encryption (per-row DEK wrapped by KMS-managed KEK), never solely Postgres `pgcrypto` | `pgcrypto` puts the key on the DB host. RFC 9700 / Google OAuth guidance both call for keystore isolation. KMS is the right primitive even at v1 scale — small fixed cost, eliminates a class of breach. |
| **D-46** | Asset sub-component hierarchy via `parent_asset_id` self-FK from day 1 | A fridge has a compressor, water filter, ice maker — each potentially with its own warranty + service history. Standard in CMMS (UpKeep, Fiix), supported in IFC via aggregation. Adding the column on day 1 is trivial; retrofitting later is a migration. |
| **D-47** | Material `lot_number` is a first-class field — captured at receipt + carried into recall queries | Tile and paint vary batch-to-batch. Without lot tracking, color matching on a repair is impossible. As important as `serial_number` is for assets. |
| **D-48** | Attic-stock tracking on materials (`attic_stock_quantity`, `attic_stock_unit`, `attic_stock_location`) | Leftover paint cans + leftover tile boxes are real artifacts of every project. The "what's left for touch-ups, and where is it?" recall is its own use case — different from "what was installed where." |
| **D-49** | Reconciliation between Beamy and external systems (QB v1; Plaid later) is **first-class**. We expect drift; we provide tooling to surface and resolve it. Read-only auto sync + manual push-on-approval + a dedicated reconciliation page (unmatched / drift / ignored). No silent automatic two-way sync. | Full automatic two-way sync is dangerous in practice — silent duplicates, orphaned drafts, hard-to-debug overwrites. Read-only-plus-manual-push keeps the principal in control of every cross-system write while eliminating dual-entry pain. The reconciliation page is the safety net when systems drift, plus the foundation for a future scheduled "monthly reconciliation" workflow. |
| **D-50** | AR/AP closure is **rail-agnostic.** Beamy invoice/bill is the canonical entity; the `payment.rail` enum (`manual_check / manual_wire / manual_ach / manual_card / manual_other / qb_sync / stripe / plaid_match`) records how it landed. v1 ships **manual + qb_sync rails only**; Stripe + Plaid are optional rails that light up post-v1. | Construction-firm clients pay by check, wire, or ACH-direct as often as digitally — building Stripe-as-central-AR would have been overbuilt for the GC use case and would gate launch on integration work most clients won't use. Rail-agnostic core means we never have to revisit the AR closure path when adding more rails. |
| **D-51** | **Ship US + MX in parallel from v1.** Locale-aware UI (dates, numbers, currency via Intl API), per-org `default_currency` + `locale` columns, multi-currency at the schema level (D-17 already supports). QB Online integration covers both US + MX endpoints. **Full Spanish UI translations land in v1.5** when MX firm fully onboards — translation infrastructure ships in v1, strings land progressively. | Two real first customers, one MX + one US. Forcing "US first, MX in v2" would mean rebuilding QB integration and retrofitting i18n later (multi-week with downtime risk — same tradeoff as tenancy in D-10). Day-one cost: +3 days in M1 (i18n scaffold) + 1 week in M4 (QB MX). Tax/CFDI stays deferred (D-34) — accounting tool handles fiscal artifacts. |
| **D-52** | **Hybrid RAG, scoped to long-form documents only.** SQL + tsvector cover all structured records (assets, materials, bills, vendors, etc.) — forever. pgvector embeddings only on `drawing_revisions.extracted_text`, contract PDFs, email bodies. Hybrid retrieval = parallel tsvector + pgvector via Reciprocal Rank Fusion. Single global HNSW index with `WHERE org_id = ?` post-filter + iterative scans (pgvector ≥ 0.8.0). v1 embedding model: OpenAI `text-embedding-3-small` (1536 dim). Claude routes via tool selection: `get_assets / get_materials / get_bills` (SQL) vs `search_documents` (hybrid RAG). | Embedding structured records adds noise without recall lift (the SKU/serial queries that matter are exact-match, where tsvector wins). Embedding only long-form docs keeps the index small, the cost negligible, and the recall sharp. RRF merges keyword + vector ranks predictably. HNSW handles incremental inserts gracefully and gives the best speed/recall tradeoff at our scale (1–10M chunks expected through ~1k tenants). pgvector wins on operational simplicity vs Pinecone/Weaviate at v1 scale. |

---

## 19. Open questions

| ID | Question | Default if no input |
|---|---|---|
| OQ-B1 | Voice memo transcription — Whisper API or Claude-with-audio? | Whisper API for v1 (predictable cost); revisit when Claude audio is GA |
| OQ-B2 | QB account tier — minimum supported? | QBO Plus (most common at this firm size); Essentials may need feature gating |
| OQ-B3 | Storage cost — when do we move from Supabase Storage to S3+CDN? | When per-org storage exceeds ~5GB or first customer complains about photo load times |
| OQ-B4 | First-launch geography — US only, or US + MX? | **Resolved: both, simultaneously** (D-51). Locale-aware UI in v1; full Spanish translations in v1.5. |
| OQ-B5 | Pricing model? | **Resolved: per-user/month**; gate features sparingly; revisit when churn data exists. |
| OQ-B6 | Project agent — one configurable persona per project or fixed default? | Configurable (name, traits, allowed tools); ship a sensible default |
| OQ-B7 | RAG strategy v1 — keyword (tsvector) or hybrid with pgvector? | **Resolved (D-52):** tsvector at M2 (structured records + drawing text); hybrid (tsvector + pgvector via RRF) at M6, **scoped to long-form documents only**. Structured records stay on SQL + tsvector forever — Claude routes via tool selection. |
| OQ-B8 | MCP write-tools confirmation pattern? | Two-call (preview → commit) for any state-changing tool; single-call OK for `add_todo` and similar low-stakes |
| OQ-B9 | Scheduled workflow runner — cron in-process or external scheduler? | In-process cron (simple); external (Inngest/Trigger.dev) when scale demands |
| OQ-B10 | Drawing markup — defer entirely v1 or minimal viewer-side annotations? | Defer entirely v1; Bluebeam-killer is not the target |
| OQ-B11 | Vendor portals — any worth integrating early? | None for v1; every sub is a different shop. Maybe Procore-for-vendors-of-bigGCs in v2 if a customer asks. |
| OQ-B12 | First customer activation — which of the two observed firms? | **Resolved: both, in parallel** — one MX, one US (drives D-51). |

---

## 20. Review status

This draft was reviewed in 7 rounds with the founding designer. All review questions are resolved:

1. **Naming** — Beamy locked (D-36).
2. **Wedge framing** — refined to "Beamy is the firm's brain" + forms-first with permanent input-ergonomics pressure (D-22 expanded).
3. **Data model — recall layer** — assets vs materials split into two first-class entities with sub-component hierarchy + lot tracking + attic stock (D-42, D-46, D-47, D-48).
4. **Money posture** — never the ledger of record; QB-first with reconciliation as first-class; rail-agnostic AR/AP closure (D-49, D-50).
5. **Workflow library v1 cut** — 10 workflows: 1, 2, 3, 4, 6, 7-lite, 8, 10, 12, 21.
6. **Roadmap sequencing** — 11 milestones (M0–M9 + M5.5), ~23–27 weeks total. Sequence held; no swaps.
7. **Open questions** — B4 + B12 resolved (US + MX in parallel — D-51); B5 confirmed (per-user/month); B7 resolved via independent research (hybrid RAG scoped to long-form docs only — D-52); B1, B2, B3, B6, B8, B9, B10, B11 ride defaults.

**Next: M1 starts with core entity CRUD (clients, vendors, services, vendor compliance) + i18n scaffold on top of the inherited M0 chassis.**
