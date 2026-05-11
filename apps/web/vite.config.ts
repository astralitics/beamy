import { defineConfig, loadEnv, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

/**
 * Default dev user — matches the row inserted by `pnpm db:seed`. Used as
 * a fallback when no Authorization header is present (so the dev-from-zero
 * workflow keeps working before Supabase auth is configured / a user has
 * actually signed in). Real Supabase auth, when present, supersedes it.
 */
const DEFAULT_DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, REPO_ROOT, "");
  for (const key of [
    "DATABASE_URL",
    "BEAMY_DEV_USER_ID",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }
  const devUserId = process.env.BEAMY_DEV_USER_ID || DEFAULT_DEV_USER_ID;
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const authEnabled = Boolean(supabaseUrl && supabaseServiceKey);

  return {
    envDir: REPO_ROOT,
    plugins: [
      react(),
      trpcDevServerPlugin({
        devUserId,
        supabaseUrl,
        supabaseServiceKey,
        authEnabled,
      }),
    ],
    server: { port: 5173 },
  };
});

/**
 * Mount the tRPC fetch handler as Vite middleware at /api/trpc so the SPA
 * can call tRPC procedures during dev with no separate API server.
 *
 * Auth resolution per request:
 *   1. Authorization: Bearer <jwt>  →  verify with Supabase admin, use user.id
 *   2. No header                    →  fall back to dev user (devUserId)
 *
 * The fallback exists so the dev-from-zero workflow keeps working even
 * before .env has Supabase keys / before a user has signed in. Once
 * everything's wired and we have real users, we'll harden by dropping
 * the fallback in production builds (apply: "serve" already scopes the
 * fallback to dev).
 */
function trpcDevServerPlugin(opts: {
  devUserId: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  authEnabled: boolean;
}) {
  return {
    name: "beamy-trpc-dev",
    apply: "serve" as const,
    async configureServer(server: ViteDevServer) {
      const trpcModule = await server.ssrLoadModule("@beamy/trpc");
      const adapterModule = await server.ssrLoadModule(
        "@trpc/server/adapters/fetch",
      );
      const appRouter = trpcModule.appRouter;
      const buildContext = trpcModule.buildContext;
      const fetchRequestHandler = adapterModule.fetchRequestHandler;

      // Supabase admin client for verifying user JWTs. Created lazily so
      // dev-from-zero (no .env keys) doesn't fail to boot.
      let supabaseAdmin: { auth: { getUser: (t: string) => Promise<{ data: { user: { id: string } | null } }> } } | null = null;
      if (opts.authEnabled) {
        const supabaseModule = await server.ssrLoadModule(
          "@supabase/supabase-js",
        );
        supabaseAdmin = supabaseModule.createClient(
          opts.supabaseUrl,
          opts.supabaseServiceKey,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/trpc")) return next();
        try {
          const fetchReq = await nodeReqToFetch(req);
          const userId = await resolveUserId(
            fetchReq,
            supabaseAdmin,
            opts.devUserId,
          );
          const fetchRes = await fetchRequestHandler({
            endpoint: "/api/trpc",
            req: fetchReq,
            router: appRouter,
            createContext: () => buildContext({ userId }),
          });
          await pipeFetchToNode(fetchRes, res);
        } catch (err) {
          console.error("[trpc] handler error:", err);
          res.statusCode = 500;
          res.end("internal error");
        }
      });
    },
  };
}

async function resolveUserId(
  req: Request,
  supabaseAdmin: { auth: { getUser: (t: string) => Promise<{ data: { user: { id: string } | null } }> } } | null,
  devUserId: string,
): Promise<string> {
  const header = req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return devUserId;
  }
  if (!supabaseAdmin) {
    // Header sent but server can't verify (no SUPABASE_SERVICE_ROLE_KEY).
    // Fall back to dev user — surfaces in logs.
    console.warn(
      "[trpc] Authorization header present but Supabase admin not configured; falling back to dev user",
    );
    return devUserId;
  }
  const token = header.slice(7).trim();
  try {
    const { data } = await supabaseAdmin.auth.getUser(token);
    if (!data.user) {
      console.warn("[trpc] Supabase rejected token; falling back to dev user");
      return devUserId;
    }
    return data.user.id;
  } catch (err) {
    console.warn("[trpc] token verification threw:", err);
    return devUserId;
  }
}

async function nodeReqToFetch(req: IncomingMessage): Promise<Request> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const method = (req.method ?? "GET").toUpperCase();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((vv) => headers.append(k, vv));
    else if (v != null) headers.set(k, v);
  }
  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req as unknown as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return new Request(url, { method, headers, body: Buffer.concat(chunks) });
}

async function pipeFetchToNode(
  fetchRes: Response,
  res: ServerResponse,
): Promise<void> {
  res.statusCode = fetchRes.status;
  fetchRes.headers.forEach((v, k) => res.setHeader(k, v));
  const body = await fetchRes.arrayBuffer();
  res.end(Buffer.from(body));
}
