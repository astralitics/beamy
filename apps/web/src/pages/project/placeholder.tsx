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
  specs: {
    title: "Specs & finishes",
    blurb:
      "spec_items — the planning + procurement layer. Lifecycle states (specified → approved → ordered → installed), client price markup, vendor links.",
    milestone: "M2 · later this milestone",
  },
  assets: {
    title: "Assets",
    blurb:
      "Manufacturer / model / serial / warranty / install date / install photo. The killer recall record — \"what fridge in the Anderson kitchen?\" returns this row.",
    milestone: "M2 · next PR",
  },
  materials: {
    title: "Materials",
    blurb:
      "Paint / tile / flooring with lot numbers, coverage by room × surface, attic stock tracking. Distinct from assets — per-batch rather than per-instance identity.",
    milestone: "M2 · next PR",
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
    return (
      <p className="text-sm text-slate-500">Unknown tab: {tab}</p>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-paper-200 bg-paper-50 p-8">
      <p className="font-mono text-[10px] uppercase tracking-wider text-safety-700">
        {info.milestone}
      </p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-blueprint-900">
        {info.title}
      </h2>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-slate-600">
        {info.blurb}
      </p>
      <p className="mt-6 font-mono text-[10px] uppercase tracking-wider text-slate-400">
        not poured yet · check back later
      </p>
    </div>
  );
}
