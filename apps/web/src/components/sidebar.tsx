import { useState } from "react";
import { Link, NavLink, useMatch } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useLocale, useT } from "../lib/i18n";
import type { MessageKey } from "../lib/i18n";
import { useVertical } from "../lib/vertical";
import { ProjectPicker } from "./project-picker";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { UserMenu } from "./user-menu";
import { Icon } from "./ui";

type NavItem = { to: string; labelKey: MessageKey; end?: boolean };
type NavSection = {
  labelKey: MessageKey | null;
  collapsible: boolean;
  defaultOpen?: boolean;
  items: NavItem[];
};

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
    defaultOpen: true,
    items: [
      { to: "rooms", labelKey: "project_nav.rooms" },
      { to: "drawings", labelKey: "project_nav.drawings" },
      { to: "assets", labelKey: "project_nav.assets" },
      { to: "furniture", labelKey: "project_nav.furniture" },
      { to: "materials", labelKey: "project_nav.materials" },
    ],
  },
  {
    labelKey: "project_nav.section.work_proposal",
    collapsible: true,
    defaultOpen: true,
    items: [
      { to: "bids", labelKey: "project_nav.bids" },
      { to: "plan?phase=proposal", labelKey: "project_nav.plan_scope" },
      { to: "proposals", labelKey: "project_nav.proposals" },
      { to: "money?phase=proposal", labelKey: "project_nav.proposal_money" },
    ],
  },
  {
    labelKey: "project_nav.section.execution",
    collapsible: true,
    defaultOpen: false,
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

export function Sidebar({
  open = false,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const t = useT();
  const vertical = useVertical();
  const projectMatch = useMatch("/projects/:id/*");
  const inProject = Boolean(projectMatch);
  const projectId = projectMatch?.params.id;
  const isPlatformAdmin =
    trpc.me.isPlatformAdmin.useQuery().data?.isPlatformAdmin ?? false;

  return (
    <>
      {/* Backdrop — only below lg, only while the drawer is open. */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        data-vertical={vertical}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900 text-ink-200 transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-6 pb-4 pt-6">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="inline-flex items-baseline gap-1.5">
              <span className="font-display text-2xl font-normal leading-none tracking-tightest text-white">
                Beamy
              </span>
              <span className="h-1 w-1 translate-y-[-2px] rounded-full bg-accent-300" />
            </Link>
            <div className="flex items-center gap-2">
              <LocaleToggle />
              <button
                type="button"
                onClick={onClose}
                aria-label={t("nav.close_menu")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-white lg:hidden"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <WorkspaceSwitcher />
            <ProjectPicker />
          </div>
        </div>

      {inProject && (
        <div className="px-6 pb-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-[12px] text-ink-400 hover:text-white"
          >
            <Icon name="chevron-left" className="h-3 w-3" />
            {t("picker.back_to_workspace")}
          </Link>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {inProject && projectId
          ? PROJECT_NAV.map((section, idx) => (
              <ProjectNavSection
                key={section.labelKey ?? `_${idx}`}
                section={section}
                projectId={projectId}
                topMargin={idx > 0}
              />
            ))
          : WORKSPACE_NAV.map((group, idx) => (
              <ul
                key={idx}
                className={`space-y-0.5 ${idx > 0 ? "mt-5" : ""}`}
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
        {!inProject && isPlatformAdmin && (
          <ul className="mt-5 space-y-0.5 border-t border-ink-800 pt-4">
            <li>
              <SidebarLink to="/admin/workspaces">All workspaces</SidebarLink>
            </li>
          </ul>
        )}
        </nav>

        <div className="border-t border-ink-800 p-2">
          <UserMenu />
        </div>
      </aside>
    </>
  );
}

function ProjectNavSection({
  section,
  projectId,
  topMargin,
}: {
  section: NavSection;
  projectId: string;
  topMargin: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(section.defaultOpen ?? true);

  const items = section.items.map((item) => {
    const absTo = item.to
      ? `/projects/${projectId}/${item.to}`
      : `/projects/${projectId}`;
    return { ...item, to: absTo };
  });

  if (section.labelKey === null) {
    return (
      <ul className={`space-y-0.5 ${topMargin ? "mt-5" : ""}`}>
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
    <div className={topMargin ? "mt-5" : ""}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center gap-1 px-3 py-1 text-left"
      >
        <Icon
          name="chevron-down"
          className={`h-3 w-3 text-ink-500 transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500 group-hover:text-ink-300">
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

function LocaleToggle() {
  const { locale, setLocale } = useLocale();
  const opts: { code: "en" | "es-MX"; label: string }[] = [
    { code: "en", label: "EN" },
    { code: "es-MX", label: "ES" },
  ];
  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex items-center rounded-full border border-ink-700 bg-ink-800 p-0.5 text-[11px] font-medium"
    >
      {opts.map((o) => {
        const active = locale === o.code;
        return (
          <button
            key={o.code}
            type="button"
            onClick={() => setLocale(o.code)}
            aria-pressed={active}
            className={`rounded-full px-2.5 py-1 transition-colors ${
              active
                ? "bg-white text-ink-900"
                : "text-ink-400 hover:text-white"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

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
          "block rounded-md px-3 py-1.5 text-[14px] transition-colors",
          isActive
            ? "bg-ink-800 font-medium text-white"
            : "text-ink-300 hover:bg-ink-800/60 hover:text-white",
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}
