import { drainJobs } from "./routers/workflows";
import { scanScheduledTriggers } from "./workflow/scheduler";

/**
 * Cron drain handler — the prod trigger for the durable runner. Vercel has no always-on worker
 * (serverless), so a Vercel Cron job hits `/api/cron/tick` on a schedule and this drains the
 * `workflow_jobs` queue across all orgs (advance ready jobs, retry failures, reclaim dead leases).
 *
 * Secured by CRON_SECRET: Vercel injects `Authorization: Bearer <CRON_SECRET>` on cron requests
 * when that env var is set. We enforce it whenever it's configured (set it in prod!); if it's
 * absent we still run so the queue drains in environments without the secret, but log a warning.
 *
 * Lives in the package (not the api/ function file) so it's covered by `pnpm typecheck` and so the
 * deps resolve from here — same arrangement as `handleTrpcRequest`.
 */
export async function handleCronTick(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
  } else {
    console.warn("[cron] CRON_SECRET is not set — the drain endpoint is unauthenticated");
  }

  try {
    // Fire due schedule triggers first, then drain so same-minute schedules execute this tick.
    // The scan is isolated so a scan failure can never starve the durable-runner drain.
    let scan: unknown;
    try {
      scan = await scanScheduledTriggers(new Date());
    } catch (e) {
      scan = { error: e instanceof Error ? e.message : String(e) };
      console.error("[cron] schedule scan failed:", scan);
    }
    const drain = await drainJobs({ limit: 25 });
    return new Response(JSON.stringify({ ok: true, scan, ...drain }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron] drain failed:", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
