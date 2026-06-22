import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { trpc } from "../lib/trpc";
import { useT } from "../lib/i18n";
import { getActiveOrg, setActiveOrg } from "../lib/active-org";
import { ProfileDialog } from "./profile-dialog";
import { ChangePasswordDialog } from "./change-password-dialog";

/**
 * Bottom-of-sidebar account section: avatar + name/email, with a popover menu
 * (opening upward) for workspace context, account, and sign out.
 *
 * Workspace switching lives HERE, in the corner — it's rarely used, and most
 * firms have exactly one workspace. So the current workspace shows as a quiet
 * label, and the actual switcher only appears when the user belongs to more
 * than one. No prominent top-of-sidebar dropdown.
 */
type OrgSummary = {
  orgId: string;
  name: string;
  slug: string;
  vertical: string;
  role: string;
};

export function UserMenu() {
  const t = useT();
  const navigate = useNavigate();
  const { session, signOut } = useAuth();
  const authorize = trpc.me.authorize.useQuery(undefined, { retry: false });
  const isPlatformAdmin = authorize.data?.isPlatformAdmin ?? false;
  const orgsQ = trpc.me.listOrgs.useQuery(undefined, { retry: false });
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const user = session?.user;
  if (!user) return null;

  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;
  const email = user.email ?? null;
  const primary = name ?? email ?? "Account";
  const initials = initialsFrom(name ?? email ?? "?");

  const orgs: OrgSummary[] = orgsQ.data ?? [];
  const activeId = getActiveOrg();
  const current = orgs.find((o) => o.orgId === activeId) ?? orgs[0] ?? null;
  const others = orgs.filter((o) => o.orgId !== current?.orgId);

  function choose(orgId: string) {
    if (orgId !== current?.orgId) {
      setActiveOrg(orgId);
      window.location.reload();
    } else {
      setOpen(false);
    }
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-bg-subtle"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[12px] font-semibold uppercase text-accent">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-text">
              {primary}
            </span>
            {name && email && (
              <span className="block truncate text-[11px] text-text-muted">
                {email}
              </span>
            )}
          </span>
          <Chevron open={open} />
        </button>

        {open && (
          <div className="absolute bottom-full left-0 right-0 z-40 mb-1.5 max-h-[70vh] animate-rise overflow-y-auto rounded-xl border border-border bg-surface-2 py-1.5 shadow-lift">
            {current && (
              <>
                <p className="section-label px-3 pb-1 pt-1.5">
                  {t("workspace.label")}
                </p>
                <WorkspaceRow org={current} active />
                {/* The switcher only exists when there's more than one. */}
                {others.map((o) => (
                  <WorkspaceRow
                    key={o.orgId}
                    org={o}
                    onClick={() => choose(o.orgId)}
                  />
                ))}
                <div className="my-1 border-t border-border-subtle" />
              </>
            )}

            {isPlatformAdmin && (
              <>
                <MenuItem
                  label="All workspaces"
                  onClick={() => {
                    setOpen(false);
                    navigate("/admin/access");
                  }}
                />
                <div className="my-1 border-t border-border-subtle" />
              </>
            )}
            <MenuItem
              label={t("account.details")}
              onClick={() => {
                setOpen(false);
                setProfileOpen(true);
              }}
            />
            <MenuItem
              label={t("account.change_password")}
              onClick={() => {
                setOpen(false);
                setPasswordOpen(true);
              }}
            />
            <div className="my-1 border-t border-border-subtle" />
            <MenuItem
              label={t("account.sign_out")}
              danger
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
            />
          </div>
        )}
      </div>

      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}
      {passwordOpen && (
        <ChangePasswordDialog onClose={() => setPasswordOpen(false)} />
      )}
    </>
  );
}

function WorkspaceRow({
  org,
  active,
  onClick,
}: {
  org: OrgSummary;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left ${
        active ? "cursor-default" : "hover:bg-bg-subtle"
      }`}
    >
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-text/10 text-[11px] font-semibold uppercase text-text"
      >
        {initialsFrom(org.name)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">
        {org.name}
      </span>
      <VerticalChip vertical={org.vertical} />
      {active && (
        <span aria-hidden className="ml-1 h-1.5 w-1.5 rounded-full bg-accent" />
      )}
    </button>
  );
}

function VerticalChip({ vertical }: { vertical: string }) {
  const isLandscaping = vertical === "landscaping";
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        isLandscaping
          ? "bg-success-subtle text-success"
          : "bg-info-subtle text-info"
      }`}
    >
      {isLandscaping ? "Landscaping" : "Construction"}
    </span>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-3 py-2 text-left text-sm hover:bg-bg-subtle ${
        danger ? "text-danger" : "text-text"
      }`}
    >
      {label}
    </button>
  );
}

function initialsFrom(s: string): string {
  const parts = s.trim().split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={`h-3 w-3 shrink-0 text-text-faint transition-transform ${
        open ? "rotate-180" : ""
      }`}
    >
      <path
        d="M3.5 6L8 10.5 12.5 6"
        stroke="currentColor"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
