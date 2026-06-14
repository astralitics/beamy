// TriggerConfigPanel — configure how a workflow fires itself (webhook + schedule). Rendered in the
// Build tab's right panel when the trigger node is clicked. Page-level (uses tRPC directly, like the
// Connections/Steps pages) over the API-complete `workflows.triggers` sub-router. The visual front
// end for triggers; the backend (enqueue/scan/webhook) is verified separately.
import { useState, type ReactNode } from "react";
import { nextDueAfter, scheduleConfigSchema, type ScheduleConfig } from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { Badge, Button, Field, Select, TextInput, tok } from "./ui";

const BROWSER_TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
})();
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TriggerConfigPanel({ workflowId, onClose }: { workflowId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const triggersQ = trpc.workflows.triggers.get.useQuery({ workflowId });
  const triggers = triggersQ.data ?? [];
  const webhook = triggers.find((t) => t.type === "webhook");
  const schedule = triggers.find((t) => t.type === "schedule");
  const refresh = () => void utils.workflows.triggers.get.invalidate({ workflowId });

  return (
    <div style={{ padding: 16, overflow: "auto", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontFamily: tok.fontDisplay, fontSize: 16, color: tok.ink }}>Triggers</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: tok.inkMuted, cursor: "pointer", fontSize: 15 }}>✕</button>
      </div>
      <p style={{ fontSize: 12, color: tok.inkFaint, marginTop: 0, marginBottom: 16 }}>
        How this workflow starts on its own. Triggers fire the <strong>published</strong> version.
      </p>
      {triggersQ.isLoading ? (
        <div style={{ color: tok.inkMuted, fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          <WebhookSection workflowId={workflowId} webhook={webhook} onChange={refresh} />
          <div style={{ height: 1, background: tok.border, margin: "18px 0" }} />
          <ScheduleSection workflowId={workflowId} schedule={schedule} onChange={refresh} />
        </>
      )}
    </div>
  );
}

type TriggerRow = { id: string; type: string; enabled: boolean; config?: unknown; webhookToken: string | null; webhookPath: string | null; hasSecret: boolean; nextDueAt: string | null };

function SectionTitle({ children, on }: { children: ReactNode; on?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ fontFamily: tok.fontDisplay, fontSize: 14, color: tok.ink }}>{children}</span>
      {on !== undefined && <Badge label={on ? "On" : "Off"} color={on ? "#16A34A" : "#A8A29E"} />}
    </div>
  );
}

