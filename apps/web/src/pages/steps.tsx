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
  const connections = trpc.connections.list.useQuery();
  const connectionOptions = (connections.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  // Pinned input values (the n8n "pin data" borrow) — persisted per-step in
  // localStorage so the step can be test-run without executing upstream. The
  // pinned `project` flows into the run modal as the upload destination.
  const pinKey = `beamy.stepPin.${template.id}`;
  const [pinned, setPinned] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(pinKey) ?? "{}"); } catch { return {}; }
  });
  const pinValue = (name: string, value: string) =>
    setPinned((p) => {
      const next = { ...p, [name]: value };
      try { localStorage.setItem(pinKey, JSON.stringify(next)); } catch { /* storage off */ }
      return next;
    });
  const projectInput = draft.inputs.find((i) => i.type === "entity-ref" || i.name.toLowerCase() === "project");
  const pinnedProject = projectInput ? pinned[projectInput.name] ?? "" : "";

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

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,0.8fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.05fr)", gap: 14, alignItems: "start" }}>
        {/* input — values fed to the step (pinned for testing) */}
        <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, background: tok.surface, padding: 16, position: "sticky", top: 16 }}>
          <SectionTitle>Input</SectionTitle>
          <p style={{ fontSize: 12, color: tok.inkFaint, marginTop: 0, marginBottom: 14 }}>Values fed to this step. Pin one to test without running the steps before it.</p>
          <InputPane inputs={draft.inputs} pinned={pinned} onPin={pinValue} />
        </div>

        {/* design — the step's contract */}
        <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, background: tok.surface, padding: 16 }}>
          <SectionTitle>Design</SectionTitle>
          <Field label="Name"><TextInput value={draft.name} onChange={(v) => set({ name: v })} /></Field>
          <Field label="Type"><Select value={draft.stepType} onChange={(v) => set({ stepType: v })} options={STEP_TYPE_OPTIONS} /></Field>
          <Field label="Summary" hint="One line shown in the catalog."><TextInput value={draft.summary} onChange={(v) => set({ summary: v })} /></Field>
          <Field label="Instructions" hint="Guidance for the operator or runtime.">
            <textarea value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} rows={2} style={{ width: "100%", padding: "8px 11px", borderRadius: tok.radiusSm, border: `1px solid ${tok.border}`, fontFamily: tok.font, fontSize: 13, color: tok.ink, boxSizing: "border-box", resize: "vertical" }} />
          </Field>
          {spec && spec.config.length > 0 && <ConfigFields spec={spec} config={draft.config} onConfig={(c) => set({ config: c })} connectionOptions={connectionOptions} />}

          <div style={{ height: 1, background: tok.border, margin: "8px 0 14px" }} />
          <SubTitle>Inputs (declared)</SubTitle>
          <InputsDeclEditor inputs={draft.inputs} onChange={(inputs) => set({ inputs })} />
        </div>

        {/* outputs — what the step produces + how to verify (its own column, like inputs) */}
        <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, background: tok.surface, padding: 16 }}>
          <SectionTitle>Outputs</SectionTitle>
          <p style={{ fontSize: 12, color: tok.inkFaint, marginTop: 0, marginBottom: 14 }}>What the step produces, and the success criteria each output is checked against.</p>
          <OutputsEditor outputs={draft.outputs} onChange={(outputs) => set({ outputs })} />
        </div>

        {/* output tests — one test per output: execute + graded result */}
        <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, background: tok.surface, padding: 16, position: "sticky", top: 16 }}>
          <SectionTitle>Output tests</SectionTitle>
          <p style={{ fontSize: 12, color: tok.inkFaint, marginTop: 0, marginBottom: 14 }}>One test per output — design criteria or pin a sample, then execute and we grade it.</p>
          <OutputTestsColumn templateId={template.id} outputs={draft.outputs} instructions={draft.instructions} inputs={draft.inputs} defaultProjectId={pinnedProject} />
        </div>
      </div>
    </>
  );
}

