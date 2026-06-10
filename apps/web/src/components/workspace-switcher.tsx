import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  VERTICALS,
  VERTICAL_LABELS,
  type Vertical,
} from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useT } from "../lib/i18n";
import { getActiveOrg, setActiveOrg } from "../lib/active-org";
import { Button, Field, Input, Modal, Select } from "./ui";

/**
 * Top-of-sidebar workspace switcher. A user may belong to several orgs (e.g. a
 * construction workspace + a landscaping one); this picks the active one and
 * lets them spin up a new workspace.
 *
 * The active org is whatever's stored in localStorage, falling back to the
 * first membership (matching the server default — earliest joined). Selecting a
 * different workspace (or creating one) writes the choice and does a full
 * reload: the active-org header changes, so every org-scoped query and the
 * locale + vertical providers re-resolve cleanly.
 */
export function WorkspaceSwitcher() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const orgs = trpc.me.listOrgs.useQuery(undefined, { retry: false });

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const list = orgs.data ?? [];
  const stored = getActiveOrg();
  const current = list.find((o) => o.orgId === stored) ?? list[0] ?? null;

  function choose(orgId: string) {
    if (orgId !== current?.orgId) {
      setActiveOrg(orgId);
      window.location.reload();
      return;
    }
    setOpen(false);
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={t("workspace.switch")}
          className="group flex w-full items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-800 px-3.5 py-2.5 text-left transition-colors hover:border-ink-600"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
              {t("workspace.label")}
            </p>
            <p className="mt-0.5 truncate text-[14px] font-medium text-white">
              {current?.name ?? "—"}
            </p>
          </div>
          <Chevron open={open} />
        </button>

        {open && (
          <div className="absolute left-0 right-0 z-40 mt-1.5 max-h-80 animate-rise overflow-y-auto rounded-xl border border-ink-200/70 bg-white py-1.5 shadow-lift">
            <ul>
              {list.map((o) => {
                const active = o.orgId === current?.orgId;
                return (
                  <li key={o.orgId}>
                    <button
                      type="button"
                      onClick={() => choose(o.orgId)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-paper-50 ${
                        active ? "text-ink-900" : "text-ink-700"
                      }`}
                    >
                      <span className="truncate">{o.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <VerticalChip vertical={o.vertical} />
                        {active && (
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 rounded-full bg-accent-500"
                          />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="my-1 border-t border-ink-100" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setNewOpen(true);
              }}
              className="block w-full px-3 py-1.5 text-left text-[13px] font-medium text-accent-600 hover:bg-paper-50"
            >
              + {t("workspace.new")}
            </button>
          </div>
        )}
      </div>

      {newOpen && <NewWorkspaceDialog onClose={() => setNewOpen(false)} />}
    </>
  );
}

function NewWorkspaceDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [vertical, setVertical] = useState<Vertical>("construction");
  const [error, setError] = useState<string | null>(null);

  const create = trpc.orgs.create.useMutation({
    onSuccess: (org) => {
      // Switch into the brand-new workspace; reload reflows vertical + locale.
      setActiveOrg(org.id);
      window.location.reload();
    },
    onError: (e) => setError(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({ name: trimmed, slug: makeSlug(trimmed), vertical });
  }

  return (
    <Modal
      title={t("workspace.new")}
      subtitle={t("workspace.new_lede")}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t("workspace.name")} required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("workspace.name_ph")}
            autoFocus
            required
            maxLength={120}
            disabled={create.isPending}
          />
        </Field>
        <Field label={t("workspace.product")}>
          <Select
            value={vertical}
            onChange={(e) => setVertical(e.target.value as Vertical)}
            disabled={create.isPending}
          >
            {VERTICALS.map((v) => (
              <option key={v} value={v}>
                {VERTICAL_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={create.isPending || !name.trim()}>
            {create.isPending ? t("workspace.creating") : t("workspace.create")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Slugify a name + short random suffix so a user's Nth workspace never clashes. */
function makeSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "workspace";
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

function VerticalChip({ vertical }: { vertical: string }) {
  const isLandscaping = vertical === "landscaping";
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        isLandscaping
          ? "bg-emerald-50 text-emerald-700"
          : "bg-sky-50 text-sky-700"
      }`}
    >
      {isLandscaping ? "Landscaping" : "Construction"}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`h-3 w-3 shrink-0 text-ink-500 transition-transform ${
        open ? "rotate-180" : ""
      }`}
    >
      <path
        d="M3.5 6L8 10.5 12.5 6"
        stroke="currentColor"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
