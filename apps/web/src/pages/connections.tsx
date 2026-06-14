import { useState } from "react";
import { trpc } from "../lib/trpc";
import { PageHeader } from "../components/ui";
import { Badge, Button, Field, Select, TextInput, tok } from "./workflows/ui";

/**
 * Connections — stored credentials a workflow step can use to reach an external app (the
 * "Credentials" concept from n8n/Zapier). Secret values are encrypted server-side and never
 * returned here; once set they show as "Set" and can only be replaced, not read. The actual
 * outbound use by steps is still a placeholder.
 */

interface ProviderSpec {
  value: string;
  label: string;
  blurb: string;
  secretFields: { key: string; label: string; password?: boolean }[];
  configFields?: { key: string; label: string; placeholder?: string; default?: string }[];
}

const PROVIDERS: ProviderSpec[] = [
  {
    value: "api_key",
    label: "API key",
    blurb: "A key sent in a request header.",
    secretFields: [{ key: "apiKey", label: "API key", password: true }],
    configFields: [
      { key: "headerName", label: "Header name", default: "Authorization" },
      { key: "prefix", label: "Value prefix", placeholder: "e.g. Bearer " },
    ],
  },
  { value: "bearer", label: "Bearer token", blurb: "Sent as Authorization: Bearer <token>.", secretFields: [{ key: "token", label: "Token", password: true }] },
  { value: "basic", label: "Basic auth", blurb: "A username and password.", secretFields: [{ key: "username", label: "Username" }, { key: "password", label: "Password", password: true }] },
  { value: "header", label: "Custom header", blurb: "A value sent in a header you name.", secretFields: [{ key: "value", label: "Value", password: true }], configFields: [{ key: "headerName", label: "Header name", default: "X-Api-Key" }] },
];
const providerSpec = (v: string) => PROVIDERS.find((p) => p.value === v);
const providerLabel = (v: string) => providerSpec(v)?.label ?? v;

export function ConnectionsPage() {
  const utils = trpc.useUtils();
  const list = trpc.connections.list.useQuery();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ConnRow | null>(null);
  const del = trpc.connections.delete.useMutation({ onSuccess: () => void utils.connections.list.invalidate() });

  const refresh = () => void utils.connections.list.invalidate();
  const rows = (list.data ?? []) as ConnRow[];

  return (
    <>
      <PageHeader title="Connections" lede="Store a credential once, then let any step use it to reach your apps. Secrets are encrypted and never shown again." />
      <div style={{ display: "flex", justifyContent: "flex-end", margin: "16px 0" }}>
        <Button onClick={() => setCreating(true)}>+ New connection</Button>
      </div>

      {list.isLoading ? (
        <div style={{ color: tok.inkMuted, padding: 40, textAlign: "center" }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "56px 24px", border: `1px dashed ${tok.border}`, borderRadius: tok.radius, background: tok.surface }}>
          <div style={{ fontFamily: tok.fontDisplay, fontSize: 22, color: tok.ink, marginBottom: 6 }}>No connections yet</div>
          <div style={{ color: tok.inkMuted, fontSize: 14, marginBottom: 18 }}>Add the credentials your workflows need to reach outside apps.</div>
          <Button onClick={() => setCreating(true)}>+ Add your first connection</Button>
        </div>
      ) : (
        <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, overflow: "hidden", background: tok.surface }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: tok.surfaceAlt }}>
                {["Name", "Type", "Secret", ""].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 2 ? "center" : "left", padding: "10px 14px", color: tok.inkMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: `1px solid ${tok.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${tok.border}` }}>
                  <td style={{ padding: "11px 14px", fontWeight: 600, color: tok.ink, fontFamily: tok.fontDisplay, fontSize: 15 }}>{c.name}</td>
                  <td style={{ padding: "11px 14px" }}><Badge label={providerLabel(c.provider)} color="#185FA5" /></td>
                  <td style={{ padding: "11px 14px", textAlign: "center" }}>
                    {c.hasSecret ? <Badge label="Set" color="#059669" /> : <span style={{ color: tok.inkFaint }}>—</span>}
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <Button variant="outline" size="sm" onClick={() => setEditing(c)}>Edit</Button>{" "}
                    <Button variant="danger" size="sm" onClick={() => del.mutate({ id: c.id })} disabled={del.isPending}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <ConnectionModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refresh(); }} />}
      {editing && <ConnectionModal connection={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </>
  );
}

