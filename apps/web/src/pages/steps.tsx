import { useState, type ReactNode } from "react";
import { trpc } from "../lib/trpc";
import { PageHeader } from "../components/ui";
import {
  Badge,
  Button,
  ConfigFields,
  Field,
  InputsDeclEditor,
  OutputsEditor,
  STEP_CREATE_GROUPS,
  Select,
  TextInput,
  stepTypeMeta,
  stepTypeSpec,
  tok,
  type StepTypeSpec,
  type WfStepInput,
  type WfStepOutput,
} from "./workflows/ui";
import { STEP_TYPE_META } from "./workflows/ui";

const STEP_TYPE_OPTIONS = Object.entries(STEP_TYPE_META).map(([value, m]) => ({ value, label: `${m.label} · ${m.category}` }));

function parseValue(v: string): unknown {
  const t = v.trim();
  if (t === "") return "";
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

// ─────────────────────────── catalog ───────────────────────────

export function StepCatalog({ onOpen }: { onOpen: (id: string) => void }) {
  const utils = trpc.useUtils();
  const list = trpc.workflows.stepTemplates.list.useQuery();
  const [creating, setCreating] = useState(false);
  const create = trpc.workflows.stepTemplates.create.useMutation({
    onSuccess: (r) => {
      void utils.workflows.stepTemplates.list.invalidate();
      setCreating(false);
      onOpen(r.id);
    },
  });

  const rows = list.data ?? [];
  return (
    <>
      <PageHeader title="Steps" lede="Reusable building blocks — design once, test against success criteria, drop into any workflow." />
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", margin: "16px 0" }}>
        <Button onClick={() => setCreating(true)}>+ New step</Button>
      </div>

      {list.isLoading ? (
        <div style={{ color: tok.inkMuted, padding: 40, textAlign: "center" }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "56px 24px", border: `1px dashed ${tok.border}`, borderRadius: tok.radius, background: tok.surface }}>
          <div style={{ fontFamily: tok.fontDisplay, fontSize: 22, color: tok.ink, marginBottom: 6 }}>No steps yet</div>
          <div style={{ color: tok.inkMuted, fontSize: 14, marginBottom: 18 }}>Build a library of tested steps your workflows can reuse.</div>
          <Button onClick={() => setCreating(true)}>+ Create your first step</Button>
        </div>
      ) : (
        <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, overflow: "hidden", background: tok.surface }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: tok.surfaceAlt }}>
                {["Step", "Type", "Inputs", "Outputs", "Status"].map((h, i) => (
                  <th key={h} style={{ textAlign: i > 1 && i < 4 ? "center" : "left", padding: "10px 14px", color: tok.inkMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: `1px solid ${tok.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const meta = stepTypeMeta(s.stepType);
                const inputs = (s.inputs as unknown[]) ?? [];
                const outputs = (s.outputs as unknown[]) ?? [];
                return (
                  <tr
                    key={s.id}
                    onClick={() => onOpen(s.id)}
                    style={{ cursor: "pointer", borderBottom: `1px solid ${tok.border}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = tok.surfaceAlt)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ fontWeight: 600, color: tok.ink, fontFamily: tok.fontDisplay, fontSize: 15 }}>{s.name}</div>
                      {s.summary && <div style={{ color: tok.inkFaint, fontSize: 12, marginTop: 2 }}>{s.summary}</div>}
                    </td>
                    <td style={{ padding: "11px 14px" }}><Badge label={meta.label} color={meta.color} /></td>
                    <td style={{ padding: "11px 14px", textAlign: "center", color: tok.inkMuted, fontVariantNumeric: "tabular-nums" }}>{inputs.length || "—"}</td>
                    <td style={{ padding: "11px 14px", textAlign: "center", color: tok.inkMuted, fontVariantNumeric: "tabular-nums" }}>{outputs.length || "—"}</td>
                    <td style={{ padding: "11px 14px" }}><Badge label={s.status === "published" ? "Published" : "Draft"} color={s.status === "published" ? "#059669" : "#78716C"} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <NewStepModal busy={create.isPending} onCancel={() => setCreating(false)} onCreate={(input) => create.mutate(input)} />
      )}
    </>
  );
}

