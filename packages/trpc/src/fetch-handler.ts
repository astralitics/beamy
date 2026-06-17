import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createClient } from "@supabase/supabase-js";
import { appRouter } from "./router";
import { buildContext } from "./context";

/**
 * Production tRPC fetch handler.
 *
 * The dev path is the Vite middleware in apps/web/vite.config.ts; this is its
 * serverless twin, consumed by the Vercel function at api/trpc/[trpc].ts. Same
 * fetch adapter, same Bearer-JWT → userId resolution — but **no dev-user
 * fallback**: an unauthenticated request gets an anonymous context, and
 * `protectedProcedure` correctly 401s.
 *
 * Lives here (not in the function file) so it's covered by `pnpm typecheck`
 * and so @trpc/server + @supabase/supabase-js resolve from this package.
 */
const supabaseUrl = process.env.SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const admin =
  supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

async function resolveUser(
  req: Request,
): Promise<{ userId: string | null; userEmail: string | null }> {
  const header = req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ") || !admin) {
    return { userId: null, userEmail: null };
  }
  const token = header.slice(7).trim();
  try {
    const { data } = await admin.auth.getUser(token);
    return { userId: data.user?.id ?? null, userEmail: data.user?.email ?? null };
  } catch {
    return { userId: null, userEmail: null };
  }
}

export async function handleTrpcRequest(req: Request): Promise<Response> {
  const { userId, userEmail } = await resolveUser(req);
  const activeOrgId = req.headers.get("x-active-org") || null;
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => buildContext({ userId, activeOrgId, userEmail }),
  });
}
