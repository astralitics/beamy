import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@beamy/trpc";
import { getAccessToken } from "./auth";

/**
 * Typed tRPC React client. Use via the namespace pattern:
 *
 *   const ping = trpc.me.ping.useQuery();
 *   const create = trpc.clients.create.useMutation();
 *
 * Each request sends a Bearer token from the current Supabase session
 * (if any) in the Authorization header. The vite-middleware handler
 * decodes it into a `userId` and passes that to `buildContext`. When no
 * session is active, the handler falls back to the dev user.
 */
export const trpc = createTRPCReact<AppRouter>();

export function makeTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: "/api/trpc",
        async headers() {
          const token = await getAccessToken();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