function NewStepModal({ onCreate, onCancel, busy }: { onCreate: (i: { name: string; stepType: string }) => void; onCancel: () => void; busy?: boolean }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,25,23,.4)", display: "grid", placeItems: "center", zIndex: 50, padding: 20 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(640px, 100%)", maxHeight: "86vh", display: "flex", flexDirection: "column", background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.radius, boxShadow: "0 20px 50px rgba(0,0,0,.2)", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${tok.border}` }}>
          <div style={{ fontFamily: tok.fontDisplay, fontSize: 21, color: tok.ink }}>New step</div>
          <div style={{ fontSize: 13, color: tok.inkMuted, marginTop: 3 }}>A reusable, testable building block. You'll design its inputs, outputs & criteria next.</div>
        </div>
        <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>
          <Field label="Step name">
            <TextInput value={name} onChange={setName} placeholder="e.g. Draft kitchen estimate" />
          </Field>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: tok.inkFaint, margin: "6px 0 8px" }}>Type</div>
          {STEP_CREATE_GROUPS.map((g) => (
            <div key={g.group} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: tok.inkFaint, marginBottom: 6 }}>{g.group}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                {g.items.map((s: StepTypeSpec) => {
                  const meta = stepTypeMeta(s.type);
                  const on = type === s.type;
                  return (
                    <button key={s.type} onClick={() => { setType(s.type); if (!name) setName(s.title); }} style={{ textAlign: "left", cursor: "pointer", padding: "9px 12px", borderRadius: tok.radiusSm, border: `1px solid ${on ? meta.color : tok.border}`, borderLeft: `3px solid ${meta.color}`, background: on ? `${meta.color}0D` : tok.surface, fontFamily: tok.font }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: tok.ink }}>{s.title}</div>
                      <div style={{ fontSize: 11, color: tok.inkMuted }}>{s.blurb}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 22px", borderTop: `1px solid ${tok.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button disabled={busy || !name.trim() || !type} onClick={() => onCreate({ name: name.trim(), stepType: type })}>Create step</Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── detail ───────────────────────────

interface TemplateDraft {
  name: string;
  stepType: string;
  summary: string;
  instructions: string;
  config: Record<string, unknown>;
  inputs: WfStepInput[];
  outputs: WfStepOutput[];
}

export function StepDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const tmpl = trpc.workflows.stepTemplates.get.useQuery({ id });
  if (tmpl.isLoading || !tmpl.data) return <div style={{ color: tok.inkMuted, padding: 40 }}>Loading…</div>;
  return <StepDetailLoaded key={id} template={tmpl.data} onBack={onBack} />;
}

