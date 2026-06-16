// Inbound webhook handler — fires a workflow from an external HTTP POST. NOT a tRPC procedure: it
// must work with no user session. The unguessable URL token is the capability AND the org resolver
// (org comes only from the trigger row, never the request → no cross-tenant leak). Optional HMAC
// verifies the body. On success it enqueues a durable run (executed by the next cron tick), so the
// response is fast and the run is retryable. Bundled into api/hooks/_bundle.mjs; dev-routed by the
// Vite middleware so it's curl-verifiable behind the login wall.
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, workflowTriggers } from "@beamy/db";
import { decryptSecret } from "./lib/secrets";
import { enqueueRun, EnqueueRunError } from "./workflow/enqueue";

const MAX_BODY = 256 * 1024;
const DEFAULT_SIG_HEADER = "x-beamy-signature";
const STORED_HEADERS = ["content-type", "user-agent"];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
// Identical shape/body for miss / disabled / wrong-type, so probing can't distinguish.
const notFound = () => json(404, { error: "not found" });

export async function handleWebhook(req: Request): Promise<Response> {
  // Only POST fires a workflow; everything else gets the generic 404 (doesn't reveal token validity).
  if (req.method !== "POST") return notFound();
  const url = new URL(req.url, "http://localhost");
  const token = url.pathname.split("/")[3] || "";
  if (!token) return notFound();

  const db = getDb();
  const [trigger] = await db
    .select()
    .from(workflowTriggers)
    .where(and(eq(workflowTriggers.webhookToken, token), eq(workflowTriggers.type, "webhook"), eq(workflowTriggers.enabled, true)))
    .limit(1);
  if (!trigger) return notFound();

  // Fast-reject oversized bodies via Content-Length before buffering; re-check the actual bytes.
  const declaredLen = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY) return json(413, { error: "payload too large" });
  const rawText = await req.text();
  if (Buffer.byteLength(rawText) > MAX_BODY) return json(413, { error: "payload too large" });

  // Optional HMAC-SHA256 (hex) over the exact body bytes, verified before parsing. Compare by BYTE
  // length (not JS string length — a Latin-1 header can decode to a same-char/diff-byte string) and
  // fail closed on any error, so a crafted signature header can never surface as a 500.
  if (trigger.webhookSecretEnc) {
    try {
      const headerName = trigger.signatureHeader || DEFAULT_SIG_HEADER;
      const provided = Buffer.from(req.headers.get(headerName) ?? "", "utf8");
      const secret = String((decryptSecret(trigger.webhookSecretEnc) as { hmacSecret?: unknown }).hmacSecret ?? "");
      const expected = Buffer.from(crypto.createHmac("sha256", secret).update(rawText).digest("hex"), "utf8");
      const ok = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
      if (!ok) return json(401, { error: "invalid signature" });
    } catch {
      return json(401, { error: "invalid signature" });
    }
  }

  let parsed: unknown;
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = { raw: rawText }; // non-JSON (form/text) hooks still work
  }

  const headers: Record<string, string> = {};
  for (const h of STORED_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  const inputs = {
    body: parsed,
    query: Object.fromEntries(url.searchParams),
    headers,
    receivedAt: new Date().toISOString(),
  };

  try {
    const { runId } = await enqueueRun(
      trigger.orgId,
      { workflowId: trigger.workflowId },
      inputs,
      `webhook:${trigger.id}`,
      { requirePublished: true },
    );
    return json(202, { ok: true, runId });
  } catch (e) {
    if (e instanceof EnqueueRunError) return json(422, { error: "workflow not runnable" });
    return json(500, { error: "internal error" });
  }
}
