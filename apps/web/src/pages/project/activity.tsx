import { useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type ActivityRow =
  inferRouterOutputs<AppRouter>["activity"]["listForProject"][number];

/**
 * Activity — project-scoped audit log. Every business mutation across
 * the data graph that touches this project (or any of its child rows)
 * lands here, with the actor attribution Cadenza-style:
 *   user:<uuid> / agent:claude / webhook:<src>
 *
 * The actor format is the breadcrumb that lets you tell "I changed
 * this" from "the integration changed this" from "Claude changed this"
 * a year from now.
 */
export default function ProjectActivity() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const entries = trpc.activity.listForProject.useQuery({
    projectId: project.id,
  });

  return (
    <div>
      <div>
        <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
          Activity
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Every state change, in order.
        </p>
      </div>

      <div className="mt-4">
        {entries.isLoading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : entries.error ? (
          <p className="text-xs text-rose-700">{entries.error.message}</p>
        ) : !entries.data || entries.data.length === 0 ? (
          <p className="rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
            No activity yet on this project. Edit any record on any tab to
            see entries land here.
          </p>
        ) : (
          <ol className="space-y-2">
            {entries.data.map((e) => (
              <ActivityItem key={e.id} entry={e} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ────────────────────── row ──────────────────────

function ActivityItem({ entry }: { entry: ActivityRow }) {
  const fmt = useFormatters();
  const { verb, tone } = parseAction(entry.action);
  const { kind, name } = parseActor(entry.actor);
  return (
    <li className="rounded-md border border-paper-200 bg-white px-3 py-2 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-medium text-blueprint-900">
              {entry.resourceType.replace(/_/g, " ")}
            </span>
            <span
              className={`inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${TONE_CLS[tone]}`}
            >
              {verb}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">
              · {KIND_LABEL[kind]} {name}
            </span>
          </div>
          {entry.payload != null ? (
            <PayloadPreview payload={entry.payload as Record<string, unknown>} />
          ) : null}
        </div>
        <span
          className="shrink-0 text-[10px] uppercase tracking-wider text-slate-400"
          title={new Date(entry.ts).toISOString()}
        >
          {fmt.date(entry.ts)} · {fmt.time(entry.ts)}
        </span>
      </div>
    </li>
  );
}

// Compact payload preview — first 3 keys, truncated values. Keeps the
// audit log readable without dumping a JSON blob into the UI.
function PayloadPreview({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).slice(0, 3);
  if (entries.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-slate-500">
      {entries.map(([k, v]) => (
        <span key={k}>
          <span className="text-slate-400">{k}</span> ·{" "}
          <span className="text-slate-700">{formatValue(v)}</span>
        </span>
      ))}
      {Object.keys(payload).length > 3 && (
        <span className="text-slate-400">
          + {Object.keys(payload).length - 3} more
        </span>
      )}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") {
    return v.length > 60 ? `${v.slice(0, 57)}…` : v;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") return "{…}";
  return String(v);
}

// ────────────────────── action tone ──────────────────────

type Tone = "created" | "updated" | "deleted" | "transitioned" | "other";
const TONE_CLS: Record<Tone, string> = {
  created: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  updated: "bg-sky-50 text-sky-800 ring-sky-200",
  deleted: "bg-rose-50 text-rose-700 ring-rose-200",
  transitioned: "bg-amber-50 text-amber-800 ring-amber-200",
  other: "bg-slate-50 text-slate-700 ring-slate-200",
};

/**
 * Action strings follow `entity.verb` (or `entity.verb.detail`). Extract
 * the verb for the pill; rest of the string informs color choice.
 *   "asset.created"           → { verb: "created", tone: "created" }
 *   "spec.transitioned.ordered" → { verb: "→ ordered", tone: "transitioned" }
 *   "bill.paid"               → { verb: "paid", tone: "transitioned" }
 */
function parseAction(action: string): { verb: string; tone: Tone } {
  const parts = action.split(".");
  const verb = parts[1] ?? action;
  if (verb === "transitioned" && parts[2]) {
    return { verb: `→ ${parts[2]}`, tone: "transitioned" };
  }
  if (verb === "created") return { verb, tone: "created" };
  if (verb === "deleted") return { verb, tone: "deleted" };
  if (verb === "updated") return { verb, tone: "updated" };
  if (
    verb === "paid" ||
    verb === "sent" ||
    verb === "archived" ||
    verb === "restored"
  ) {
    return { verb, tone: "transitioned" };
  }
  return { verb, tone: "other" };
}

// ────────────────────── actor parsing ──────────────────────

const KIND_LABEL = {
  user: "by",
  agent: "by agent",
  webhook: "via webhook",
  unknown: "by",
} as const;

function parseActor(actor: string): {
  kind: keyof typeof KIND_LABEL;
  name: string;
} {
  // Format: "<kind>:<rest>"
  const [kind, rest = ""] = actor.split(":", 2);
  if (kind === "user") {
    // UUIDs are noisy — show short hex.
    return { kind: "user", name: rest.replace(/-/g, "").slice(0, 8) };
  }
  if (kind === "agent") return { kind: "agent", name: rest || "agent" };
  if (kind === "webhook") return { kind: "webhook", name: rest || "webhook" };
  return { kind: "unknown", name: actor };
}
