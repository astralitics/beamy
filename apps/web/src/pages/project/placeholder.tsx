import { useT, type MessageKey } from "../../lib/i18n";

type PlaceholderInfo = {
  titleKey: MessageKey;
  blurbKey: MessageKey;
  milestone: string;
};

/**
 * Catalog of tabs that exist in the sidebar but have no implementation yet.
 * Adding a new tab here makes it render as a clean "Not yet built" state
 * with a short description of what it's going to be.
 */
const PLACEHOLDERS: Record<string, PlaceholderInfo> = {
  drawings: {
    titleKey: "placeholder.drawings.title",
    blurbKey: "placeholder.drawings.blurb",
    milestone: "M8 · CAD + drawings",
  },
  rfis: {
    titleKey: "placeholder.rfis.title",
    blurbKey: "placeholder.rfis.blurb",
    milestone: "v1.5",
  },
  punch: {
    titleKey: "placeholder.punch.title",
    blurbKey: "placeholder.punch.blurb",
    milestone: "v1.5",
  },
  "site-logs": {
    titleKey: "placeholder.site_logs.title",
    blurbKey: "placeholder.site_logs.blurb",
    milestone: "v1 · workflow #6",
  },
};

export default function ProjectPlaceholder({ tab }: { tab: string }) {
  const t = useT();
  const info = PLACEHOLDERS[tab];
  if (!info) {
    return (
      <p className="text-sm text-zinc-500">
        {t("placeholder.unknown_tab", { tab })}
      </p>
    );
  }
  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-blueprint-900">
          {t(info.titleKey)}
        </h2>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 ring-1 ring-inset ring-zinc-200">
          {t("placeholder.not_yet_built")}
        </span>
      </div>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-zinc-600">
        {t(info.blurbKey)}
      </p>
      <p className="mt-6 text-xs text-zinc-400">
        {t("placeholder.planned_for", {
          milestone: info.milestone,
        })}
      </p>
    </section>
  );
}
