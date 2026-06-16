// Real step handlers — the start of making the engine actually *do* things (Phase 1). These
// spread over `mockHandlers`, so step types not yet implemented here keep mocking until built.
//
//   • http_call      → a real fetch (method/url/headers/body, with ${…} resolved), optionally
//                      authenticated by a stored Connection (credential injected as a header)
//   • ai_agent_task  → a real Claude call (the repo's @anthropic-ai/sdk pattern)
//
// Variable resolution (`${inputs.x}` / `${steps.id.output.y}`) is centralized in the engine's run
// loop — handlers receive an already-resolved `ctx.step` (config/inputs/instructions), so they just
// read the values.
//
// `makeRealHandlers(deps)` is a factory so the router can inject org-scoped capabilities (e.g.
// `resolveConnection`) without polluting the pure engine's RunContext with an orgId/db handle.
import Anthropic from "@anthropic-ai/sdk";
import {
  mockHandlers,
  type StepHandler,
  type StepType,
} from "./engine";

/** Default model for AI steps. Mirrors the chat/extraction routers' env convention. */
const AI_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

/** A step's resolved config (the engine already resolved `${…}` before dispatch). */
const cfgOf = (ctx: { step: { config?: Record<string, unknown> } }) => ctx.step.config ?? {};
const insOf = (ctx: { step: { inputs?: Record<string, unknown> } }) => ctx.step.inputs ?? {};

/** A stored connection resolved (decrypted) by the router for this run's org. */
export interface ResolvedConnection {
  provider: string;
  config: Record<string, unknown> | null;
  secret: Record<string, unknown>;
}

/** Org-scoped capabilities a real handler may need beyond the pure run scope. */
export interface HandlerDeps {
  /** Resolve a stored connection's decrypted secret. Returns null if it isn't in the org. */
  resolveConnection?: (connectionId: string) => Promise<ResolvedConnection | null>;
}

/**
 * Translate a stored connection into the HTTP auth header(s) it implies. Mirrors the provider
 * shapes authored in the Connections UI (apps/web/src/pages/connections.tsx):
 *   • bearer   secret.token                 → Authorization: Bearer <token>
 *   • basic    secret.{username,password}    → Authorization: Basic base64(user:pass)
 *   • api_key  secret.apiKey + config.{headerName=Authorization, prefix} → <headerName>: <prefix><apiKey>
 *   • header   secret.value + config.headerName=X-Api-Key                → <headerName>: <value>
 */
