import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/projects", label: "Projects" },
  { to: "/clients", label: "Clients" },
  { to: "/work-orders", label: "Work Orders" },
  { to: "/purchase-orders", label: "Purchase Orders" },
  { to: "/finance", label: "Finance" },
  { to: "/services", label: "Services" },
  { to: "/workflows", label: "Workflows" },
  { to: "/prompts", label: "Prompts" },
  { to: "/settings", label: "Settings" },
];

export function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-14 items-center border-b border-slate-200 px-4">
        <span className="text-lg font-semibold tracking-tight">Beamy</span>
        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
          M0
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
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
