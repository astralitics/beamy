import { router } from "./init";
import { meRouter } from "./routers/me";
import { assetsRouter } from "./routers/assets";
import { clientsRouter } from "./routers/clients";
import { materialsRouter } from "./routers/materials";
import { membersRouter } from "./routers/members";
import { orgsRouter } from "./routers/orgs";
import { projectsRouter } from "./routers/projects";
import { servicesRouter } from "./routers/services";
import { vendorsRouter } from "./routers/vendors";

export const appRouter = router({
  me: meRouter,
  assets: assetsRouter,
  clients: clientsRouter,
  materials: materialsRouter,
  vendors: vendorsRouter,
  services: servicesRouter,
  members: membersRouter,
  orgs: orgsRouter,
  projects: projectsRouter,
});

export type AppRouter = typeof appRouter;
