import { router } from "./init";
import { meRouter } from "./routers/me";
import { activityRouter } from "./routers/activity";
import { assetsRouter } from "./routers/assets";
import { billsRouter } from "./routers/bills";
import { chatRouter } from "./routers/chat";
import { clientsRouter } from "./routers/clients";
import { connectionsRouter } from "./routers/connections";
import { documentsRouter } from "./routers/documents";
import { furnitureRouter } from "./routers/furniture";
import { invoicesRouter } from "./routers/invoices";
import { materialsRouter } from "./routers/materials";
import { bidsRouter } from "./routers/bids";
import { bidPackagesRouter } from "./routers/bid-packages";
import { changeOrdersRouter } from "./routers/change-orders";
import { extractionRouter } from "./routers/extraction";
import { membersRouter } from "./routers/members";
import { orgsRouter } from "./routers/orgs";
import { projectsRouter } from "./routers/projects";
import { proposalsRouter } from "./routers/proposals";
import { servicesRouter } from "./routers/services";
import { specsRouter } from "./routers/specs";
import { vendorsRouter } from "./routers/vendors";
import { workItemsRouter } from "./routers/work-items";
import { workflowsRouter } from "./routers/workflows";

export const appRouter = router({
  me: meRouter,
  activity: activityRouter,
  assets: assetsRouter,
  bids: bidsRouter,
  bidPackages: bidPackagesRouter,
  bills: billsRouter,
  changeOrders: changeOrdersRouter,
  chat: chatRouter,
  clients: clientsRouter,
  connections: connectionsRouter,
  documents: documentsRouter,
  extraction: extractionRouter,
  furniture: furnitureRouter,
  invoices: invoicesRouter,
  materials: materialsRouter,
  vendors: vendorsRouter,
  services: servicesRouter,
  members: membersRouter,
  orgs: orgsRouter,
  projects: projectsRouter,
  proposals: proposalsRouter,
  specs: specsRouter,
  workItems: workItemsRouter,
  workflows: workflowsRouter,
});

export type AppRouter = typeof appRouter;
