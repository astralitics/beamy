import { NavLink } from "react-router-dom";
import { useT } from "../lib/i18n";
import type { MessageKey } from "../lib/i18n";

type NavItem = { to: string; labelKey: MessageKey };

/**
 * Nav grouped into three subtle bands. Dividers are barely there —
 * they imply structure (like floor levels on a section drawing)
 * without shouting about it.
 */
const NAV_GROUPS: NavItem[][] = [
  // Primary surfaces
  [
    { to: "/", labelKey: "nav.home" },
    { to: "/projects", labelKey: "nav.projects" },
  ],
  // The people + offerings
  [
    { to: "/clients", labelKey: "nav.clients" },
    { to: "/vendors", labelKey: "nav.vendors" },
    { to: "/services", labelKey: "nav.services" },
  ],
  // Oversight / financial
  [
    { to: "/money", labelKey: "nav.money" },
    { to: "/compliance", labelKey: "nav.compliance" },
  ],
  // System
  [
    { to: "/workflows", labelKey: "nav.workflows" },
    { to: "/prompts", labelKey: "nav.prompts" },
    { to: "/settings", labelKey: "nav.settings" },
  ],
];

export function Sidebar() {
  const t = useT();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-paper-200 bg-paper-50">
      <div className="flex h-14 items-center border-b border-paper-200 px-4">
        <BeamMark className="h-3.5 w-3.5 text-blueprint-900" />
        <span className="ml-2 text-lg font-semibold tracking-tight text-blueprint-900">
          Beamy
        </span>
        <span className="ml-2 rounded-sm bg-safety-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-safety-800 ring-1 ring-inset ring-safety-200">
          M2
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_GROUPS.map((group, idx) => (
          <ul
            key={idx}
            className={`space-y-0.5 ${idx > 0 ? "mt-3 border-t border-paper-200 pt-3" : ""}`}
          >
            {group.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
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
                      {/* Tiny amber tick on the left edge of the active route. */}
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
 * I-beam profile (cross-section, end-on view). Three rects: top flange,
 * web, bottom flange. Reads as "beam" without spelling it out.
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