interface ConnRow { id: string; name: string; provider: string; config: Record<string, unknown> | null; hasSecret: boolean }

function ConnectionModal({ connection, onClose, onSaved }: { connection?: ConnRow; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!connection;
  const [name, setName] = useState(connection?.name ?? "");
  const [provider, setProvider] = useState(connection?.provider ?? "api_key");
  const spec = providerSpec(provider)!;
  const [secret, setSecret] = useState<Record<string, string>>({});
  const [replaceSecret, setReplaceSecret] = useState(!isEdit);
  const [config, setConfig] = useState<Record<string, string>>(() => initConfig(spec, connection?.config));

  const create = trpc.connections.create.useMutation({ onSuccess: onSaved });
  const update = trpc.connections.update.useMutation({ onSuccess: onSaved });
  const busy = create.isPending || update.isPending;
  const err = create.error?.message ?? update.error?.message;

  const onProvider = (v: string) => {
    setProvider(v);
    setSecret({});
    setConfig(initConfig(providerSpec(v)!, undefined));
  };

  const submit = () => {
    const cfg: Record<string, unknown> = {};
    for (const f of spec.configFields ?? []) if ((config[f.key] ?? "").trim()) cfg[f.key] = config[f.key];
    if (isEdit) {
      update.mutate({ id: connection!.id, name: name.trim(), config: cfg, ...(replaceSecret ? { secret } : {}) });
    } else {
      create.mutate({ name: name.trim(), provider: provider as "api_key" | "bearer" | "basic" | "header", secret, config: cfg });
    }
  };
  const canSave = !!name.trim() && (isEdit || spec.secretFields.every((f) => (secret[f.key] ?? "").trim()));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,25,23,.4)", display: "grid", placeItems: "center", zIndex: 50, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 100%)", maxHeight: "88vh", display: "flex", flexDirection: "column", background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.radius, boxShadow: "0 20px 50px rgba(0,0,0,.2)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${tok.border}` }}>
          <div style={{ fontFamily: tok.fontDisplay, fontSize: 20, color: tok.ink }}>{isEdit ? "Edit connection" : "New connection"}</div>
          <div style={{ fontSize: 12, color: tok.inkFaint, marginTop: 3 }}>{spec.blurb}</div>
        </div>
        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          <Field label="Name"><TextInput value={name} onChange={setName} placeholder="e.g. Acme API" /></Field>
          {!isEdit && (
            <Field label="Type">
              <Select value={provider} onChange={onProvider} options={PROVIDERS.map((p) => ({ value: p.value, label: p.label }))} />
            </Field>
          )}

          {(spec.configFields ?? []).map((f) => (
            <Field key={f.key} label={f.label}><TextInput value={config[f.key] ?? ""} onChange={(v) => setConfig((c) => ({ ...c, [f.key]: v }))} placeholder={f.placeholder} /></Field>
          ))}

          <div style={{ height: 1, background: tok.border, margin: "6px 0 14px" }} />

          {isEdit && (
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: tok.inkMuted, marginBottom: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={replaceSecret} onChange={(e) => setReplaceSecret(e.target.checked)} />
              {connection!.hasSecret ? "Replace the stored secret" : "Set a secret"}
            </label>
          )}
          {(!isEdit || replaceSecret) ? (
            spec.secretFields.map((f) => (
              <Field key={f.key} label={f.label}>
                <input type={f.password ? "password" : "text"} value={secret[f.key] ?? ""} onChange={(e) => setSecret((s) => ({ ...s, [f.key]: e.target.value }))} autoComplete="off"
                  style={{ width: "100%", padding: "8px 11px", borderRadius: tok.radiusSm, border: `1px solid ${tok.border}`, fontFamily: tok.font, fontSize: 13, color: tok.ink, boxSizing: "border-box" }} />
              </Field>
            ))
          ) : (
            <div style={{ fontSize: 12, color: tok.inkFaint }}>The stored secret is encrypted and stays unchanged.</div>
          )}

          {err && <div style={{ fontSize: 12, color: tok.danger, marginTop: 10 }}>{err}</div>}
        </div>
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${tok.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !canSave} onClick={submit}>{busy ? "Saving…" : "Save connection"}</Button>
        </div>
      </div>
    </div>
  );
}

function initConfig(spec: ProviderSpec, existing: Record<string, unknown> | null | undefined): Record<string, string> {
  const c = (existing ?? {}) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const f of spec.configFields ?? []) out[f.key] = c[f.key] ?? f.default ?? "";
  return out;
}
