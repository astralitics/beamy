import { useState } from "react";
import { Link, NavLink, useMatch } from "react-router-dom";
import { useLocale, useT } from "../lib/i18n";
import type { MessageKey } from "../lib/i18n";
import { useVertical } from "../lib/vertical";
import { useTheme } from "../lib/theme/theme-context";
import { useCommandPalette } from "./command-palette";
import { UserMenu } from "./user-menu";
import { Icon } from "./ui";

/**
 * The navigation rail. Always espresso, in BOTH themes and BOTH verticals —
 * the vertical whispers only through `--accent` (the active-item "catches the
 * light" rail + the wordmark dot + the top horizon band), never through the
 * sidebar surface. (This replaces the old forest-green landscaping remap,
 * which read as "a different app".) Fixed dark hexes here are intentional: the
 * rail is a constant dark surface, decoupled from the light/dark content theme.
 */
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
  const { open: openCommand } = useCommandPalette();
  const projectMatch = useMatch("/projects/:id/*");
  const inProject = Boolean(projectMatch);
  const projectId = projectMatch?.params.id;

  return (
    <>
      {/* Backdrop — only below lg, only while the drawer is open. */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-rail-line bg-rail text-rail-muted transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-4 pb-4 pt-6">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <span className="font-display text-2xl font-extrabold leading-none tracking-tightest text-text">
                Beamy
              </span>
              <span className="beam translate-y-[1px]" />
            </Link>
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              <LocaleToggle />
              <button
                type="button"
                onClick={onClose}
                aria-label={t("nav.close_menu")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rail-muted hover:bg-bg-subtle hover:text-text lg:hidden"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-rail-muted">
            {vertical === "landscaping" ? "Landscaping" : "Construction"}
          </p>
          <button
            type="button"
            onClick={openCommand}
            className="mt-4 flex w-full items-center gap-2.5 rounded-xl border border-rail-line bg-bg-subtle px-3.5 py-2.5 text-left text-[13px] text-rail-muted transition-colors hover:border-border-strong hover:text-text"
          >
            <Icon name="search" className="h-4 w-4" />
            <span className="flex-1">{t("nav.search")}</span>
            <kbd className="rounded border border-rail-line px-1.5 py-0.5 font-mono text-[10px] text-rail-muted">
              ⌘K
            </kbd>
          </button>
        </div>

        {inProject && (
          <div className="px-4 pb-2">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-rail-muted hover:text-text"
            >
              <Icon name="chevron-left" className="h-3 w-3" />
              {t("picker.back_to_workspace")}
            </Link>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-2 py-3">
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
                <ul key={idx} className={`space-y-0.5 ${idx > 0 ? "mt-6" : ""}`}>
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

        <div className="border-t border-rail-line p-2">
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
      <ul className={`space-y-0.5 ${topMargin ? "mt-4" : ""}`}>
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
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center justify-between rounded-lg px-3 pb-1 pt-5 text-left"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rail-muted group-hover:text-rail-ink">
          {t(section.labelKey)}
        </span>
        <Icon
          name="chevron-down"
          className={`h-3 w-3 text-rail-muted/60 transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5">
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

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light" : "Dark"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rail-muted transition-colors hover:bg-bg-subtle hover:text-text"
    >
      <Icon name={dark ? "sun" : "moon"} className="h-[18px] w-[18px]" />
    </button>
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
      className="inline-flex items-center rounded-full border border-rail-line bg-bg-subtle p-0.5 text-[11px] font-medium"
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
                ? "bg-accent text-accent-contrast"
                : "text-rail-muted hover:text-text"
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
          "block rounded-lg px-3 py-2 text-[14px] transition-colors",
          isActive
            ? "bg-accent-subtle font-semibold text-accent"
            : "text-rail-muted hover:bg-bg-subtle hover:text-text",
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}