export function connectionAuthHeaders(conn: ResolvedConnection): Record<string, string> {
  const cfg = (conn.config ?? {}) as Record<string, unknown>;
  const s = conn.secret;
  const str = (v: unknown) => (v == null ? "" : String(v));
  switch (conn.provider) {
    case "bearer": {
      const token = str(s.token);
      return token ? { Authorization: `Bearer ${token}` } : {};
    }
    case "basic": {
      const user = str(s.username);
      const pass = str(s.password);
      if (!user && !pass) return {};
      return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` };
    }
    case "api_key": {
      const apiKey = str(s.apiKey);
      if (!apiKey) return {};
      const headerName = str(cfg.headerName) || "Authorization";
      const prefix = str(cfg.prefix);
      return { [headerName]: `${prefix}${apiKey}` };
    }
    case "header": {
      const value = str(s.value);
      if (!value) return {};
      const headerName = str(cfg.headerName) || "X-Api-Key";
      return { [headerName]: value };
    }
    default:
      return {};
  }
}

function makeHttpCall(deps: HandlerDeps): StepHandler {
  return async (ctx) => {
    const cfg = cfgOf(ctx);
    const ins = insOf(ctx);
    const url = String(cfg.url ?? ins.url ?? "");
    if (!url) throw new Error("http_call: no url configured");
    const method = String(cfg.method ?? "GET").toUpperCase();
    // Literal headers from config first; a referenced connection's auth header wins over them.
    const headers: Record<string, string> = { ...((cfg.headers as Record<string, string> | undefined) ?? {}) };

    const connectionId = cfg.connectionId ? String(cfg.connectionId) : "";
    if (connectionId) {
      if (!deps.resolveConnection) {
        throw new Error("http_call: connections are not available in this run context");
      }
      const conn = await deps.resolveConnection(connectionId);
      if (!conn) throw new Error(`http_call: connection "${connectionId}" not found`);
      Object.assign(headers, connectionAuthHeaders(conn));
    }

    const rawBody = cfg.body ?? ins.body;
    const hasBody = rawBody != null && method !== "GET" && method !== "HEAD";

    const res = await fetch(url, {
      method,
      headers: { ...(hasBody ? { "content-type": "application/json" } : {}), ...headers },
      body: hasBody ? (typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody)) : undefined,
    });
    const raw = await res.text();
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      /* keep raw text */
    }
    if (!res.ok) throw new Error(`http_call ${method} ${url} → ${res.status} ${res.statusText}`);
    return { status: res.status, ok: res.ok, data };
  };
}

const RESEND_URL = process.env.RESEND_API_URL ?? "https://api.resend.com/emails";

/**
 * notify → email. Sends through a Resend-compatible HTTP API. The API key comes from a referenced
 * Connection (its `apiKey`/`token` secret) — the same secrets layer http_call uses — or from
 * `RESEND_API_KEY`. The connection's `config.endpoint`/`config.from` can override the URL and the
 * sender (so a self-hosted relay or a different verified domain works). Non-email channels (sms,
 * slack, in-app) stay mocked until built.
 */
function makeNotify(deps: HandlerDeps): StepHandler {
  return async (ctx) => {
    const cfg = cfgOf(ctx);
    const str = (v: unknown) => (v == null ? "" : String(v));
    const channel = str(cfg.channel) || "email";
    if (channel !== "email") {
      return { sent: false, channel, note: `notify: the "${channel}" channel is not implemented yet` };
    }

    const to = cfg.to;
    if (to == null || str(to).trim() === "") throw new Error("notify(email): no recipient (set config.to)");
    const subject = str(cfg.subject ?? cfg.title) || "Notification from Beamy";
    const text = str(cfg.body ?? cfg.message);

    let apiKey = process.env.RESEND_API_KEY ?? "";
    let endpoint = RESEND_URL;
    let from = str(cfg.from) || process.env.RESEND_FROM || "Beamy <onboarding@resend.dev>";

    const connectionId = cfg.connectionId ? String(cfg.connectionId) : "";
    if (connectionId) {
      if (!deps.resolveConnection) throw new Error("notify(email): connections are not available in this run context");
      const conn = await deps.resolveConnection(connectionId);
      if (!conn) throw new Error(`notify(email): connection "${connectionId}" not found`);
      apiKey = str(conn.secret.apiKey ?? conn.secret.token) || apiKey;
      const cc = (conn.config ?? {}) as Record<string, unknown>;
      if (cc.endpoint) endpoint = str(cc.endpoint);
      if (cc.from && !str(cfg.from)) from = str(cc.from);
    }
    if (!apiKey) {
      throw new Error("notify(email): no email provider configured — reference a Connection holding the API key, or set RESEND_API_KEY");
    }

    const recipients = Array.isArray(to) ? to.map(str) : [str(to)];
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: recipients, subject, text }),
    });
    const raw = await res.text();
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      /* keep raw */
    }
    if (!res.ok) {
      throw new Error(`notify(email) → ${res.status} ${res.statusText}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    }
    const id = (data as { id?: unknown } | null)?.id;
    return { sent: true, channel: "email", to: recipients, subject, id: id != null ? String(id) : null, provider: "resend" };
  };
}

const aiAgentTask: StepHandler = async (ctx) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ai_agent_task: ANTHROPIC_API_KEY is not set on the server");
  const cfg = cfgOf(ctx);
  const ins = insOf(ctx);
  // The prompt may live in config.prompt, config.instructions, or the step-level `instructions`
  // field (where the step builder puts an AI task's guidance). All are already var-resolved.
  const stepInstructions = (ctx.step as { instructions?: string }).instructions;
  const prompt = String(cfg.prompt ?? cfg.instructions ?? stepInstructions ?? "");
  if (!prompt.trim()) throw new Error("ai_agent_task: no prompt configured (set config.prompt or the step's instructions)");

  // Hand the model the resolved upstream inputs as context.
  const content = Object.keys(ins).length
    ? `${prompt}\n\nInputs:\n${JSON.stringify(ins, null, 2)}`
    : prompt;

  const anthropic = new Anthropic({ apiKey });
  const resp = await anthropic.messages.create({
    model: String(cfg.model ?? AI_MODEL),
    max_tokens: Number(cfg.maxTokens ?? 1024),
    messages: [{ role: "user", content }],
  });
  const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  return { text, model: resp.model, stopReason: resp.stop_reason };
};

/**
 * Build the real handler set, with the still-mocked types (notify, db_operation, …) underneath.
 * Pass `deps` to enable org-scoped capabilities like connection resolution.
 */
export function makeRealHandlers(deps: HandlerDeps = {}): Partial<Record<StepType, StepHandler>> {
  return {
    ...mockHandlers,
    http_call: makeHttpCall(deps),
    ai_agent_task: aiAgentTask,
    notify: makeNotify(deps),
  };
}

/** Real handlers with no injected deps (connections unavailable). Convenience for callers
 *  that don't have an org context; prefer `makeRealHandlers({ resolveConnection })`. */
export const realHandlers = makeRealHandlers();
