/**
 * Translation catalogs.
 *
 * `messagesEn` is the source of truth. Other locales are `Partial<>` —
 * missing keys fall back to English at lookup time, so we can ship strings
 * progressively without blocking on a complete translation pass.
 *
 * Adding a new key: add it to `messagesEn`. The `MessageKey` type updates
 * automatically; consumers get autocomplete + compile-time errors for
 * unknown keys.
 *
 * Adding a new locale (e.g., when the MX firm fully onboards): create
 * `messagesEsMx: Partial<typeof messagesEn> = { ... }` here and route to
 * it in `useT` based on `locale` from `LocaleContext`.
 */
export const messagesEn = {
  // ── sidebar nav ──
  "nav.home": "Home",
  "nav.projects": "Projects",
  "nav.clients": "Clients",
  "nav.vendors": "Vendors",
  "nav.services": "Services",
  "nav.money": "Money",
  "nav.compliance": "Compliance",
  "nav.workflows": "Workflows",
  "nav.prompts": "Prompts",
  "nav.settings": "Settings",

  // ── home page ──
  "home.milestone": "Milestone 1 — Core entities + auth",
  "home.title": "Beamy is alive.",
  "home.lede":
    "Web shell, sidenav, tRPC mounted as Vite middleware at /api/trpc. Real auth wiring lands later in M1; until then every request runs as the seeded dev user.",
  "home.repo.heading": "What's in the repo",
  "home.next.heading": "Next up — M1",
  "home.next.body":
    "Apply the baseline migration + run pnpm db:seed, then land core entity CRUD (clients, vendors, services, vendor compliance), the i18n scaffold for US + MX, and Supabase auth wiring.",

  // ── shared / common ──
  "common.loading": "Loading…",
  "common.saving": "Saving…",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.create": "Create",
  "common.remove": "Remove",
  "common.edit": "Edit",
} as const;

export const messagesEsMx: Partial<Record<keyof typeof messagesEn, string>> = {
  // Translations land progressively when the MX firm fully onboards.
  // Until then, lookup falls through to messagesEn. Stub a few high-visibility
  // keys so we can sanity-check the locale-routing infra during dev.
  "nav.home": "Inicio",
  "nav.projects": "Proyectos",
  "nav.clients": "Clientes",
  "nav.vendors": "Proveedores",
  "nav.services": "Servicios",
  "nav.money": "Dinero",
  "nav.compliance": "Cumplimiento",
  "nav.workflows": "Flujos de trabajo",
  "nav.prompts": "Prompts",
  "nav.settings": "Configuración",
  "common.loading": "Cargando…",
  "common.cancel": "Cancelar",
  "common.save": "Guardar",
  "common.create": "Crear",
};

export type MessageKey = keyof typeof messagesEn;
export type Locale = "en" | "es-MX" | string;
