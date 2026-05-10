import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@beamy/trpc";

/**
 * Typed tRPC React client. Use via the namespace pattern:
 *
 *   const ping = trpc.me.ping.useQuery();
 *   const create = trpc.clients.create.useMutation();
 */
export const trpc = createTRPCReact<AppRouter>();

export function makeTrpcClient() {
  return trpc.createClient({
    links: [httpBatchLink({ url: "/api/trpc" })],
  });
}
