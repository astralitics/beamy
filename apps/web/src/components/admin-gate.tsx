import { Navigate } from "react-router-dom";
import { trpc } from "../lib/trpc";

/**
 * Gate for the platform-admin console (`/admin/*`). Lives OUTSIDE `OrgGate`
 * because a platform admin needs the console even with no workspace membership
 * (and the console is cross-tenant — it has no "active org"). Renders only when
 * `me.authorize` reports `isPlatformAdmin`; everyone else is sent home.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = trpc.me.authorize.useQuery(undefined, {
    retry: false,
  });

  if (isError) return <Navigate to="/login" replace />;
  if (isLoading || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      </div>
    );
  }
  if (!data.isPlatformAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
