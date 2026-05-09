import { router } from "./init";
import { meRouter } from "./routers/me";

export const appRouter = router({
  me: meRouter,
});

export type AppRouter = typeof appRouter;
