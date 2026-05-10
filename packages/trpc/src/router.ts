import { router } from "./init";
import { meRouter } from "./routers/me";
import { clientsRouter } from "./routers/clients";
import { servicesRouter } from "./routers/services";

export const appRouter = router({
  me: meRouter,
  clients: clientsRouter,
  services: servicesRouter,
});

export type AppRouter = typeof appRouter;
