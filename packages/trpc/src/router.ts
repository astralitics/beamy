import { router } from "./init";
import { meRouter } from "./routers/me";
import { clientsRouter } from "./routers/clients";

export const appRouter = router({
  me: meRouter,
  clients: clientsRouter,
});

export type AppRouter = typeof appRouter;