function WebhookSection({ workflowId, webhook, onChange }: { workflowId: string; webhook?: TriggerRow; onChange: () => void }) {
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const upsert = trpc.workflows.triggers.upsertWebhook.useMutation({ onSuccess: onChange });
  const rotate = trpc.workflows.triggers.rotateWebhookToken.useMutation({ onSuccess: onChange });
  const setEnabled = trpc.workflows.triggers.setEnabled.useMutation({ onSuccess: onChange });
  const del = trpc.workflows.triggers.delete.useMutation({ onSuccess: onChange });
  const busy = upsert.isPending || rotate.isPending || setEnabled.isPending || del.isPending;
  const err = upsert.error ?? rotate.error ?? setEnabled.error ?? del.error;

  const url = webhook?.webhookPath ? `${window.location.origin}${webhook.webhookPath}` : "";
  const copy = () => { if (url) { void navigator.clipboard?.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } };

  if (!webhook) {
    return (
      <div>
        <SectionTitle>Webhook</SectionTitle>
        <p style={{ fontSize: 12, color: tok.inkFaint, margin: "0 0 10px" }}>Give the workflow a URL that external apps can POST to.</p>
        <Button size="sm" disabled={busy} onClick={() => upsert.mutate({ workflowId, enabled: true })}>Create webhook URL</Button>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle on={webhook.enabled}>Webhook</SectionTitle>
      <Field label="URL (POST here to run)">
        <div style={{ display: "flex", gap: 6 }}>
          <TextInput value={url} onChange={() => {}} />
          <Button variant="outline" size="sm" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
        </div>
      </Field>
      <div style={{ fontSize: 11, color: tok.inkFaint, marginTop: -6, marginBottom: 12, fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
        curl -X POST {url || "<url>"} -H 'content-type: application/json' -d '{"{"}…{"}"}'
      </div>
      <Field label="Signature (optional HMAC-SHA256)">
        {webhook.hasSecret && !showSecret ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Badge label="Secret set" color="#059669" />
            <Button variant="ghost" size="sm" onClick={() => setShowSecret(true)}>Replace</Button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="signing secret" autoComplete="off"
              style={{ flex: 1, padding: "8px 11px", borderRadius: tok.radiusSm, border: `1px solid ${tok.border}`, fontFamily: tok.font, fontSize: 13, color: tok.ink, boxSizing: "border-box" }} />
            <Button variant="outline" size="sm" disabled={busy || !secret.trim()} onClick={() => { upsert.mutate({ workflowId, enabled: webhook.enabled, hmacSecret: secret.trim() }); setSecret(""); setShowSecret(false); }}>Save</Button>
          </div>
        )}
      </Field>
      {err && <div style={{ fontSize: 12, color: tok.danger, marginTop: 10 }}>{err.message}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setEnabled.mutate({ workflowId, type: "webhook", enabled: !webhook.enabled })}>{webhook.enabled ? "Disable" : "Enable"}</Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => { if (window.confirm("Rotate the URL? Existing integrations will stop working until updated.")) rotate.mutate({ workflowId }); }}>Rotate URL</Button>
        <Button variant="danger" size="sm" disabled={busy} onClick={() => del.mutate({ workflowId, type: "webhook" })}>Remove</Button>
      </div>
    </div>
  );
}

function ScheduleSection({ workflowId, schedule, onChange }: { workflowId: string; schedule?: TriggerRow; onChange: () => void }) {
  const parsed = schedule?.config ? scheduleConfigSchema.safeParse(schedule.config) : null;
  const initial: ScheduleConfig = parsed?.success ? parsed.data : { kind: "every", minutes: 60 };
  const [cfg, setCfg] = useState<ScheduleConfig>(initial);
  const upsert = trpc.workflows.triggers.upsertSchedule.useMutation({ onSuccess: onChange });
  const setEnabled = trpc.workflows.triggers.setEnabled.useMutation({ onSuccess: onChange });
  const del = trpc.workflows.triggers.delete.useMutation({ onSuccess: onChange });
  const busy = upsert.isPending || setEnabled.isPending || del.isPending;
  const err = upsert.error ?? setEnabled.error ?? del.error;
  const cfgValid = scheduleConfigSchema.safeParse(cfg).success;

  // Live "next run" preview from the same shared cursor logic the server uses — only for a config
  // the server would actually accept (so we never show a bogus time for an invalid in-progress one).
  let nextRun = "";
  if (cfgValid) {
    try { nextRun = nextDueAfter(cfg, new Date()).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { /* noop */ }
  }
  const MIN_OPTS = [5, 15, 30, 60, 180, 360, 720, 1440];

  const setKind = (kind: ScheduleConfig["kind"]) => {
    if (kind === "every") setCfg({ kind: "every", minutes: 60 });
    else if (kind === "daily") setCfg({ kind: "daily", time: "09:00", tz: BROWSER_TZ });
    else setCfg({ kind: "weekly", days: [1], time: "09:00", tz: BROWSER_TZ });
  };

  return (
    <div>
      <SectionTitle on={schedule?.enabled}>Schedule</SectionTitle>
      <Field label="Frequency">
        <Select value={cfg.kind} onChange={(v) => setKind(v as ScheduleConfig["kind"])} options={[
          { value: "every", label: "Every N minutes" },
          { value: "daily", label: "Daily at…" },
          { value: "weekly", label: "Weekly on…" },
        ]} />
      </Field>
      {cfg.kind === "every" && (
        <Field label="Minutes">
          <Select value={String(cfg.minutes)} onChange={(v) => setCfg({ kind: "every", minutes: Number(v) })}
            options={(MIN_OPTS.includes(cfg.minutes) ? MIN_OPTS : [cfg.minutes, ...MIN_OPTS].sort((a, b) => a - b)).map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : `${m / 60} hr` }))} />
        </Field>
      )}
      {(cfg.kind === "daily" || cfg.kind === "weekly") && (
        <Field label="Time (24h)">
          <TextInput value={cfg.time} onChange={(v) => setCfg({ ...cfg, time: v })} placeholder="09:00" />
        </Field>
      )}
      {cfg.kind === "weekly" && (
        <Field label="Days">
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {DOW.map((d, i) => {
              const on = cfg.days.includes(i);
              return (
                <button key={d} onClick={() => { const days = on ? cfg.days.filter((x) => x !== i) : [...cfg.days, i].sort((a, b) => a - b); if (days.length) setCfg({ ...cfg, days }); }}
                  style={{ padding: "4px 9px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: tok.font, border: `1px solid ${on ? tok.accent : tok.border}`, background: on ? `${tok.accent}14` : tok.surface, color: on ? tok.accent : tok.inkMuted }}>{d}</button>
              );
            })}
          </div>
        </Field>
      )}
      {(cfg.kind === "daily" || cfg.kind === "weekly") && (
        <div style={{ fontSize: 11, color: tok.inkFaint, marginBottom: 10 }}>Timezone: {cfg.tz}</div>
      )}
      {nextRun && <div style={{ fontSize: 12, color: tok.inkMuted, marginBottom: 12 }}>Next run: <strong>{nextRun}</strong></div>}
      {err && <div style={{ fontSize: 12, color: tok.danger, marginBottom: 10 }}>{err.message}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button size="sm" disabled={busy || !cfgValid} onClick={() => upsert.mutate({ workflowId, config: cfg, enabled: true })}>{schedule ? "Save schedule" : "Add schedule"}</Button>
        {schedule && <Button variant="outline" size="sm" disabled={busy} onClick={() => setEnabled.mutate({ workflowId, type: "schedule", enabled: !schedule.enabled })}>{schedule.enabled ? "Disable" : "Enable"}</Button>}
        {schedule && <Button variant="danger" size="sm" disabled={busy} onClick={() => del.mutate({ workflowId, type: "schedule" })}>Remove</Button>}
      </div>
    </div>
  );
}
