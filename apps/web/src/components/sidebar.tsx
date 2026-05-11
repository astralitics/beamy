import { NavLink } from "react-router-dom";
import { useT } from "../lib/i18n";
import type { MessageKey } from "../lib/i18n";

type NavItem = { to: string; labelKey: MessageKey };

const NAV: NavItem[] = [
  { to: "/", labelKey: "nav.home" },
  { to: "/projects", labelKey: "nav.projects" },
  { to: "/clients", labelKey: "nav.clients" },
  { to: "/vendors", labelKey: "nav.vendors" },
  { to: "/services", labelKey: "nav.services" },
  { to: "/money", labelKey: "nav.money" },
  { to: "/compliance", labelKey: "nav.compliance" },
  { to: "/workflows", labelKey: "nav.workflows" },
  { to: "/prompts", labelKey: "nav.prompts" },
  { to: "/settings", labelKey: "nav.settings" },
];

export function Sidebar() {
  const t = useT();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-14 items-center border-b border-slate-200 px-4">
        <span className="text-lg font-semibold tracking-tight">Beamy</span>
        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
          M1
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  [
                    "block rounded-md px-3 py-1.5 text-sm",
                    isActive
                      ? "bg-slate-100 font-medium text-slate-900"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  ].join(" ")
                }
              >
                {t(item.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
