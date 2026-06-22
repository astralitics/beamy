import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Vertical } from "@beamy/shared";
import { trpc } from "../trpc";

/**
 * VerticalContext — exposes the active workspace's product vertical
 * ("construction" | "landscaping"), resolved from the org's `vertical` column
 * via `me.whoami`. Drives vertical-aware terminology (see `useT` in
 * lib/i18n/locale-context) and which enum values dropdowns offer (see the
 * *_BY_VERTICAL maps in @beamy/shared).
 *
 * Defaults to "construction" — the original Beamy domain — until the org
 * resolves, and for any tree rendered outside the provider.
 */
const VerticalContext = createContext<Vertical>("construction");

export function VerticalProvider({ children }: { children: ReactNode }) {
  // Source from `me.authorize` — the same query OrgGate runs at boot, so its
  // result (including org.vertical) is already in the React Query cache and the
  // vertical resolves as soon as the user is authorized.
  const me = trpc.me.authorize.useQuery(undefined, { retry: false });
  const vertical = (me.data?.org as { vertical?: Vertical } | null | undefined)
    ?.vertical;
  const resolved: Vertical =
    vertical === "landscaping" || vertical === "construction"
      ? vertical
      : "construction";

  // Mirror the vertical onto <html> so the HORIZON accent + band re-tint
  // (`:root[data-vertical="landscaping"]` in index.css) applies app-wide —
  // not just inside the sidebar. The whisper lives in the light, everywhere.
  useEffect(() => {
    document.documentElement.dataset.vertical = resolved;
    return () => {
      delete document.documentElement.dataset.vertical;
    };
  }, [resolved]);

  return (
    <VerticalContext.Provider value={resolved}>
      {children}
    </VerticalContext.Provider>
  );
}

export function useVertical(): Vertical {
  return useContext(VerticalContext);
}