function StepDetailLoaded({ template, onBack }: { template: any; onBack: () => void }) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<TemplateDraft>(() => ({
    name: template.name,
    stepType: template.stepType,
    summary: template.summary ?? "",
    instructions: template.instructions ?? "",
    config: (template.config as Record<string, unknown>) ?? {},
    inputs: (template.inputs as WfStepInput[]) ?? [],
    outputs: (template.outputs as WfStepOutput[]) ?? [],
  }));
  const set = (patch: Partial<TemplateDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const update = trpc.workflows.stepTemplates.update.useMutation({
    onSuccess: () => {
      void utils.workflows.stepTemplates.get.invalidate({ id: template.id });
      void utils.workflows.stepTemplates.list.invalidate();
    },
  });
  const del = trpc.workflows.stepTemplates.delete.useMutation({ onSuccess: onBack });

  const save = () =>
    update.mutate({
      id: template.id,
      name: draft.name,
      stepType: draft.stepType,
      summary: draft.summary,
      instructions: draft.instructions,
      config: draft.config,
      inputs: draft.inputs,
      outputs: draft.outputs,
    });

  const meta = stepTypeMeta(draft.stepType);
  const spec = stepTypeSpec(draft.stepType);
  const isUploadStep = draft.outputs.length === 1 && ["photo-set", "file"].includes(draft.outputs[0]?.type ?? "");

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <button onClick={onBack} style={{ background: "none", border: "none", color: tok.inkMuted, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 6 }}>← All steps</button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontFamily: tok.fontDisplay, fontSize: 28, color: tok.ink, margin: 0 }}>{draft.name || "Untitled step"}</h1>
            <Badge label={meta.label} color={meta.color} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="danger" size="sm" onClick={() => del.mutate({ id: template.id })}>Delete</Button>
          <Button onClick={save} disabled={update.isPending}>{update.isPending ? "Saving…" : "Save"}</Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18, alignItems: "start" }}>
        {/* design */}
        <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, background: tok.surface, padding: 18 }}>
          <SectionTitle>Design</SectionTitle>
          <Field label="Name"><TextInput value={draft.name} onChange={(v) => set({ name: v })} /></Field>
          <Field label="Type"><Select value={draft.stepType} onChange={(v) => set({ stepType: v })} options={STEP_TYPE_OPTIONS} /></Field>
          <Field label="Summary" hint="One line shown in the catalog."><TextInput value={draft.summary} onChange={(v) => set({ summary: v })} /></Field>
          <Field label="Instructions" hint="Guidance for the operator or runtime.">
            <textarea value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} rows={2} style={{ width: "100%", padding: "8px 11px", borderRadius: tok.radiusSm, border: `1px solid ${tok.border}`, fontFamily: tok.font, fontSize: 13, color: tok.ink, boxSizing: "border-box", resize: "vertical" }} />
          </Field>
          {spec && spec.config.length > 0 && <ConfigFields spec={spec} config={draft.config} onConfig={(c) => set({ config: c })} />}

          <div style={{ height: 1, background: tok.border, margin: "8px 0 14px" }} />
          <SubTitle>Inputs</SubTitle>
          <InputsDeclEditor inputs={draft.inputs} onChange={(inputs) => set({ inputs })} />

          <div style={{ height: 1, background: tok.border, margin: "16px 0 14px" }} />
          <SubTitle>Outputs &amp; success criteria</SubTitle>
          <OutputsEditor outputs={draft.outputs} onChange={(outputs) => set({ outputs })} />
        </div>

        {/* evaluations */}
        <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, background: tok.surface, padding: 18, position: "sticky", top: 16 }}>
          <SectionTitle>Evaluations</SectionTitle>
          {isUploadStep ? (
            <>
              <p style={{ fontSize: 12, color: tok.inkFaint, marginTop: 0, marginBottom: 14 }}>
                Design an evaluation's criteria, then run the step for real — upload the pictures and we grade what you produced.
              </p>
              <UploadEvalPanel templateId={template.id} output={draft.outputs[0]!} instructions={draft.instructions} />
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, color: tok.inkFaint, marginTop: 0, marginBottom: 14 }}>
                Provide a sample output for each declared output; we score it against the success criteria above.
              </p>
              <TestPanel templateId={template.id} outputs={draft.outputs} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function TestPanel({ templateId, outputs }: { templateId: string; outputs: WfStepOutput[] }) {
  const utils = trpc.useUtils();
  const tests = trpc.workflows.stepTests.listForTemplate.useQuery({ stepTemplateId: templateId });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const create = trpc.workflows.stepTests.create.useMutation({
    onSuccess: () => {
      void utils.workflows.stepTests.listForTemplate.invalidate({ stepTemplateId: templateId });
      setAdding(false);
      setName("");
      setVals({});
    },
  });

  const submit = () => {
    const captured: Record<string, unknown> = {};
    for (const o of outputs) captured[o.id] = parseValue(vals[o.id] ?? "");
    create.mutate({ stepTemplateId: templateId, name: name.trim() || "Test", inputFixture: { captured } });
  };

  const rows = tests.data ?? [];
  return (
    <div>
      {rows.length === 0 && !adding && (
        <div style={{ fontSize: 13, color: tok.inkFaint, padding: "0 0 12px" }}>No tests yet. Add one with a sample output to score it.</div>
      )}

      {rows.map((t) => (
        <TestRow key={t.id} test={t} />
      ))}

      {adding ? (
        <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, padding: 12, marginTop: 10, background: tok.surfaceAlt }}>
          <Field label="Test name"><TextInput value={name} onChange={setName} placeholder="e.g. Detailed estimate" /></Field>
          {outputs.length === 0 ? (
            <div style={{ fontSize: 12, color: tok.danger, marginBottom: 8 }}>Declare an output first (left) so there's something to score.</div>
          ) : (
            outputs.map((o) => (
              <Field key={o.id} label={`Sample “${o.name}” (${o.type})`} hint={`e.g. ${sampleHint(o.type)}`}>
                <TextInput value={vals[o.id] ?? ""} onChange={(v) => setVals((s) => ({ ...s, [o.id]: v }))} placeholder={sampleHint(o.type)} />
              </Field>
            ))
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" disabled={create.isPending || outputs.length === 0} onClick={submit}>Save test</Button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}><Button variant="outline" size="sm" onClick={() => setAdding(true)}>+ New test</Button></div>
      )}
    </div>
  );
}

