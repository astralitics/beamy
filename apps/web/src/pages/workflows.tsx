import { useEffect, useState } from "react";
import "@xyflow/react/dist/style.css";
import { trpc } from "../lib/trpc";
import { PageHeader } from "../components/ui";
import { StepCatalog, StepDetail } from "./steps";
import { ConnectionsPage } from "./connections";
import { TriggerConfigPanel } from "./workflows/TriggerConfigPanel";
import {
  Badge,
  Button,
  RunStepInspector,
  StepCreatorModal,
  StepEditor,
  StepListView,
  VersionHistory,
  WorkflowCanvas,
  WorkflowCreatorWizard,
  WorkflowListView,
  statusMeta,
  stepTypeMeta,
  tok,
  type RunStepView,
  type RunView,
  type UpstreamOutput,
  type VersionView,
  type WfDefinition,
  type WfNote,
  type WfStep,
  type WorkflowSummary,
} from "./workflows/ui";

/** The outputs of the steps `stepId` depends on — feeds the inspector's "Input" pane. */
function upstreamFor(stepId: string, definition: WfDefinition, results: RunStepView[]): UpstreamOutput[] {
  const defStep = definition.steps.find((s) => s.id === stepId);
  return (defStep?.dependsOn ?? []).map((depId) => ({
    id: depId,
    name: definition.steps.find((s) => s.id === depId)?.name ?? depId,
    output: results.find((r) => r.stepId === depId)?.output,
  }));
}

