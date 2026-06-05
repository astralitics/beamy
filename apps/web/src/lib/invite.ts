/**
 * Pending-invite stash.
 *
 * Carries an invite token across the OAuth round-trip. Google sign-in
 * navigates the browser away from the app and back, and the provider doesn't
 * preserve our app state through the redirect — so we park the token in
 * localStorage and redeem it once we land back signed in. Mirrors petfactory's
 * `petfactory.pendingInvite` handoff.
 */
const PENDING_INVITE_KEY = "beamy.pendingInvite";

export function stashPendingInvite(token: string): void {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, token);
  } catch {
    // Private mode / storage disabled — non-fatal. A same-tab redeem still
    // works off the URL token; only the cross-redirect handoff is lost.
  }
}

export function readPendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // ignore
  }
}
