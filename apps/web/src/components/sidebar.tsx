import { useState } from "react";
import { Link, NavLink, useMatch } from "react-router-dom";
import { useT } from "../lib/i18n";
import type { MessageKey } from "../lib/i18n";
import { ProjectPicker } from "./project-picker";

type NavItem = { to: string; labelKey: MessageKey; end?: boolean };
type NavSection = {
  /**
   * Section header label key, or null for an ungrouped band (just a
   * divider above the items, no header).
   */
  labelKey: MessageKey | null;
  /** Collapsible groups can hide their children. Ungrouped bands aren't. */
  collapsible: boolean;
  items: NavItem[];
};

/**
 * Workspace-level nav. Visible when NOT inside a project.
 * Ungrouped bands separated by hairlines — implies floor levels on a
 * section drawing.
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
 * Project-level nav, grouped by phase of the construction workflow.
 *
 * Phase grouping (Property documentation / Work Proposal / Worksite
 * execution) mirrors how a job actually moves through time. Each
 * section is a collapsible group so the sidebar doesn't drown the
 * user in 15 tabs. Overview / Assistant / Documents / Activity stay
 * ungrouped because they cut across phases.
 *
 * `to` values are sub-route fragments — empty string for Overview,
 * leaf paths like `plan` otherwise. They're combined with the matched
 * project id at render time into ABSOLUTE paths
 * (`/projects/<id>/plan`). Query strings in `to` are preserved.
 */
const PROJECT_NAV: NavSection[] = [
  {
    labelKey: null,
    collapsible: false,
    items: [
      { to: "", labelKey: "project_nav.overview", end: true },
      { to: "assistant", labelKey: "project_nav.assistant" },
    ],
  },
  {
    labelKey: "project_nav.section.property",
    collapsible: true,
    items: [
      { to: "plan#rooms", labelKey: "project_nav.rooms" },
      { to: "drawings", labelKey: "project_nav.drawings" },
      { to: "assets", labelKey: "project_nav.assets" },
      { to: "materials", labelKey: "project_nav.materials" },
    ],
  },
  {
    labelKey: "project_nav.section.work_proposal",
    collapsible: true,
    items: [
      { to: "bids", labelKey: "project_nav.bids" },
      { to: "plan?phase=proposal", labelKey: "project_nav.plan_scope" },
      { to: "specs", labelKey: "project_nav.specs" },
      { to: "proposals", labelKey: "project_nav.proposals" },
      { to: "money?phase=proposal", labelKey: "project_nav.proposal_money" },
    ],
  },
  {
    labelKey: "project_nav.section.execution",
    collapsible: true,
    items: [
      { to: "plan?phase=execution", labelKey: "project_nav.plan_live" },
      { to: "plan?view=timeline", labelKey: "project_nav.schedule" },
      { to: "change-orders", labelKey: "project_nav.change_orders" },
      { to: "money?phase=execution", labelKey: "project_nav.bills_invoices" },
      { to: "site-logs", labelKey: "project_nav.site_logs" },
      { to: "rfis", labelKey: "project_nav.rfis" },
      { to: "punch", labelKey: "project_nav.punch" },
    ],
  },
  {
    labelKey: null,
    collapsible: false,
    items: [
      { to: "documents", labelKey: "project_nav.documents" },
      { to: "activity", labelKey: "project_nav.activity" },
    ],
  },
];

export function Sidebar() {
  const t = useT();
  const projectMatch = useMatch("/projects/:id/*");
  const inProject = Boolean(projectMatch);
  const projectId = projectMatch?.params.id;

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
            M3
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
        {inProject && projectId
          ? PROJECT_NAV.map((section, idx) => (
              <ProjectNavSection
                key={section.labelKey ?? `_${idx}`}
                section={section}
                projectId={projectId}
                divider={idx > 0}
              />
            ))
          : WORKSPACE_NAV.map((group, idx) => (
              <ul
                key={idx}
                className={`space-y-0.5 ${idx > 0 ? "mt-3 border-t border-paper-200 pt-3" : ""}`}
              >
                {group.map((item) => (
                  <li key={item.to}>
                    <SidebarLink to={item.to} end={item.end}>
                      {t(item.labelKey)}
                    </SidebarLink>
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

function ProjectNavSection({
  section,
  projectId,
  divider,
}: {
  section: NavSection;
  projectId: string;
  divider: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(true);

  const items = section.items.map((item) => {
    // Item `to` may include a query string like `plan?phase=proposal`;
    // preserve it after the base segment.
    const absTo = item.to
      ? `/projects/${projectId}/${item.to}`
      : `/projects/${projectId}`;
    return { ...item, to: absTo };
  });

  if (section.labelKey === null) {
    // Ungrouped band — just a hairline + items.
    return (
      <ul
        className={`space-y-0.5 ${divider ? "mt-3 border-t border-paper-200 pt-3" : ""}`}
      >
        {items.map((item) => (
          <li key={item.to}>
            <SidebarLink to={item.to} end={item.end}>
              {t(item.labelKey)}
            </SidebarLink>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      className={`${divider ? "mt-3 border-t border-paper-200 pt-3" : ""}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center gap-1 px-3 py-1 text-left"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400 group-hover:text-slate-600">
          {open ? "▾" : "▸"}
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 group-hover:text-slate-700">
          {t(section.labelKey)}
        </span>
      </button>
      {open && (
        <ul className="mt-0.5 space-y-0.5">
          {items.map((item) => (
            <li key={item.to}>
              <SidebarLink to={item.to} end={item.end}>
                {t(item.labelKey)}
              </SidebarLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A nav link. Active-state matching needs special handling when `to`
 * includes a query string: NavLink's default `to` is treated as a
 * path-only matcher, and items like `/projects/X/plan?phase=proposal`
 * and `/projects/X/plan?phase=execution` would both highlight when
 * the user lands on either. We disable matching's strictness so only
 * the current URL's query-stripped path drives the visual state.
 */
function SidebarLink({
  to,
  end,
  children,
}: {
  to: string;
  end?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end ?? false}
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
          {children}
        </>
      )}
    </NavLink>
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
