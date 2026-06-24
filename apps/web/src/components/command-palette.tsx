import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useTheme } from "../lib/theme/theme-context";
import { Icon } from "./ui";

/**
 * Command palette (⌘K) — Beamy's recall + speed surface.
 *
 * The product pitch is "ask and get your firm's data back instantly," but until
 * now there was no search at all — you navigated by clicking. This makes recall
 * one keystroke: ⌘K from anywhere, type a project / client / vendor / service
 * name to jump straight to it, or fire a quick action. For a time-poor
 * principal who'd rather type than click, this is the primary way to move.
 */
type Cmd = { open: () => void; close: () => void; toggle: () => void };
const CommandPaletteContext = createContext<Cmd>({
  open: () => {},
  close: () => {},
  toggle: () => {},
});

export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((o) => !o), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <CommandPaletteContext.Provider value={{ open, close, toggle }}>
      {children}
      {isOpen && <Palette onClose={close} />}
    </CommandPaletteContext.Provider>
  );
}

type Item = {
  key: string;
  group: string;
  label: string;
  sub?: string;
  run: () => void;
};

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [sel, setSel] = useState(0);

  // Debounce the query that hits the network.
  useEffect(() => {
    const id = setTimeout(() => setDq(q.trim()), 140);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const hasQuery = dq.length > 0;
  const search = hasQuery ? dq : undefined;

  const projectsQ = trpc.projects.list.useQuery(
    { search },
    { enabled: true, staleTime: 15_000 },
  );
  const clientsQ = trpc.clients.list.useQuery(
    { search },
    { enabled: hasQuery, staleTime: 15_000 },
  );
  const vendorsQ = trpc.vendors.list.useQuery(
    { search },
    { enabled: hasQuery, staleTime: 15_000 },
  );
  const servicesQ = trpc.services.list.useQuery(
    { search },
    { enabled: hasQuery, staleTime: 15_000 },
  );

  const go = useCallback(
    (to: string) => {
      navigate(to);
      onClose();
    },
    [navigate, onClose],
  );

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];

    // Records — the recall payload.
    const projects = projectsQ.data ?? [];
    (hasQuery ? projects : projects.slice(0, 5)).forEach((p) =>
      out.push({
        key: `p-${p.id}`,
        group: hasQuery ? "Projects" : "Recent projects",
        label: p.name,
        sub: p.address ?? undefined,
        run: () => go(`/projects/${p.id}`),
      }),
    );
    if (hasQuery) {
      (clientsQ.data ?? []).forEach((c) =>
        out.push({
          key: `c-${c.id}`,
          group: "Clients",
          label: c.name,
          sub: c.primaryContact ?? undefined,
          run: () => go("/clients"),
        }),
      );
      (vendorsQ.data ?? []).forEach((vn) =>
        out.push({
          key: `v-${vn.id}`,
          group: "Vendors",
          label: vn.name,
          sub: vn.trade,
          run: () => go("/vendors"),
        }),
      );
      (servicesQ.data ?? []).forEach((s) =>
        out.push({
          key: `s-${s.id}`,
          group: "Services",
          label: s.name,
          sub: s.description ?? undefined,
          run: () => go("/services"),
        }),
      );
    }

    // Actions + navigation — always available, filtered by query text.
    const actions: Item[] = [
      { key: "a-new", group: "Actions", label: "New project", sub: "Start an engagement", run: () => go("/projects?new=1") },
      { key: "a-theme", group: "Actions", label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme", run: () => { toggleTheme(); onClose(); } },
      { key: "n-projects", group: "Go to", label: "Projects", run: () => go("/projects") },
      { key: "n-clients", group: "Go to", label: "Clients", run: () => go("/clients") },
      { key: "n-vendors", group: "Go to", label: "Vendors", run: () => go("/vendors") },
      { key: "n-services", group: "Go to", label: "Services", run: () => go("/services") },
      { key: "n-workflows", group: "Go to", label: "Workflows", run: () => go("/workflows") },
      { key: "n-settings", group: "Go to", label: "Settings", run: () => go("/settings") },
    ];
    const ql = dq.toLowerCase();
    actions.forEach((a) => {
      if (!hasQuery || a.label.toLowerCase().includes(ql)) out.push(a);
    });

    return out;
  }, [projectsQ.data, clientsQ.data, vendorsQ.data, servicesQ.data, hasQuery, dq, theme, go, onClose, toggleTheme]);

  // Keep selection in range as results change.
  useEffect(() => {
    setSel((s) => (items.length === 0 ? 0 : Math.min(s, items.length - 1)));
  }, [items.length]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[sel]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  // Render with group headers, but keep a flat index for keyboard nav.
  let flat = -1;
  let lastGroup = "";
  const loading =
    projectsQ.isFetching ||
    (hasQuery && (clientsQ.isFetching || vendorsQ.isFetching || servicesQ.isFetching));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm animate-fade"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="horizon-top elevated relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface-2 shadow-pop animate-rise"
      >
        <div className="flex items-center gap-3 border-b border-border-subtle px-4">
          <Icon name="search" className="h-[18px] w-[18px] shrink-0 text-text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search projects, clients, vendors, services…"
            className="h-14 w-full bg-transparent text-[16px] text-text placeholder:text-text-faint focus:outline-none"
          />
          {loading && (
            <span className="shrink-0 text-[11px] text-text-faint">…</span>
          )}
        </div>

        <div className="max-h-[58vh] overflow-y-auto py-2">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-text-muted">
              No matches for “{dq}”.
            </p>
          ) : (
            items.map((it) => {
              flat += 1;
              const idx = flat;
              const showHeader = it.group !== lastGroup;
              lastGroup = it.group;
              const selected = idx === sel;
              return (
                <div key={it.key}>
                  {showHeader && (
                    <p className="section-label px-4 pb-1 pt-3">{it.group}</p>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => it.run()}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors ${
                      selected
                        ? "border-l-2 border-l-accent bg-accent-subtle pl-[14px]"
                        : "border-l-2 border-l-transparent"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] text-text">
                        {it.label}
                      </span>
                      {it.sub && (
                        <span className="block truncate text-[12px] text-text-faint">
                          {it.sub}
                        </span>
                      )}
                    </span>
                    {selected && (
                      <Icon
                        name="arrow-right"
                        className="h-4 w-4 shrink-0 text-accent"
                      />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-border-subtle bg-bg-subtle px-4 py-2 text-[11px] text-text-faint">
          <span className="font-mono">↑↓</span> navigate
          <span className="font-mono">↵</span> open
          <span className="font-mono">esc</span> close
        </div>
      </div>
    </div>
  );
}