function TestRow({ test }: { test: any }) {
  const utils = trpc.useUtils();
  const runs = trpc.workflows.stepTests.listRuns.useQuery({ stepTestId: test.id });
  const [open, setOpen] = useState(false);
  const run = trpc.workflows.stepTests.run.useMutation({
    onSuccess: () => {
      void utils.workflows.stepTests.listRuns.invalidate({ stepTestId: test.id });
      setOpen(true);
    },
  });
  const history = runs.data ?? [];
  const latest = history[0];

  return (
    <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, marginBottom: 8, background: tok.surface, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
        {latest ? <ScoreRing score={latest.score ?? 0} passed={latest.passed} /> : <span style={{ width: 38, height: 38, borderRadius: 999, border: `2px dashed ${tok.border}`, display: "inline-block" }} />}
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
          <div style={{ fontSize: 13, fontWeight: 600, color: tok.ink }}>{test.name}</div>
          <div style={{ fontSize: 11, color: tok.inkFaint }}>{latest ? `${latest.passed ? "Passed" : "Failed"} · ${history.length} run${history.length === 1 ? "" : "s"}` : "Not run yet"}</div>
        </div>
        <Button size="sm" variant="outline" onClick={() => run.mutate({ stepTestId: test.id })} disabled={run.isPending}>{run.isPending ? "Running…" : "Run test"}</Button>
      </div>
      {open && latest && (
        <div style={{ borderTop: `1px solid ${tok.border}`, padding: "10px 12px", background: tok.surfaceAlt }}>
          {(latest.verificationResults as any[] ?? []).length === 0 ? (
            <div style={{ fontSize: 12, color: tok.inkFaint }}>No criteria defined — nothing to check.</div>
          ) : (
            (latest.verificationResults as any[]).map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "3px 0" }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: r.status === "pass" ? "#16A34A" : r.status === "fail" ? "#DC2626" : "#A8A29E" }} />
                <span style={{ color: tok.ink }}>{r.kind}</span>
                {r.message && <span style={{ color: tok.inkFaint }}>— {r.message}</span>}
              </div>
            ))
          )}
          {history.length > 1 && (
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", marginTop: 10, height: 30 }}>
              {history.slice(0, 12).reverse().map((h) => (
                <div key={h.id} title={`${h.score ?? 0}`} style={{ width: 8, height: `${Math.max(4, (h.score ?? 0) * 0.3)}px`, background: h.passed ? "#16A34A" : "#DC2626", borderRadius: 2, opacity: 0.8 }} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreRing({ score, passed }: { score: number; passed: boolean }) {
  const color = passed ? "#16A34A" : score >= 50 ? "#D97706" : "#DC2626";
  return (
    <div style={{ width: 38, height: 38, borderRadius: 999, display: "grid", placeItems: "center", background: `conic-gradient(${color} ${score * 3.6}deg, ${tok.border} 0)`, flexShrink: 0 }}>
      <div style={{ width: 30, height: 30, borderRadius: 999, background: tok.surface, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color }}>{score}</div>
    </div>
  );
}

// ── upload-step evaluations: design criteria, then run the step for real ──────────

function UploadEvalPanel({ templateId, output, instructions }: { templateId: string; output: WfStepOutput; instructions: string }) {
  const utils = trpc.useUtils();
  const tests = trpc.workflows.stepTests.listForTemplate.useQuery({ stepTemplateId: templateId });
  const [creating, setCreating] = useState(false);
  const rows = tests.data ?? [];
  const refresh = () => utils.workflows.stepTests.listForTemplate.invalidate({ stepTemplateId: templateId });
  return (
    <div>
      {rows.length === 0 && !creating && (
        <div style={{ fontSize: 13, color: tok.inkFaint, padding: "0 0 12px" }}>No evaluations yet. Add one to set its criteria, then run the step against it.</div>
      )}
      {rows.map((t) => <EvalRow key={t.id} test={t} output={output} instructions={instructions} />)}
      {creating ? (
        <NewEvalForm templateId={templateId} onCancel={() => setCreating(false)} onDone={() => { setCreating(false); void refresh(); }} />
      ) : (
        <div style={{ marginTop: 10 }}><Button variant="outline" size="sm" onClick={() => setCreating(true)}>+ New evaluation</Button></div>
      )}
    </div>
  );
}

function summarizeCriteria(criteria: any[]): string {
  const parts: string[] = [];
  for (const c of criteria) {
    if (c.kind === "min_count") parts.push(`≥ ${c.params?.n} files`);
    else if (c.kind === "all_mime_type") parts.push((c.params?.allowed ?? []).map((a: string) => a.replace("image/", "").toUpperCase()).join("/"));
    else if (c.kind === "all_size_range" && c.params?.max_bytes) parts.push(`≤ ${Math.round(c.params.max_bytes / 1048576)}MB`);
  }
  return parts.join(" · ") || "no criteria";
}

function EvalRow({ test, output, instructions }: { test: any; output: WfStepOutput; instructions: string }) {
  const runs = trpc.workflows.stepTests.listRuns.useQuery({ stepTestId: test.id });
  const [running, setRunning] = useState(false);
  const latest = (runs.data ?? [])[0];
  const criteria = (test.criteria as any[]) ?? [];
  return (
    <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, marginBottom: 8, background: tok.surface, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
        {latest ? <ScoreRing score={latest.score ?? 0} passed={latest.passed} /> : <span style={{ width: 38, height: 38, borderRadius: 999, border: `2px dashed ${tok.border}`, display: "inline-block" }} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: tok.ink }}>{test.name}</div>
          <div style={{ fontSize: 11, color: tok.inkFaint }}>{summarizeCriteria(criteria)}{latest ? ` · ${latest.passed ? "passed" : "failed"}` : ""}</div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setRunning(true)}>Run</Button>
      </div>
      {running && <RunEvalModal test={test} output={output} instructions={instructions} onClose={() => { setRunning(false); void runs.refetch(); }} />}
    </div>
  );
}

function NewEvalForm({ templateId, onDone, onCancel }: { templateId: string; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [minCount, setMinCount] = useState("4");
  const [jpg, setJpg] = useState(true);
  const [png, setPng] = useState(true);
  const [maxMB, setMaxMB] = useState("10");
  const create = trpc.workflows.stepTests.create.useMutation({ onSuccess: onDone });
  const submit = () => {
    const criteria: any[] = [];
    const n = parseInt(minCount, 10);
    if (n > 0) criteria.push({ kind: "min_count", params: { n } });
    const allowed = [...(jpg ? ["image/jpeg"] : []), ...(png ? ["image/png"] : [])];
    if (allowed.length) criteria.push({ kind: "all_mime_type", params: { allowed } });
    const mb = parseFloat(maxMB);
    if (mb > 0) criteria.push({ kind: "all_size_range", params: { max_bytes: Math.round(mb * 1048576) } });
    create.mutate({ stepTemplateId: templateId, name: name.trim() || "Evaluation", criteria });
  };
  const numStyle = { width: 56, margin: "0 6px", padding: "5px 7px", borderRadius: 6, border: `1px solid ${tok.border}`, fontFamily: tok.font } as const;
  return (
    <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, padding: 12, marginTop: 10, background: tok.surfaceAlt }}>
      <Field label="Evaluation name"><TextInput value={name} onChange={setName} placeholder="e.g. Standard site upload" /></Field>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: tok.inkFaint, margin: "4px 0 8px" }}>Success criteria</div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: tok.inkMuted }}>At least<input type="number" value={minCount} onChange={(e) => setMinCount(e.target.value)} style={numStyle} />files</label>
        <label style={{ fontSize: 13, color: tok.inkMuted }}>≤<input type="number" value={maxMB} onChange={(e) => setMaxMB(e.target.value)} style={numStyle} />MB each</label>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 13, color: tok.inkMuted, alignItems: "center" }}>
        <span>Formats:</span>
        <label style={{ cursor: "pointer" }}><input type="checkbox" checked={jpg} onChange={(e) => setJpg(e.target.checked)} /> JPG</label>
        <label style={{ cursor: "pointer" }}><input type="checkbox" checked={png} onChange={(e) => setPng(e.target.checked)} /> PNG</label>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={create.isPending} onClick={submit}>Save evaluation</Button>
      </div>
    </div>
  );
}

