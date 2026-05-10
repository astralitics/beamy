import { defineConfig, loadEnv, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

/**
 * Default dev user — matches the row inserted by `pnpm db:seed`.
 * Real auth wiring (Supabase JWT → tRPC context) lands in a later M1 PR;
 * until then every tRPC call in dev runs as this user.
 */
const DEFAULT_DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

export default defineConfig(({ mode }) => {
  // Load .env from the monorepo root (where it lives) and propagate the
  // values our server-side middleware reads to process.env.
  const env = loadEnv(mode, REPO_ROOT, "");
  for (const key of ["DATABASE_URL", "BEAMY_DEV_USER_ID"]) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }
  const devUserId = process.env.BEAMY_DEV_USER_ID || DEFAULT_DEV_USER_ID;

  return {
    envDir: REPO_ROOT,
    plugins: [react(), trpcDevServerPlugin(devUserId)],
    server: { port: 5173 },
  };
});

/**
 * Mount the tRPC fetch handler as Vite middleware at /api/trpc so the SPA
 * can call tRPC procedures during dev with no separate API server.
 *
 * Routes module loading through `server.ssrLoadModule` rather than Node's
 * raw `import()`. Vite's transform pipeline handles workspace .ts sources
 * (TS Bundler-mode resolution); Node's ESM loader does not. `apply: "serve"`
 * scopes the plugin to dev only — `vite build` never runs configureServer.
 */
function trpcDevServerPlugin(devUserId: string) {
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

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/trpc")) return next();
        try {
          const fetchReq = await nodeReqToFetch(req);
          const fetchRes = await fetchRequestHandler({
            endpoint: "/api/trpc",
            req: fetchReq,
            router: appRouter,
            createContext: () => buildContext({ userId: devUserId }),
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
