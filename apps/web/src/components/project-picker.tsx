import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useT } from "../lib/i18n";

/**
 * Top-of-sidebar project picker — Vercel/Supabase style.
 *
 * Always visible. Shows the current project when inside `/projects/:id/*`,
 * else shows a "Project" label. Clicking opens a dropdown listing active
 * projects + a "+ New project" CTA + "View all projects" link.
 *
 * Projects are the primary axis in Beamy: this picker is the gesture you
 * make most often to move between them without going back to the list.
 */
export function ProjectPicker() {
  const t = useT();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const projects = trpc.projects.list.useQuery({ status: "active" });
  const current = params.id
    ? projects.data?.find((p) => p.id === params.id)
    : undefined;

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close the dropdown when route changes.
  useEffect(() => {
    setOpen(false);
  }, [params.id]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-paper-200 bg-white px-3 py-1.5 text-left text-sm hover:border-paper-200 hover:bg-paper-50"
      >
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
            {t("picker.label")}
          </p>
          <p className="truncate text-sm font-medium text-blueprint-900">
            {current ? current.name : "All projects"}
          </p>
        </div>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-40 mt-1 max-h-80 overflow-y-auto rounded-md border border-paper-200 bg-white py-1 shadow-lg">
          {projects.isLoading ? (
            <p className="px-3 py-2 text-xs text-slate-500">
              {t("picker.label")}…
            </p>
          ) : !projects.data || projects.data.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">
              {t("picker.empty")}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {projects.data.map((p) => {
                const active = p.id === params.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        navigate(`/projects/${p.id}`);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-paper-100 ${
                        active ? "bg-safety-50 text-blueprint-900" : ""
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      {active && (
                        <span
                          aria-hidden
                          className="font-mono text-[10px] text-safety-700"
                        >
                          ●
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="my-1 border-t border-paper-200" />
          <Link
            to="/projects"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-xs text-slate-600 hover:bg-paper-100 hover:text-blueprint-900"
          >
            {t("picker.view_all")}
          </Link>
          <Link
            to="/projects?new=1"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-xs font-medium text-safety-700 hover:bg-paper-100"
          >
            {t("picker.new")}
          </Link>
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${
        open ? "rotate-180" : ""
      }`}
    >
      <path d="M3.5 6L8 10.5 12.5 6" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