function RunEvalModal({ test, output, instructions, onClose }: { test: any; output: WfStepOutput; instructions: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [files, setFiles] = useState<{ name: string; type: string; size: number }[]>([]);
  const [result, setResult] = useState<any | null>(null);
  const run = trpc.workflows.stepTests.run.useMutation({
    onSuccess: (r) => { setResult(r); void utils.workflows.stepTests.listRuns.invalidate({ stepTestId: test.id }); },
  });
  const onPick = (list: FileList | null) => {
    setFiles(Array.from(list ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })));
    setResult(null);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,25,23,.4)", display: "grid", placeItems: "center", zIndex: 50, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)", maxHeight: "86vh", display: "flex", flexDirection: "column", background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.radius, boxShadow: "0 20px 50px rgba(0,0,0,.2)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${tok.border}` }}>
          <div style={{ fontFamily: tok.fontDisplay, fontSize: 19, color: tok.ink }}>Run: {test.name}</div>
          <div style={{ fontSize: 12, color: tok.inkFaint, marginTop: 3 }}>{summarizeCriteria((test.criteria as any[]) ?? [])}</div>
        </div>
        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {instructions && (
            <div style={{ background: tok.surfaceAlt, border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, padding: "10px 12px", fontSize: 13, color: tok.ink, marginBottom: 14 }}>
              <span style={{ fontWeight: 600 }}>Instructions: </span>{instructions}
            </div>
          )}
          <label style={{ display: "block", border: `2px dashed ${tok.border}`, borderRadius: tok.radius, padding: "26px 16px", textAlign: "center", cursor: "pointer", color: tok.inkMuted, fontSize: 13 }}>
            <input type="file" multiple accept="image/*" style={{ display: "none" }} onChange={(e) => onPick(e.target.files)} />
            {files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected — click to change` : "Click to choose site pictures"}
          </label>
          {files.length > 0 && (
            <div style={{ marginTop: 12, border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, overflow: "hidden" }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 10px", borderBottom: i < files.length - 1 ? `1px solid ${tok.border}` : "none", color: tok.inkMuted }}>
                  <span style={{ color: tok.ink }}>{f.name}</span>
                  <span>{f.type.replace("image/", "").toUpperCase() || "?"} · {(f.size / 1048576).toFixed(1)}MB</span>
                </div>
              ))}
            </div>
          )}
          {result && (
            <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <ScoreRing score={result.score ?? 0} passed={result.passed} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: result.passed ? "#16A34A" : "#DC2626", marginBottom: 4 }}>{result.passed ? "Passed" : "Failed"} · {result.score}/100</div>
                {((result.verificationResults as any[]) ?? []).map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "2px 0" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: r.status === "pass" ? "#16A34A" : r.status === "fail" ? "#DC2626" : "#A8A29E" }} />
                    <span style={{ color: tok.ink }}>{r.kind}</span>
                    {r.message && <span style={{ color: tok.inkFaint }}>— {r.message}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${tok.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button disabled={!files.length || run.isPending} onClick={() => run.mutate({ stepTestId: test.id, captured: { [output.id]: files } })}>{run.isPending ? "Grading…" : "Grade upload"}</Button>
        </div>
      </div>
    </div>
  );
}

function sampleHint(type: string): string {
  switch (type) {
    case "text": return '"A detailed, well-structured estimate…"';
    case "list": return '["a","b","c"]';
    case "scalar": return "42";
    case "decision": return '{"outcome":"approved"}';
    case "structured": return '{"key":"value"}';
    default: return "sample value";
  }
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontFamily: tok.fontDisplay, fontSize: 17, color: tok.ink, marginBottom: 14 }}>{children}</div>;
}
function SubTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: tok.inkFaint, marginBottom: 10 }}>{children}</div>;
}
