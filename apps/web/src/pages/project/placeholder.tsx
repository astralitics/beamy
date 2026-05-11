type PlaceholderInfo = {
  title: string;
  blurb: string;
  milestone: string;
};

const PLACEHOLDERS: Record<string, PlaceholderInfo> = {
  drawings: {
    title: "Drawings",
    blurb:
      "Sheet sets with version tracking (IFP → IFB → IFC → as-built), NCS-aware sheet numbering, in-browser PDF viewer with search across the set.",
    milestone: "M8 · CAD + drawings",
  },
  rfis: {
    title: "RFIs",
    blurb:
      "Question → answer → implemented state machine. Drafted from voice/photo; response attaches to the relevant sheet, spec, or asset.",
    milestone: "v1.5",
  },
  punch: {
    title: "Punch list",
    blurb:
      "Closeout items with required photos. State machine: open → scheduled → done → verified. Final invoice gates on full punch verification.",
    milestone: "v1.5",
  },
  "site-logs": {
    title: "Site logs",
    blurb:
      "Daily reports + site visits. Mobile capture (photo + voice memo) → Claude transcribes and extracts structured todos.",
    milestone: "v1 · workflow #6",
  },
  documents: {
    title: "Documents",
    blurb:
      "Project-scoped file library: contracts, warranties, manufacturer spec sheets, photos. Supabase Storage backend with project + room + asset tagging.",
    milestone: "M2 · this milestone",
  },
  money: {
    title: "Money",
    blurb:
      "Project-scoped view of bills (we owe vendors), invoices (clients owe us), payments, budget vs spend. The same money layer as the workspace view, filtered to this project.",
    milestone: "M3",
  },
  activity: {
    title: "Activity",
    blurb:
      "Project-scoped audit log. Every state transition, every record edited, every workflow run — with the actor string (user / agent / webhook) that did it.",
    milestone: "v1",
  },
};

export default function ProjectPlaceholder({ tab }: { tab: string }) {
  const info = PLACEHOLDERS[tab];
  if (!info) {
    return <p className="text-sm text-slate-500">Unknown tab: {tab}</p>;
  }
  return (
    <div className="relative overflow-hidden rounded-lg border border-paper-200 bg-white">
      {/* Faint blueprint grid only in the header band. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-32 bg-blueprint-grid bg-grid-32 opacity-70"
      />
      <div className="relative p-10">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-safety-700">
            {info.milestone}
          </span>
          <span className="h-px flex-1 bg-paper-200" />
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-blueprint-900">
          {info.title}
        </h2>
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-slate-600">
          {info.blurb}
        </p>
        <div className="mt-10 flex items-center gap-3 border-t border-paper-200 pt-4">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
            Status
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
            ▢ not poured yet · check back later
          </span>
        </div>
      </div>
    </div>
  );
}
