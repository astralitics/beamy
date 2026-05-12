import { Link, NavLink, useMatch } from "react-router-dom";
import { useT } from "../lib/i18n";
import type { MessageKey } from "../lib/i18n";
import { ProjectPicker } from "./project-picker";

type NavItem = { to: string; labelKey: MessageKey; end?: boolean };

/**
 * Workspace-level nav. Visible when NOT inside a project.
 * Grouped into bands — implies floor levels on a section drawing.
 */
const WORKSPACE_NAV: NavItem[][] = [
  [{ to: "/", labelKey: "nav.home", end: true }],
  [
    { to: "/projects", labelKey: "nav.projects" },
    { to: "/clients", labelKey: "nav.clients" },
    { to: "/vendors", labelKey: "nav.vendors" },
    { to: "/services", labelKey: "nav.services" },
  ],
  [
    { to: "/money", labelKey: "nav.money" },
    { to: "/compliance", labelKey: "nav.compliance" },
  ],
  [
    { to: "/workflows", labelKey: "nav.workflows" },
    { to: "/prompts", labelKey: "nav.prompts" },
    { to: "/settings", labelKey: "nav.settings" },
  ],
];

/**
 * Project-level nav. Visible when inside `/projects/:id/*`.
 *
 * `to` values are sub-route fragments — empty string for the project's
 * Overview, otherwise the leaf path like `work-plan`. They're combined
 * with the matched project id at render time to produce **absolute**
 * paths like `/projects/<id>/work-plan`. Relative `<NavLink to="…">`
 * would resolve against the current location, so clicking "Work plan"
 * from `/projects/<id>/assistant` would produce
 * `/projects/<id>/assistant/work-plan` → 404.
 */
const PROJECT_NAV: NavItem[][] = [
  [
    { to: "", labelKey: "project_nav.overview", end: true },
    { to: "assistant", labelKey: "project_nav.assistant" },
  ],
  [
    { to: "work-plan", labelKey: "project_nav.work_plan" },
    { to: "drawings", labelKey: "project_nav.drawings" },
    { to: "specs", labelKey: "project_nav.specs" },
  ],
  [
    { to: "assets", labelKey: "project_nav.assets" },
    { to: "materials", labelKey: "project_nav.materials" },
  ],
  [
    { to: "rfis", labelKey: "project_nav.rfis" },
    { to: "punch", labelKey: "project_nav.punch" },
    { to: "site-logs", labelKey: "project_nav.site_logs" },
  ],
  [
    { to: "documents", labelKey: "project_nav.documents" },
    { to: "money", labelKey: "project_nav.money" },
    { to: "proposals", labelKey: "project_nav.proposals" },
    { to: "change-orders", labelKey: "project_nav.change_orders" },
    { to: "activity", labelKey: "project_nav.activity" },
  ],
];

export function Sidebar() {
  const t = useT();
  const projectMatch = useMatch("/projects/:id/*");
  const inProject = Boolean(projectMatch);
  const projectId = projectMatch?.params.id;

  // Resolve project nav items to absolute paths (see PROJECT_NAV comment).
  const projectGroups: NavItem[][] = inProject && projectId
    ? PROJECT_NAV.map((g) =>
        g.map((item) => ({
          ...item,
          to: item.to ? `/projects/${projectId}/${item.to}` : `/projects/${projectId}`,
        })),
      )
    : [];

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-paper-200 bg-paper-50">
      <div className="border-b border-paper-200 px-4 py-3">
        <div className="flex items-center">
          <BeamMark className="h-3.5 w-3.5 text-blueprint-900" />
          <Link
            to="/"
            className="ml-2 text-lg font-semibold tracking-tight text-blueprint-900 hover:text-blueprint-800"
          >
            Beamy
          </Link>
          <span className="ml-2 rounded-sm bg-safety-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-safety-800 ring-1 ring-inset ring-safety-200">
            M2
          </span>
        </div>
        <div className="mt-3">
          <ProjectPicker />
        </div>
      </div>

      {inProject && (
        <div className="border-b border-paper-200 px-4 py-2">
          <Link
            to="/"
            className="font-mono text-[10px] uppercase tracking-wider text-slate-500 hover:text-blueprint-900"
          >
            {t("picker.back_to_workspace")}
          </Link>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-2">
        {(inProject ? projectGroups : WORKSPACE_NAV).map((group, idx) => (
          <ul
            key={idx}
            className={`space-y-0.5 ${idx > 0 ? "mt-3 border-t border-paper-200 pt-3" : ""}`}
          >
            {group.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end ?? false}
                  className={({ isActive }) =>
                    [
                      "group relative block rounded-md px-3 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-safety-50 font-medium text-blueprint-900 ring-1 ring-inset ring-safety-100"
                        : "text-slate-600 hover:bg-paper-100 hover:text-blueprint-900",
                    ].join(" ")
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-r bg-safety-700"
                        />
                      )}
                      {t(item.labelKey)}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        ))}
      </nav>

      <div className="border-t border-paper-200 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
          v0.1 · build a little, recall a lot
        </p>
      </div>
    </aside>
  );
}

/**
 * I-beam profile (cross-section, end-on). Reads as "beam" without spelling
 * it out — and doubles as the dot of the i.
 */
function BeamMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <rect x="1" y="2" width="14" height="2.75" rx="0.4" />
      <rect x="6.75" y="4.75" width="2.5" height="6.5" />
      <rect x="1" y="11.25" width="14" height="2.75" rx="0.4" />
    </svg>
  );
}
