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
  // ── sidebar nav (workspace mode) ──
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

  // ── project picker ──
  "picker.label": "Project",
  "picker.empty": "No projects yet",
  "picker.new": "+ New project",
  "picker.view_all": "View all projects",
  "picker.back_to_workspace": "← Back to workspace",

  // ── sidebar nav (project mode) ──
  "project_nav.overview": "Overview",
  "project_nav.assistant": "Assistant",
  "project_nav.work_plan": "Work plan",
  "project_nav.drawings": "Drawings",
  "project_nav.specs": "Specs",
  "project_nav.assets": "Assets",
  "project_nav.materials": "Materials",
  "project_nav.rfis": "RFIs",
  "project_nav.punch": "Punch",
  "project_nav.site_logs": "Site logs",
  "project_nav.documents": "Documents",
  "project_nav.money": "Money",
  "project_nav.activity": "Activity",

  // ── home page ──
  "home.milestone": "Milestone 2 — Recall demo",
  "home.title": "Beamy is alive.",
  "home.lede":
    "M1 complete: clients, vendors (+ compliance), services, contacts, members + invitations, i18n scaffold, Supabase Auth. M2 in flight — projects + rooms landed; assets, materials, photos, and recall search are next.",
  "home.repo.heading": "What's in the repo",
  "home.next.heading": "Next up — M2",
  "home.next.body":
    "Assets (manufacturer / model / serial / warranty), materials with lot numbers + coverage, photo upload via Supabase Storage, and Postgres full-text search. The hero recall demo — \"what fridge in the Anderson kitchen?\" — lands at the end of M2.",

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
  "picker.label": "Proyecto",
  "picker.empty": "No hay proyectos",
  "picker.new": "+ Nuevo proyecto",
  "picker.view_all": "Ver todos los proyectos",
  "picker.back_to_workspace": "← Volver al espacio de trabajo",
  "project_nav.overview": "Resumen",
  "project_nav.assistant": "Asistente",
  "project_nav.work_plan": "Plan de obra",
  "project_nav.drawings": "Planos",
  "project_nav.specs": "Especificaciones",
  "project_nav.assets": "Activos",
  "project_nav.materials": "Materiales",
  "project_nav.rfis": "RFI",
  "project_nav.punch": "Punch",
  "project_nav.site_logs": "Bitácoras",
  "project_nav.documents": "Documentos",
  "project_nav.money": "Dinero",
  "project_nav.activity": "Actividad",
  "common.loading": "Cargando…",
  "common.cancel": "Cancelar",
  "common.save": "Guardar",
  "common.create": "Crear",
};

export type MessageKey = keyof typeof messagesEn;
export type Locale = "en" | "es-MX" | string;
