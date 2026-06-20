import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { trpc } from "../lib/trpc";
import { useT } from "../lib/i18n";
import { ProfileDialog } from "./profile-dialog";
import { ChangePasswordDialog } from "./change-password-dialog";

/**
 * Bottom-of-sidebar account section: avatar + name/email, with a popover menu
 * (opening upward) for account details, change password, and sign out.
 *
 * Account edits + password changes go straight to Supabase Auth (see the two
 * dialogs); sign-out uses the AuthProvider. Lives inside the themed sidebar, so
 * it picks up the construction (ink) / landscaping (green) palette for free.
 */
export function UserMenu() {
  const t = useT();
  const navigate = useNavigate();
  const { session, signOut } = useAuth();
  const authorize = trpc.me.authorize.useQuery(undefined, { retry: false });
  const isPlatformAdmin = authorize.data?.isPlatformAdmin ?? false;
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

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-ink-800/60"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[12px] font-semibold uppercase text-white">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-white">
              {primary}
            </span>
            {name && email && (
              <span className="block truncate text-[11px] text-ink-400">
                {email}
              </span>
            )}
          </span>
          <Chevron open={open} />
        </button>

        {open && (
          <div className="absolute bottom-full left-0 right-0 z-40 mb-1.5 animate-rise overflow-hidden rounded-xl border border-ink-200/70 bg-white py-1.5 shadow-lift">
            {isPlatformAdmin && (
              <>
                <MenuItem
                  label="All workspaces"
                  onClick={() => {
                    setOpen(false);
                    navigate("/admin/access");
                  }}
                />
                <div className="my-1 border-t border-ink-100" />
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
            <div className="my-1 border-t border-ink-100" />
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
      className={`block w-full px-3 py-2 text-left text-sm hover:bg-paper-50 ${
        danger ? "text-rose-600" : "text-ink-700"
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
      className={`h-3 w-3 shrink-0 text-ink-500 transition-transform ${
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
