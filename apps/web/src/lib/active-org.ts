/**
 * Active-org selection (which workspace the user is currently operating in).
 *
 * Persisted in localStorage and sent on every tRPC request as the `x-active-org`
 * header (see lib/trpc.ts). The server validates it against the user's real
 * memberships and falls back to their default org if it doesn't match — so this
 * is a *preference*, never a grant. Used by the workspace switcher.
 */
const STORAGE_KEY = "beamy.activeOrg";

export function getActiveOrg(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setActiveOrg(orgId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, orgId);
}

export function clearActiveOrg(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
