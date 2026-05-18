import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useT } from "../lib/i18n";
import { Icon } from "../components/ui";

const QUICK_LINKS: Array<{
  to: string;
  titleKey: "home.tile.projects" | "home.tile.clients" | "home.tile.vendors" | "home.tile.services";
  subKey:
    | "home.tile.projects.sub"
    | "home.tile.clients.sub"
    | "home.tile.vendors.sub"
    | "home.tile.services.sub";
}> = [
  {
    to: "/projects",
    titleKey: "home.tile.projects",
    subKey: "home.tile.projects.sub",
  },
  {
    to: "/clients",
    titleKey: "home.tile.clients",
    subKey: "home.tile.clients.sub",
  },
  {
    to: "/vendors",
    titleKey: "home.tile.vendors",
    subKey: "home.tile.vendors.sub",
  },
  {
    to: "/services",
    titleKey: "home.tile.services",
    subKey: "home.tile.services.sub",
  },
];

export default function HomePage() {
  const t = useT();
  const whoami = trpc.me.whoami.useQuery();

  return (
    <div className="mx-auto max-w-3xl px-10 py-20 animate-rise">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
        {whoami.data?.org.name ?? "—"}
      </p>
      <h1 className="mt-2 font-display text-5xl font-normal leading-[1.05] tracking-tightest text-ink-900">
        {t("home.title")}
      </h1>
      <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ink-500">
        {t("home.lede")}
      </p>

      <div className="mt-14">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
          {t("home.jump_in")}
        </p>
        <ul className="mt-4 grid gap-px overflow-hidden rounded-xl border border-ink-200/70 bg-ink-200/70 sm:grid-cols-2">
          {QUICK_LINKS.map((q) => (
            <li key={q.to}>
              <Link
                to={q.to}
                className="group flex items-center justify-between gap-4 bg-white px-5 py-4 transition-colors hover:bg-paper-50"
              >
                <div>
                  <p className="font-display text-[19px] tracking-tight text-ink-900">
                    {t(q.titleKey)}
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-500">
                    {t(q.subKey)}
                  </p>
                </div>
                <Icon
                  name="chevron-right"
                  className="h-4 w-4 shrink-0 text-ink-300 group-hover:text-ink-500"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