function uid() {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return `step-${c?.randomUUID ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;
}

/** Kahn's algorithm — true if `dependsOn` edges contain a cycle (used to reject bad connections). */
function hasCycle(steps: WfStep[]): boolean {
  const ids = new Set(steps.map((s) => s.id));
  const indeg = new Map(steps.map((s) => [s.id, (s.dependsOn ?? []).filter((d) => ids.has(d)).length]));
  const queue = steps.filter((s) => (indeg.get(s.id) ?? 0) === 0).map((s) => s.id);
  let seen = 0;
  while (queue.length) {
    const id = queue.shift()!;
    seen++;
    for (const s of steps) {
      if ((s.dependsOn ?? []).includes(id)) {
        const d = (indeg.get(s.id) ?? 1) - 1;
        indeg.set(s.id, d);
        if (d === 0) queue.push(s.id);
      }
    }
  }
  return seen !== steps.length;
}

export default function WorkflowsPage() {
  const [section, setSection] = useState<"workflows" | "steps" | "connections">("workflows");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const inDetail = (section === "workflows" && !!openId) || (section === "steps" && !!openStepId);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10">
      {!inDetail && (
        <div style={{ display: "inline-flex", background: tok.surfaceAlt, border: `1px solid ${tok.border}`, borderRadius: 999, padding: 3, marginBottom: 20 }}>
          {(["workflows", "steps", "connections"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setSection(s); setOpenId(null); setOpenStepId(null); }}
              style={{ padding: "6px 18px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: tok.font, textTransform: "capitalize", background: section === s ? tok.surface : "transparent", color: section === s ? tok.ink : tok.inkMuted, boxShadow: section === s ? "0 1px 2px rgba(0,0,0,.08)" : "none" }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {section === "workflows" ? (
        openId ? <WorkflowDetail id={openId} onBack={() => setOpenId(null)} /> : <WorkflowIndex onOpen={setOpenId} />
      ) : section === "steps" ? (
        openStepId ? <StepDetail id={openStepId} onBack={() => setOpenStepId(null)} /> : <StepCatalog onOpen={setOpenStepId} />
      ) : (
        <ConnectionsPage />
      )}
    </div>
  );
}

// ─────────────────────────── index ───────────────────────────

function WorkflowIndex({ onOpen }: { onOpen: (id: string) => void }) {
  const utils = trpc.useUtils();
  const list = trpc.workflows.list.useQuery();
  const [creating, setCreating] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const create = trpc.workflows.create.useMutation({
    onSuccess: (w) => {
      void utils.workflows.list.invalidate();
      setCreating(false);
      onOpen(w.id);
    },
  });
  const generate = trpc.workflows.generate.useMutation({
    onSuccess: (w) => {
      void utils.workflows.list.invalidate();
      setCreating(false);
      onOpen(w.id); // land on the Build canvas reviewing the AI draft
    },
  });
  const focused = trpc.workflows.get.useQuery(
    { id: focusedId! },
    { enabled: !!focusedId },
  );

  const rows: WorkflowSummary[] = (list.data ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    summary: w.summary,
    status: w.status,
    version: w.version,
    triggerType: w.triggerType,
    stepCount: w.stepCount,
    lastRun: w.lastRun,
  }));

  return (
    <>
      <PageHeader
        title="Workflows"
        lede="Build your firm's repeatable processes — design and test each step, run them with human gates, and version every change."
      />
      <div className="mt-6">
        {list.isLoading ? (
          <div style={{ color: tok.inkMuted, padding: 40, textAlign: "center" }}>Loading…</div>
        ) : (
          <WorkflowListView
            workflows={rows}
            onOpen={onOpen}
            onCreate={() => setCreating(true)}
            onRun={onOpen}
            focusedId={focusedId}
            focusedDefinition={focused.data ? (focused.data.definition as WfDefinition) : null}
            onFocus={setFocusedId}
          />
        )}
      </div>
      {creating && (
        <WorkflowCreatorWizard
          busy={create.isPending || generate.isPending}
          error={(generate.error ?? create.error)?.message ?? null}
          onModeChange={() => { generate.reset(); create.reset(); }}
          onCancel={() => { setCreating(false); generate.reset(); create.reset(); }}
          onCreate={(input) =>
            create.mutate({
              name: input.name,
              summary: input.summary,
              triggerType: input.triggerType as "manual" | "scheduled" | "signal",
            })
          }
          onBuildWithAI={(input) =>
            generate.mutate({
              prompt: input.prompt,
              triggerType: input.triggerType as "manual" | "scheduled" | "signal",
            })
          }
        />
      )}
    </>
  );
}

// ─────────────────────────── detail ───────────────────────────

type Tab = "build" | "run" | "versions";

function WorkflowDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const utils = trpc.useUtils();
  const wf = trpc.workflows.get.useQuery({ id });
  const [tab, setTab] = useState<Tab>("build");
  const [stepView, setStepView] = useState<"list" | "dag">("dag");
  const [editing, setEditing] = useState<WfStep | null>(null);
  const [editingTrigger, setEditingTrigger] = useState(false);
  const [creatingStep, setCreatingStep] = useState(false);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [layoutNonce, setLayoutNonce] = useState(0);
  const [run, setRun] = useState<RunView | null>(null);

  const versions = trpc.workflows.listVersions.useQuery({ workflowId: id }, { enabled: tab === "versions" });
  const stepCatalog = trpc.workflows.stepTemplates.list.useQuery();
  const connections = trpc.connections.list.useQuery();
  const connectionOptions = (connections.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  const updateDraft = trpc.workflows.updateDraft.useMutation({
    onSuccess: () => {
      void utils.workflows.get.invalidate({ id });
      void utils.workflows.list.invalidate();
    },
  });
  const publish = trpc.workflows.publish.useMutation({
    onSuccess: () => {
      void utils.workflows.get.invalidate({ id });
      void utils.workflows.list.invalidate();
      void utils.workflows.listVersions.invalidate({ workflowId: id });
    },
  });
  const startRun = trpc.workflows.runs.start.useMutation({ onSuccess: (r) => setRun(r as RunView) });
  const resumeRun = trpc.workflows.runs.resume.useMutation({ onSuccess: (r) => setRun(r as RunView) });
  const restore = trpc.workflows.restoreVersion.useMutation({
    onSuccess: () => {
      void utils.workflows.get.invalidate({ id });
      void utils.workflows.listVersions.invalidate({ workflowId: id });
    },
  });

  if (wf.isLoading || !wf.data) {
    return <div style={{ color: tok.inkMuted, padding: 40 }}>Loading…</div>;
  }
  const def = (wf.data.definition as WfDefinition) ?? { name: wf.data.name, steps: [] };
  const steps = def.steps ?? [];

  const saveDef = (patch: { steps?: WfStep[]; notes?: WfNote[]; edgeLabels?: Record<string, string> }) =>
    updateDraft.mutate({ id, patch: { definition: { name: def.name, steps: patch.steps ?? steps, notes: patch.notes ?? def.notes, edgeLabels: patch.edgeLabels ?? def.edgeLabels } } });
  const saveDefinition = (nextSteps: WfStep[]) => saveDef({ steps: nextSteps });

  const addStep = () => { setPendingSource(null); setPendingTarget(null); setCreatingStep(true); };
  const addAfter = (sourceId: string) => { setPendingSource(sourceId); setPendingTarget(null); setCreatingStep(true); };
  const addOnEdge = (source: string, target: string) => { setPendingSource(source); setPendingTarget(target); setCreatingStep(true); };
  const createStep = (draft: Omit<WfStep, "id">) => {
    const step: WfStep = { id: uid(), ...draft };
    let next = [...steps, step];
    if (pendingSource && pendingTarget) {
      // inserted on an edge: the downstream step now depends on the new step instead of the source
      next = next.map((s) => (s.id === pendingTarget ? { ...s, dependsOn: [...(s.dependsOn ?? []).filter((d) => d !== pendingSource), step.id] } : s));
    }
    saveDefinition(next);
    setCreatingStep(false);
    setPendingSource(null);
    setPendingTarget(null);
  };
  const saveStep = (next: WfStep) => {
    saveDefinition(steps.map((s) => (s.id === next.id ? next : s)));
    setEditing(null);
  };
  const deleteStep = (stepId: string) => {
    saveDefinition(steps.filter((s) => s.id !== stepId).map((s) => ({ ...s, dependsOn: (s.dependsOn ?? []).filter((d) => d !== stepId) })));
    setEditing(null);
  };
  // Canvas authoring: drag node→node adds a dependency; selecting an edge + Delete removes it.
  const onConnectDep = (source: string, target: string) => {
    if (source === target) return;
    const next = steps.map((s) =>
      s.id === target ? { ...s, dependsOn: Array.from(new Set([...(s.dependsOn ?? []), source])) } : s,
    );
    if (hasCycle(next)) return; // reject connections that would create a loop
    saveDefinition(next);
  };
  const onDisconnectDep = (source: string, target: string) =>
    saveDefinition(steps.map((s) => (s.id === target ? { ...s, dependsOn: (s.dependsOn ?? []).filter((d) => d !== source) } : s)));
  const onMoveNode = (stepId: string, x: number, y: number) =>
    saveDefinition(steps.map((s) => (s.id === stepId ? { ...s, position: { x, y } } : s)));
  const onLabelEdge = (source: string, target: string) => {
    const key = `${source}->${target}`;
    const label = window.prompt("Edge label (blank to clear):", def.edgeLabels?.[key] ?? "");
    if (label === null) return;
    const next = { ...(def.edgeLabels ?? {}) };
    if (label.trim()) next[key] = label.trim();
    else delete next[key];
    saveDef({ edgeLabels: next });
  };
  const tidy = () => { saveDefinition(steps.map((s) => ({ ...s, position: undefined }))); setLayoutNonce((n) => n + 1); };
  // Sticky notes (n8n annotations) — free-floating, UI-only, ignored by the engine.
  const addNote = () => saveDef({ notes: [...(def.notes ?? []), { id: `note-${Math.random().toString(36).slice(2, 9)}`, text: "", position: { x: 24, y: 24 } }] });
  const onMoveNote = (noteId: string, x: number, y: number) =>
    saveDef({ notes: (def.notes ?? []).map((n) => (n.id === noteId ? { ...n, position: { x, y } } : n)) });
  const onEditNote = (noteId: string) => {
    const note = (def.notes ?? []).find((n) => n.id === noteId);
    const text = window.prompt("Note text:", note?.text ?? "");
    if (text === null) return;
    saveDef({ notes: (def.notes ?? []).map((n) => (n.id === noteId ? { ...n, text } : n)) });
  };
  const onDeleteNote = (noteId: string) => saveDef({ notes: (def.notes ?? []).filter((n) => n.id !== noteId) });

  // Execute-on-canvas: a live run lights up the nodes and turns step-click into output inspection.
  const runStatusByStep = run ? Object.fromEntries(run.steps.map((s) => [s.stepId, s.status])) : undefined;
  const pausedStep = run?.pausedStepId ? steps.find((s) => s.id === run.pausedStepId) : null;
  const runDone = !run || run.status === "completed" || run.status === "failed";

  return (
    <>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <button onClick={onBack} style={{ background: "none", border: "none", color: tok.inkMuted, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 6 }}>← All workflows</button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontFamily: tok.fontDisplay, fontSize: 28, color: tok.ink, margin: 0 }}>{wf.data.name}</h1>
            <Badge {...statusMeta(wf.data.status)} />
          </div>
          {wf.data.summary && <p style={{ color: tok.inkMuted, fontSize: 14, marginTop: 4 }}>{wf.data.summary}</p>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" onClick={() => publish.mutate({ id })} disabled={publish.isPending || steps.length === 0}>Publish v{Number(wf.data.version || 0) + 1}</Button>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${tok.border}`, marginBottom: 20 }}>
        {(["build", "run", "versions"] as Tab[]).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            style={{ padding: "9px 16px", border: "none", background: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: tok.font, color: tab === tb ? tok.ink : tok.inkMuted, borderBottom: `2px solid ${tab === tb ? tok.accent : "transparent"}`, marginBottom: -1, textTransform: "capitalize" }}
          >
            {tb}
          </button>
        ))}
      </div>

      {tab === "build" && (
        <div style={{ display: "grid", gridTemplateColumns: editing || (editingTrigger && !run) ? "1fr 380px" : "1fr", gap: 18, alignItems: "start" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "inline-flex", background: tok.surfaceAlt, border: `1px solid ${tok.border}`, borderRadius: 999, padding: 3 }}>
                  {(["list", "dag"] as const).map((v) => (
                    <button key={v} onClick={() => setStepView(v)} style={{ padding: "5px 16px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: tok.font, background: stepView === v ? tok.surface : "transparent", color: stepView === v ? tok.ink : tok.inkMuted }}>{v === "list" ? "List" : "DAG"}</button>
                  ))}
                </div>
                {stepView === "dag" && !run && <Button variant="ghost" size="sm" onClick={tidy} title="Auto-arrange the layout">Tidy</Button>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {run && <Badge {...statusMeta(run.status)} />}
                {run?.status === "paused" && pausedStep && (
                  <Button size="sm" onClick={() => resumeRun.mutate({ runId: run.id, approvals: [pausedStep.id] })} disabled={resumeRun.isPending}>Approve “{pausedStep.name ?? pausedStep.id}” →</Button>
                )}
                {runDone && (
                  <Button variant="outline" size="sm" onClick={() => startRun.mutate({ workflowId: id })} disabled={startRun.isPending || steps.length === 0}>{run ? "Run again" : "▶ Run"}</Button>
                )}
                {run && <Button variant="ghost" size="sm" onClick={() => { setRun(null); setEditing(null); }}>Clear run</Button>}
                {stepView === "dag" && !run && <Button variant="outline" onClick={addNote}>+ Note</Button>}
                <Button onClick={addStep} disabled={!!run}>+ Add step</Button>
              </div>
            </div>
            {stepView === "list" ? (
              <StepListView steps={steps} selectedStepId={editing?.id} onSelectStep={(sid) => setEditing(steps.find((s) => s.id === sid) ?? null)} onAddStep={addStep} />
            ) : (
              <>
                <WorkflowCanvas definition={def} selectedStepId={editing?.id} height={520} editable={!run} statusByStep={runStatusByStep} triggerType={wf.data.triggerType} onConnect={onConnectDep} onDisconnect={onDisconnectDep} onAddAfter={addAfter} onMoveNode={onMoveNode} onAddOnEdge={addOnEdge} onLabelEdge={onLabelEdge} edgeLabels={def.edgeLabels} layoutNonce={layoutNonce} notes={def.notes} onMoveNote={onMoveNote} onEditNote={onEditNote} onDeleteNote={onDeleteNote} onSelectStep={(sid) => { setEditingTrigger(false); setEditing(steps.find((s) => s.id === sid) ?? null); }} onSelectTrigger={() => { if (run) return; setEditing(null); setEditingTrigger(true); }} />
                <p style={{ fontSize: 12, color: tok.inkFaint, marginTop: 8 }}>{run ? "Running — click a step to inspect its output. Clear the run to edit the flow again." : "Click the trigger to schedule it or get a webhook URL · drag dot→dot to connect · drag nodes to arrange · + on a node or edge inserts a step · double-click an edge to label it · select an edge + Delete to remove."}</p>
              </>
            )}
          </div>
          {(editing || (editingTrigger && !run)) && (
            <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, background: tok.surface, height: 560, position: "sticky", top: 16, overflow: "hidden" }}>
              {editing ? (
                run ? (
                  <RunStepInspector step={editing} result={run.steps.find((s) => s.stepId === editing.id)} upstream={upstreamFor(editing.id, def, run.steps)} onClose={() => setEditing(null)} />
                ) : (
                  <StepEditor key={editing.id} step={editing} siblings={steps} connectionOptions={connectionOptions} onSave={saveStep} onDelete={() => deleteStep(editing.id)} onCancel={() => setEditing(null)} />
                )
              ) : (
                <TriggerConfigPanel workflowId={id} onClose={() => setEditingTrigger(false)} />
              )}
            </div>
          )}
        </div>
      )}

      {creatingStep && (
        <StepCreatorModal siblings={steps} templates={stepCatalog.data ?? []} afterStepId={pendingSource ?? undefined} connectionOptions={connectionOptions} onCancel={() => { setCreatingStep(false); setPendingSource(null); }} onCreate={createStep} />
      )}

      {tab === "run" && <RunsDashboard workflowId={id} definition={def} triggerType={wf.data.triggerType} />}

      {tab === "versions" && (
        <VersionHistory
          versions={(versions.data ?? []).map((v) => ({ id: v.id, versionNumber: v.versionNumber, name: v.name, summary: v.summary, publishedAt: v.publishedAt as unknown as string, definition: v.definition as WfDefinition }))}
          currentVersionId={wf.data.currentVersionId}
          onRestore={(versionId) => restore.mutate({ workflowId: id, versionId })}
        />
      )}
    </>
  );
}

