type PlaceholderInfo = {
  title: string;
  blurb: string;
  milestone: string;
};

/**
 * Catalog of tabs that exist in the sidebar but have no implementation yet.
 * Adding a new tab here makes it render as a clean "Not yet built" state
 * with a short description of what it's going to be.
 */
const PLACEHOLDERS: Record<string, PlaceholderInfo> = {
  drawings: {
    title: "Drawings",
    blurb:
      "Sheet sets with version tracking (IFP → IFB → IFC → as-built), NCS-aware sheet numbering, and in-browser PDF search across the set.",
    milestone: "M8 · CAD + drawings",
  },
  rfis: {
    title: "RFIs",
    blurb:
      "Question → answer → implemented state machine. Drafted from voice or photo; the answer attaches to the relevant sheet, spec, or asset.",
    milestone: "v1.5",
  },
  punch: {
    title: "Punch list",
    blurb:
      "Closeout items with required photos. State machine: open → scheduled → done → verified. Final invoice gates on full verification.",
    milestone: "v1.5",
  },
  "site-logs": {
    title: "Site logs",
    blurb:
      "Daily reports and site visits. Mobile capture (photo + voice memo); Claude transcribes and extracts structured todos.",
    milestone: "v1 · workflow #6",
  },
};

export default function ProjectPlaceholder({ tab }: { tab: string }) {
  const info = PLACEHOLDERS[tab];
  if (!info) {
    return <p className="text-sm text-zinc-500">Unknown tab: {tab}</p>;
  }
  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-blueprint-900">
          {info.title}
        </h2>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 ring-1 ring-inset ring-zinc-200">
          Not yet built
        </span>
      </div>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-zinc-600">
        {info.blurb}
      </p>
      <p className="mt-6 text-xs text-zinc-400">
        Planned for <span className="text-zinc-600">{info.milestone}</span>.
      </p>
    </section>
  );
}
