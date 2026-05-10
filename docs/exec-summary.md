# Beamy — Executive Summary

> One-page brief. Full design in [`design.md`](design.md).

## What it is

Beamy is the operating system for a 5–15 person construction or design firm — a **dashboard + in-app chat + MCP server triple** that turns the firm's tribal knowledge (projects, vendors, clients, drawings, specs, assets, finishes, money) into structured, AI-readable data. Once that data lives in Beamy, Claude answers any client question in seconds, runs the firm's repeatable workflows, and never forgets anything.

## Who it's for

Two real customers, observed up close:

- **5-person construction GC** — drowning in not remembering what they did 18 months ago when a client calls. No admin to maintain the spreadsheet.
- **10-person interior architecture firm** that runs full project management — same memory + ops pain through a design lens.

Buyer: the principal/owner. v1 ships in **US + MX in parallel** (one pilot in each).

## The wedge

These principals already know AI could help — they're using Claude/ChatGPT in tabs already. They can't get value out of it because their data isn't structured. **Beamy is the structuring layer that pays itself back compounded** — every new project, vendor, install, and SOP makes Claude smarter, makes recall sharper, makes workflows more automated.

Not a project-management tool with AI bolted on. A **structured-data layer that AI sits on top of**. Memory, workflows, and PM are three views of the same data.

## Key architectural decisions

- **Multi-tenant from day 1** (D-10): `org_id` on every table; `orgScopedProcedure` middleware non-negotiable.
- **Three consumers, one backend** (D-21): web dashboard + in-app chat + MCP server — all v1, all consuming the same tRPC routers.
- **Forms-first with permanent input-ergonomics pressure** (D-22): partial completion welcome; voice/photo/PDF helpers route through a `change_proposals` queue.
- **Assets ≠ materials** (D-42): two first-class entities — assets (per-instance, warranties, sub-components) vs materials (per-batch, lot numbers, coverage). Aligns with CSI / IFC / CMMS conventions.
- **Never the accounting ledger of record** (D-24): QB Online is SoT; Beamy overlays project context. Read-only auto-sync + manual push-on-approval + dedicated reconciliation page (D-49).
- **Rail-agnostic AR/AP closure** (D-50): manual + QB-sync rails in v1; Stripe + Plaid as optional rails post-v1.
- **Hybrid RAG scoped to long-form docs only** (D-52): structured records use SQL + tsvector; pgvector embeddings cover only drawings / contracts / emails. Claude routes via tool selection.
- **Workflow engine with 8 typed step types** + scheduled + signal-driven runs (D-29): tribal knowledge codified as executable templates.
- **Reusable `@common/finance` package** (D-35): Cadenza + Riffy + Beamy share money primitives; extracted from Beamy once stable.

## Roadmap

| Milestone | Weeks | Theme |
|---|---|---|
| M0 ✓ | — | Scaffold + tenancy (inherited from Riffy) |
| M1 | 2 | Core entities + auth + i18n scaffold |
| M2 | 2.5 | Recall demo (assets, materials, photos) |
| M3 | 2 | Money core (rail-agnostic) |
| M4 | 4 | QB integration (US + MX) + reconciliation |
| M5 | 4 | Workflow engine + 10 seeded templates |
| M5.5 | 0.5 | `packages/finance` extraction discipline |
| M6 | 3 | MCP read + chat + hybrid RAG |
| M7 | 1.5 | MCP write + `change_proposals` |
| M8 | 2.5 | PDF + CAD + drawing sets |
| M9 | 1 | Scheduled workflows |

**Total: ~23–27 weeks of focused work to v1.** Ship M2 to both pilot firms and learn before grinding M3+.

## Workflow library — v1 cut

10 of 24 workflows ship in v1: lead → bid → proposal · project intake · spec/finish lock-in · vendor onboarding · site visit/daily log · change order (lite) · sub invoice → payment · weekly client update · warranty recall · compliance sweep (scheduled). The remaining 14 are spec'd and ride v1.5 / v2.

## What's explicitly deferred

Tax engine, FX conversion, DWG inline render, drawing markup tools, client portal, native mobile app, e-sign integration, inbound email automation, full automatic two-way QB sync, per-project ACLs, cross-org users. Each documented in §17 of the design doc.

## Lineage

Beamy is a fork of [Riffy](../../riffy) (a marketing-agency variant of the same idea). The chassis carries verbatim — multi-tenancy, tRPC tiers, audit, money primitives, workflow engine — and continues the **Astralitics line: Cadenza → Riffy → Beamy**.