// ── Input pane: the values fed to the step, pinned for testing (n8n "pin data") ──
function InputPane({ inputs, pinned, onPin }: { inputs: WfStepInput[]; pinned: Record<string, string>; onPin: (name: string, value: string) => void }) {
  const projQ = trpc.projects.list.useQuery({});
  const projectOptions = (projQ.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  if (inputs.length === 0) {
    return <div style={{ fontSize: 13, color: tok.inkFaint }}>This step consumes no inputs.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {inputs.map((inp) => {
        const isProject = inp.type === "entity-ref" || inp.name.toLowerCase() === "project";
        const val = pinned[inp.name] ?? "";
        return (
          <div key={inp.name} style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, padding: 11, background: tok.surfaceAlt }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: 7 }}>
              <span style={{ fontSize: 13, color: tok.ink, fontWeight: 600 }}>{inp.name}</span>
              <Badge label={inp.type} color="#185FA5" />
            </div>
            {isProject ? (
              <Select value={val} onChange={(v) => onPin(inp.name, v)} options={[{ value: "", label: projQ.isLoading ? "Loading…" : "Choose a project…" }, ...projectOptions]} />
            ) : (
              <TextInput value={val} onChange={(v) => onPin(inp.name, v)} placeholder={`Pin a sample ${inp.type}…`} />
            )}
            {val && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11, color: tok.inkFaint }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "#059669", display: "inline-block" }} />
                pinned for testing
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Output tests column: one test per declared output (the n8n NDV output pane) ──
function OutputTestsColumn({ templateId, outputs, instructions, inputs, defaultProjectId }: { templateId: string; outputs: WfStepOutput[]; instructions: string; inputs: WfStepInput[]; defaultProjectId?: string }) {
  if (outputs.length === 0) {
    return <div style={{ fontSize: 13, color: tok.inkFaint }}>Declare an output (in the Outputs column) so there's something to test.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {outputs.map((o, i) => {
        const isUpload = ["photo-set", "file"].includes(o.type);
        return (
          <div key={o.id || i}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: tok.ink }}>{o.name}</span>
              <Badge label={o.type} color="#7C3AED" />
            </div>
            {isUpload ? (
              <UploadEvalPanel templateId={templateId} output={o} primary={i === 0} instructions={instructions} inputs={inputs} defaultProjectId={defaultProjectId} />
            ) : (
              <TestPanel templateId={templateId} output={o} primary={i === 0} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TestPanel({ templateId, output, primary }: { templateId: string; output: WfStepOutput; primary?: boolean }) {
  const utils = trpc.useUtils();
  const tests = trpc.workflows.stepTests.listForTemplate.useQuery({ stepTemplateId: templateId });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [val, setVal] = useState("");
  const create = trpc.workflows.stepTests.create.useMutation({
    onSuccess: () => {
      void utils.workflows.stepTests.listForTemplate.invalidate({ stepTemplateId: templateId });
      setAdding(false);
      setName("");
      setVal("");
    },
  });

  const submit = () =>
    create.mutate({ stepTemplateId: templateId, name: name.trim() || "Test", outputId: output.id, inputFixture: { captured: { [output.id]: parseValue(val) } } });

  const rows = (tests.data ?? []).filter((t) => t.outputId === output.id || (primary && t.outputId == null));
  return (
    <div>
      {rows.length === 0 && !adding && (
        <div style={{ fontSize: 13, color: tok.inkFaint, padding: "0 0 12px" }}>No tests yet. Add one with a sample to score it.</div>
      )}

      {rows.map((t) => (
        <TestRow key={t.id} test={t} />
      ))}

      {adding ? (
        <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, padding: 12, marginTop: 10, background: tok.surfaceAlt }}>
          <Field label="Test name"><TextInput value={name} onChange={setName} placeholder="e.g. Detailed estimate" /></Field>
          <Field label={`Sample “${output.name}” (${output.type})`} hint={`e.g. ${sampleHint(output.type)}`}>
            <TextInput value={val} onChange={setVal} placeholder={sampleHint(output.type)} />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" disabled={create.isPending} onClick={submit}>Save test</Button>
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

function UploadEvalPanel({ templateId, output, primary, instructions, inputs, defaultProjectId }: { templateId: string; output: WfStepOutput; primary?: boolean; instructions: string; inputs: WfStepInput[]; defaultProjectId?: string }) {
  const utils = trpc.useUtils();
  const tests = trpc.workflows.stepTests.listForTemplate.useQuery({ stepTemplateId: templateId });
  const [creating, setCreating] = useState(false);
  const rows = (tests.data ?? []).filter((t) => t.outputId === output.id || (primary && t.outputId == null));
  const refresh = () => utils.workflows.stepTests.listForTemplate.invalidate({ stepTemplateId: templateId });
  return (
    <div>
      {rows.length === 0 && !creating && (
        <div style={{ fontSize: 13, color: tok.inkFaint, padding: "0 0 12px" }}>No evaluations yet. Add one to set its criteria, then run the step against it.</div>
      )}
      {rows.map((t) => <EvalRow key={t.id} test={t} output={output} instructions={instructions} inputs={inputs} defaultProjectId={defaultProjectId} />)}
      {creating ? (
        <NewEvalForm templateId={templateId} outputId={output.id} onCancel={() => setCreating(false)} onDone={() => { setCreating(false); void refresh(); }} />
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

function EvalRow({ test, output, instructions, inputs, defaultProjectId }: { test: any; output: WfStepOutput; instructions: string; inputs: WfStepInput[]; defaultProjectId?: string }) {
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
      {running && <RunEvalModal test={test} output={output} instructions={instructions} inputs={inputs} defaultProjectId={defaultProjectId} onClose={() => { setRunning(false); void runs.refetch(); }} />}
    </div>
  );
}

function NewEvalForm({ templateId, outputId, onDone, onCancel }: { templateId: string; outputId: string; onDone: () => void; onCancel: () => void }) {
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
    create.mutate({ stepTemplateId: templateId, name: name.trim() || "Evaluation", outputId, criteria });
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

interface UploadFile {
  localId: string;
  name: string;
  type: string;
  size: number;
  status: "uploading" | "done" | "error";
  docId?: string;
  path?: string;
  error?: string;
}

/**
 * The real step-run modal: Brief (instructions + criteria) → Act (pick a real
 * project, upload site photos via the live signed-URL flow) → Verify (grade the
 * actual `documents` rows the server reads back) → Resolve (paths + verdict).
 */
function RunEvalModal({ test, instructions, inputs, defaultProjectId, onClose }: { test: any; output: WfStepOutput; instructions: string; inputs: WfStepInput[]; defaultProjectId?: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const projectsQ = trpc.projects.list.useQuery({});
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  // The step declares its inputs; a "project" entity-ref is the one we collect
  // here (its value is the project the photos upload into).
  const projectInput = inputs.find((i) => i.type === "entity-ref" || i.name.toLowerCase() === "project");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [result, setResult] = useState<any | null>(null);
  const createDoc = trpc.documents.create.useMutation();
  const grade = trpc.workflows.stepTests.runUpload.useMutation({
    onSuccess: (r) => { setResult(r); void utils.workflows.stepTests.listRuns.invalidate({ stepTestId: test.id }); },
  });

  const projectOptions = (projectsQ.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const uploading = files.some((f) => f.status === "uploading");
  const uploadedIds = files.filter((f) => f.status === "done" && f.docId).map((f) => f.docId as string);

  async function onPick(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length || !projectId) return;
    setResult(null);
    for (const file of picked) {
      const localId = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`;
      const mimeType = file.type || "application/octet-stream";
      setFiles((prev) => [...prev, { localId, name: file.name, type: mimeType, size: file.size, status: "uploading" }]);
      try {
        const res = await createDoc.mutateAsync({ projectId, name: file.name, mimeType, sizeBytes: file.size });
        const put = await fetch(res.upload.signedUrl, { method: "PUT", body: file, headers: { "content-type": mimeType } });
        if (!put.ok) throw new Error(`storage ${put.status}`);
        setFiles((prev) => prev.map((f) => (f.localId === localId ? { ...f, status: "done", docId: res.document.id, path: res.document.storagePath } : f)));
      } catch (e) {
        setFiles((prev) => prev.map((f) => (f.localId === localId ? { ...f, status: "error", error: e instanceof Error ? e.message : String(e) } : f)));
      }
    }
  }

  const dot = (c: string) => ({ width: 7, height: 7, borderRadius: 999, background: c, flexShrink: 0 } as const);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,25,23,.4)", display: "grid", placeItems: "center", zIndex: 50, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(580px, 100%)", maxHeight: "88vh", display: "flex", flexDirection: "column", background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.radius, boxShadow: "0 20px 50px rgba(0,0,0,.2)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${tok.border}` }}>
          <div style={{ fontFamily: tok.fontDisplay, fontSize: 19, color: tok.ink }}>Run step: {test.name}</div>
          <div style={{ fontSize: 12, color: tok.inkFaint, marginTop: 3 }}>{summarizeCriteria((test.criteria as any[]) ?? [])}</div>
        </div>
        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {/* Brief */}
          {instructions && (
            <div style={{ background: tok.surfaceAlt, border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, padding: "10px 12px", fontSize: 13, color: tok.ink, marginBottom: 16 }}>
              <span style={{ fontWeight: 600 }}>Instructions: </span>{instructions}
            </div>
          )}

          {/* Inputs — the step consumes a project (entity-ref); the photos upload into it */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: tok.inkFaint, marginBottom: 8 }}>
            {projectInput ? "Inputs" : "Destination"}
          </div>
          <Field
            label={projectInput ? `${projectInput.name} · project` : "Upload into project"}
            hint={files.length ? "Locked while files are uploaded." : projectInput ? "The project this step runs on — photos upload into its library." : "The photos land in this project's document library."}
          >
            {files.length > 0 ? (
              <div style={{ padding: "8px 11px", borderRadius: tok.radiusSm, border: `1px solid ${tok.border}`, fontSize: 13, color: tok.ink, background: tok.surfaceAlt }}>
                {projectOptions.find((p) => p.value === projectId)?.label ?? "—"}
              </div>
            ) : (
              <Select value={projectId} onChange={setProjectId} options={[{ value: "", label: projectsQ.isLoading ? "Loading…" : "Choose a project…" }, ...projectOptions]} />
            )}
          </Field>
          {!projectsQ.isLoading && projectOptions.length === 0 && (
            <div style={{ fontSize: 12, color: tok.danger, marginTop: -6, marginBottom: 8 }}>No projects in this workspace yet — create one first.</div>
          )}

          {/* Act — upload */}
          <label style={{ display: "block", marginTop: 6, border: `2px dashed ${tok.border}`, borderRadius: tok.radius, padding: "24px 16px", textAlign: "center", cursor: projectId ? "pointer" : "not-allowed", color: projectId ? tok.inkMuted : tok.inkFaint, fontSize: 13, opacity: projectId ? 1 : 0.6 }}>
            <input type="file" multiple accept="image/*" disabled={!projectId} style={{ display: "none" }} onChange={(e) => { onPick(e.target.files); e.currentTarget.value = ""; }} />
            {projectId ? "Click to upload site photos" : "Choose a project first"}
          </label>

          {files.length > 0 && (
            <div style={{ marginTop: 12, border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, overflow: "hidden" }}>
              {files.map((f, i) => (
                <div key={f.localId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "7px 10px", borderBottom: i < files.length - 1 ? `1px solid ${tok.border}` : "none" }}>
                  <span style={dot(f.status === "done" ? "#16A34A" : f.status === "error" ? "#DC2626" : "#D97706")} />
                  <span style={{ color: tok.ink, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <span style={{ color: tok.inkFaint }}>
                    {f.status === "uploading" ? "uploading…" : f.status === "error" ? (f.error ?? "failed") : `${f.type.replace("image/", "").toUpperCase() || "?"} · ${(f.size / 1048576).toFixed(1)}MB`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Resolve */}
          {result && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${tok.border}` }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <ScoreRing score={result.score ?? 0} passed={result.passed} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: result.passed ? "#16A34A" : "#DC2626", marginBottom: 4 }}>{result.passed ? "Passed" : "Failed"} · {result.score}/100</div>
                  {((result.verificationResults as any[]) ?? []).map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "2px 0" }}>
                      <span style={dot(r.status === "pass" ? "#16A34A" : r.status === "fail" ? "#DC2626" : "#A8A29E")} />
                      <span style={{ color: tok.ink }}>{r.kind}</span>
                      {r.message && <span style={{ color: tok.inkFaint }}>— {r.message}</span>}
                    </div>
                  ))}
                </div>
              </div>
              {((result.paths as string[]) ?? []).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: tok.inkFaint, marginBottom: 6 }}>Output · image paths</div>
                  <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, background: tok.surfaceAlt, padding: "8px 10px", fontFamily: "ui-monospace, monospace", fontSize: 11, color: tok.inkMuted }}>
                    {(result.paths as string[]).map((p, i) => <div key={i} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</div>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${tok.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: tok.inkFaint }}>{uploadedIds.length ? `${uploadedIds.length} uploaded` : ""}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button disabled={!uploadedIds.length || uploading || grade.isPending} onClick={() => grade.mutate({ stepTestId: test.id, projectId, documentIds: uploadedIds })}>{grade.isPending ? "Verifying…" : "Verify & grade"}</Button>
          </div>
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