// Output inspector shown in the right panel when a run is active and a node is clicked.
// ─────────────────────────── runs dashboard (executions) ───────────────────────────

function RunsDashboard({ workflowId, definition, triggerType }: { workflowId: string; definition: WfDefinition; triggerType: string }) {
  const utils = trpc.useUtils();
  const runsQ = trpc.workflows.runs.list.useQuery({ workflowId });
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const runQ = trpc.workflows.runs.get.useQuery({ runId: selectedRunId ?? "" }, { enabled: !!selectedRunId });
  const start = trpc.workflows.runs.start.useMutation({
    onSuccess: (r) => { setSelectedRunId(r.id); void utils.workflows.runs.list.invalidate({ workflowId }); },
  });
  const resume = trpc.workflows.runs.resume.useMutation({
    onSuccess: (r) => { void utils.workflows.runs.get.invalidate({ runId: r.id }); void utils.workflows.runs.list.invalidate({ workflowId }); },
  });
  // ── durable path (the async queue): enqueue a run, drain the queue, approve a parked gate ──
  const refetchRuns = () => {
    void utils.workflows.runs.list.invalidate({ workflowId });
    if (selectedRunId) void utils.workflows.runs.get.invalidate({ runId: selectedRunId });
  };
  const enqueue = trpc.workflows.runs.enqueue.useMutation({
    onSuccess: (r) => { setSelectedRunId(r.runId); void utils.workflows.runs.list.invalidate({ workflowId }); },
  });
  const tick = trpc.workflows.runs.tick.useMutation({ onSuccess: refetchRuns });
  const approveQueued = trpc.workflows.runs.approveQueued.useMutation({ onSuccess: refetchRuns });

  const runs = runsQ.data ?? [];
  useEffect(() => { if (!selectedRunId && runs.length) setSelectedRunId(runs[0]!.id); }, [runs, selectedRunId]);

  const run = runQ.data;
  const statusByStep = run ? Object.fromEntries(run.steps.map((s) => [s.stepId, s.status])) : {};
  const pausedStep = run?.pausedStepId ? definition.steps.find((s) => s.id === run.pausedStepId) : null;
  const busy = start.isPending || resume.isPending || enqueue.isPending || approveQueued.isPending;
  const noSteps = (definition.steps ?? []).length === 0;
  const tickSummary = tick.data
    ? `Processed ${tick.data.results.length} · ${tick.data.results.filter((r) => r.outcome === "done").length} done`
    : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: tok.fontDisplay, fontSize: 18, color: tok.ink }}>Runs</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {tickSummary && <span style={{ fontSize: 11, color: tok.inkFaint }}>{tickSummary}</span>}
          <Button variant="ghost" size="sm" onClick={() => tick.mutate({})} disabled={tick.isPending} title="Advance queued runs now (in prod a cron does this every minute)">{tick.isPending ? "Processing…" : "Process queue"}</Button>
          <Button variant="outline" onClick={() => enqueue.mutate({ workflowId })} disabled={busy || noSteps} title="Run in the background via the durable queue">Queue run</Button>
          <Button onClick={() => start.mutate({ workflowId })} disabled={busy || noSteps}>{busy ? "Running…" : "▶ Start run"}</Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, background: tok.surface, overflow: "hidden" }}>
          {runs.length === 0 ? (
            <div style={{ padding: 18, fontSize: 13, color: tok.inkFaint }}>No runs yet. Start one to see it here.</div>
          ) : (
            runs.map((r) => {
              const on = r.id === selectedRunId;
              return (
                <button key={r.id} onClick={() => setSelectedRunId(r.id)} style={{ display: "block", width: "100%", textAlign: "left", border: "none", borderBottom: `1px solid ${tok.border}`, background: on ? tok.surfaceAlt : "transparent", cursor: "pointer", padding: "10px 12px", fontFamily: tok.font }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <Badge {...statusMeta(r.status)} />
                    <span style={{ fontSize: 11, color: tok.inkFaint, fontVariantNumeric: "tabular-nums" }}>{fmtDuration(r.startedAt, r.finishedAt)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: tok.inkMuted, marginTop: 4 }}>{fmtWhen(r.startedAt)}{r.version ? ` · v${r.version}` : ""}</div>
                </button>
              );
            })
          )}
        </div>

        <div>
          {!run ? (
            <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, background: tok.surface, padding: 24, fontSize: 13, color: tok.inkFaint, textAlign: "center" }}>
              {runsQ.isLoading ? "Loading…" : "Select a run, or start a new one."}
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <Badge {...statusMeta(run.status)} />
                <span style={{ fontSize: 12, color: tok.inkMuted }}>{fmtWhen(run.startedAt)} · {fmtDuration(run.startedAt, run.finishedAt)}</span>
                {run.status === "paused" && pausedStep && (
                  <Button size="sm" onClick={() => resume.mutate({ runId: run.id, approvals: [pausedStep.id] })} disabled={busy}>Approve “{pausedStep.name ?? pausedStep.id}” →</Button>
                )}
                {run.status === "waiting" && pausedStep && (
                  <Button size="sm" onClick={() => approveQueued.mutate({ runId: run.id, approvals: [pausedStep.id] })} disabled={busy} title="Re-arm this queued run; it continues on the next tick">Approve “{pausedStep.name ?? pausedStep.id}” →</Button>
                )}
                {run.status === "queued" && (
                  <span style={{ fontSize: 12, color: tok.inkFaint }}>Queued — runs on the next tick (or “Process queue”).</span>
                )}
              </div>
              <WorkflowCanvas definition={definition} statusByStep={statusByStep} triggerType={triggerType} height={300} />
              <div style={{ marginTop: 14 }}>
                {run.steps.length === 0 ? (
                  <div style={{ fontSize: 13, color: tok.inkFaint }}>No steps recorded.</div>
                ) : (
                  run.steps.map((s) => <RunStepRow key={s.stepId} result={s} definition={definition} allResults={run.steps} />)
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RunStepRow({ result, definition, allResults }: { result: RunStepView; definition: WfDefinition; allResults: RunStepView[] }) {
  const [open, setOpen] = useState(false);
  const meta = stepTypeMeta(result.stepType);
  // The recorded step may reference a definition step that was since renamed/removed — synthesize a
  // minimal one so the inspector still shows its output.
  const defStep = definition.steps.find((s) => s.id === result.stepId)
    ?? ({ id: result.stepId, type: result.stepType, name: result.stepId } as WfStep);
  return (
    <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, marginBottom: 6, background: tok.surface, overflow: "hidden" }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer" }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: meta.color, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, color: tok.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{defStep.name ?? result.stepId}</span>
        {result.error && <span style={{ fontSize: 12, color: tok.danger, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{result.error}</span>}
        {result.durationMs != null && <span style={{ fontSize: 11, color: tok.inkFaint, fontVariantNumeric: "tabular-nums" }}>{fmtMs(result.durationMs)}</span>}
        <Badge {...statusMeta(result.status)} />
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${tok.border}` }}>
          <RunStepInspector step={defStep} result={result} upstream={upstreamFor(result.stepId, definition, allResults)} embedded />
        </div>
      )}
    </div>
  );
}

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtDuration(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return "—";
  return fmtMs(new Date(end).getTime() - new Date(start).getTime());
}
function fmtMs(ms: number): string {
  if (ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}
