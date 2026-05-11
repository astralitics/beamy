import { router } from "./init";
import { meRouter } from "./routers/me";
import { clientsRouter } from "./routers/clients";
import { membersRouter } from "./routers/members";
import { orgsRouter } from "./routers/orgs";
import { servicesRouter } from "./routers/services";
import { vendorsRouter } from "./routers/vendors";

export const appRouter = router({
  me: meRouter,
  clients: clientsRouter,
  vendors: vendorsRouter,
  services: servicesRouter,
  members: membersRouter,
  orgs: orgsRouter,
});

export type AppRouter = typeof appRouter;
