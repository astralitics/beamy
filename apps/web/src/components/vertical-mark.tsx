import type { ReactNode } from "react";

/** A plain, centred empty-state card: a bold title, an optional sub-line, and
 *  an optional action. Shared so every list page's empty state matches. */
export function EmptyState({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-6 py-12 text-center shadow-sm">
      <p className="font-display text-2xl font-bold tracking-tight text-text">{title}</p>
      {sub && (
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-text-muted">{sub}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
