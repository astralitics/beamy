# Beamy — Design Language ("Beam")

The implemented design system for the Beamy dashboard. One codebase, two
verticals (construction + landscaping), light + dark, WCAG AA.

## Concept

**Beam.** A beam is the through-line of both trades — a steel beam, a survey
sight-line, a beam of light. The brand is a cool, calm, ink-on-paper canvas with
a single **beam of accent colour** placed on the one thing that needs you.
Restraint everywhere, one confident stroke of colour where it matters.

## Tokens

All colour is semantic CSS variables (RGB triples) in
[`apps/web/src/index.css`](../apps/web/src/index.css), read by Tailwind via
`rgb(var(--token) / <alpha-value>)`. Never hard-code hex in components.

- **Theme** — `:root` (light) and `:root[data-theme="dark"]` set the same token
  names to different values. `ThemeProvider` toggles `data-theme` on `<html>`.
- **Vertical** — `:root[data-vertical="landscaping"]` overrides only `--accent*`
  (electric blue → field green). `VerticalProvider` sets `data-vertical` from the
  org. Everything else (canvas, ink, surfaces, rails) is shared, so the two
  verticals read as one brand wearing a different accent — never "a different app".

Key roles: `--bg` / `--bg-subtle` (canvas), `--surface` (cards/tables),
`--text` / `--text-muted` / `--text-faint`, `--border*`, `--accent*` (the beam),
and money semantics `--success` (collected/paid), `--danger` (past-due),
`--warn`, plus their `-subtle` tints. The rail uses its own `--rail*` tokens.

## Type

- **Display** — Bricolage Grotesque (page titles, project names, stat numbers).
- **UI** — Hanken Grotesk (everything else).
- **Mono** — Spline Sans Mono (money, IDs, kbd).

Loaded in [`apps/web/index.html`](../apps/web/index.html); mapped in
[`tailwind.config.ts`](../apps/web/tailwind.config.ts) as `font-display` /
`font-sans` / `font-mono`. No Inter / Roboto / system stacks.

## Signature elements

- **The beam mark** (`.beam`) — a short rounded accent bar beside the wordmark.
- **The beam-rail** (`.beam-rail`) — an accent left-border on a hero stat (the
  Overview "today" panel, the Money outstanding figure).
- **One canonical table** (`.data-table`) — the *only* list-table class. Owns its
  border, `rounded-2xl`, `overflow-x: auto` (so wide tables scroll, never wrap),
  cell padding, hover, dividers, right-align via `.r`, and `tr.clickable`. Every
  list view in the app uses it, so all tables look and behave identically. The
  user prefers real `<table>`s over card/tile grids — keep it that way.
- **Plain empty states** — shared `<EmptyState>` (bold title + optional sub +
  optional action) so every zero-state matches.

## Components

`apps/web/src/components/ui.tsx` is the kit: `Button` (one solid-accent
primary), `PageHeader`, `Pill` (status, round dot + tone), `Select` / `Input`,
`Money` (always amount + currency, mono). Compose pages from these; don't
re-style primitives per page.

## Rules

1. Semantic tokens only — no hex, no `bg-white`/`bg-slate-*` in new code. (A
   legacy `slate/emerald/rose/amber` → token shim in the Tailwind config keeps
   un-migrated pages on-theme; new code should use the semantic names directly.)
2. One beam of colour per view — accent is for the thing that needs action, not
   decoration.
3. Tables are `.data-table`. Empty states are `<EmptyState>`.
4. Money is always `<Money>` (amount + currency).
5. Light and dark must both pass AA; the accent swap (blue/green) must hold in both.
