import { router } from "./init";
import { meRouter } from "./routers/me";
import { activityRouter } from "./routers/activity";
import { assetsRouter } from "./routers/assets";
import { billsRouter } from "./routers/bills";
import { chatRouter } from "./routers/chat";
import { clientsRouter } from "./routers/clients";
import { documentsRouter } from "./routers/documents";
import { invoicesRouter } from "./routers/invoices";
import { materialsRouter } from "./routers/materials";
import { bidsRouter } from "./routers/bids";
import { membersRouter } from "./routers/members";
import { orgsRouter } from "./routers/orgs";
import { projectsRouter } from "./routers/projects";
import { servicesRouter } from "./routers/services";
import { specsRouter } from "./routers/specs";
import { vendorsRouter } from "./routers/vendors";
import { workItemsRouter } from "./routers/work-items";

export const appRouter = router({
  me: meRouter,
  activity: activityRouter,
  assets: assetsRouter,
  bids: bidsRouter,
  bills: billsRouter,
  chat: chatRouter,
  clients: clientsRouter,
  documents: documentsRouter,
  invoices: invoicesRouter,
  materials: materialsRouter,
  vendors: vendorsRouter,
  services: servicesRouter,
  members: membersRouter,
  orgs: orgsRouter,
  projects: projectsRouter,
  specs: specsRouter,
  workItems: workItemsRouter,
});

export type AppRouter = typeof appRouter;
