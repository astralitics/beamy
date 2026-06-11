import { useState } from "react";
import "@xyflow/react/dist/style.css";
import { trpc } from "../lib/trpc";
import { PageHeader } from "../components/ui";
import { StepCatalog, StepDetail } from "./steps";
import {
  Badge,
  Button,
  RunWizard,
  StepCreatorModal,
  StepEditor,
  StepListView,
  VersionHistory,
  WorkflowCanvas,
  WorkflowCreatorWizard,
  WorkflowListView,
  statusMeta,
  tok,
  type RunView,
  type VersionView,
  type WfDefinition,
  type WfStep,
  type WorkflowSummary,
} from "./workflows/ui";

function uid() {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return `step-${c?.randomUUID ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;
}

export default function WorkflowsPage() {
  const [section, setSection] = useState<"workflows" | "steps">("workflows");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const inDetail = (section === "workflows" && !!openId) || (section === "steps" && !!openStepId);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10">
      {!inDetail && (
        <div style={{ display: "inline-flex", background: tok.surfaceAlt, border: `1px solid ${tok.border}`, borderRadius: 999, padding: 3, marginBottom: 20 }}>
          {(["workflows", "steps"] as const).map((s) => (
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
      ) : openStepId ? (
        <StepDetail id={openStepId} onBack={() => setOpenStepId(null)} />
      ) : (
        <StepCatalog onOpen={setOpenStepId} />
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
          busy={create.isPending}
          onCancel={() => setCreating(false)}
          onCreate={(input) =>
            create.mutate({
              name: input.name,
              summary: input.summary,
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
  const [stepView, setStepView] = useState<"list" | "dag">("list");
  const [editing, setEditing] = useState<WfStep | null>(null);
  const [creatingStep, setCreatingStep] = useState(false);
  const [run, setRun] = useState<RunView | null>(null);

  const versions = trpc.workflows.listVersions.useQuery({ workflowId: id }, { enabled: tab === "versions" });
  const stepCatalog = trpc.workflows.stepTemplates.list.useQuery();

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

  const saveDefinition = (nextSteps: WfStep[]) =>
    updateDraft.mutate({ id, patch: { definition: { name: def.name, steps: nextSteps } } });

  const addStep = () => setCreatingStep(true);
  const createStep = (draft: Omit<WfStep, "id">) => {
    const step: WfStep = { id: uid(), ...draft };
    saveDefinition([...steps, step]);
    setCreatingStep(false);
  };
  const saveStep = (next: WfStep) => {
    saveDefinition(steps.map((s) => (s.id === next.id ? next : s)));
    setEditing(null);
  };
  const deleteStep = (stepId: string) => {
    saveDefinition(steps.filter((s) => s.id !== stepId).map((s) => ({ ...s, dependsOn: (s.dependsOn ?? []).filter((d) => d !== stepId) })));
    setEditing(null);
  };

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
        <div style={{ display: "grid", gridTemplateColumns: editing ? "1fr 380px" : "1fr", gap: 18, alignItems: "start" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "inline-flex", background: tok.surfaceAlt, border: `1px solid ${tok.border}`, borderRadius: 999, padding: 3 }}>
                {(["list", "dag"] as const).map((v) => (
                  <button key={v} onClick={() => setStepView(v)} style={{ padding: "5px 16px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: tok.font, background: stepView === v ? tok.surface : "transparent", color: stepView === v ? tok.ink : tok.inkMuted }}>{v === "list" ? "List" : "DAG"}</button>
                ))}
              </div>
              <Button onClick={addStep}>+ Add step</Button>
            </div>
            {stepView === "list" ? (
              <StepListView steps={steps} selectedStepId={editing?.id} onSelectStep={(sid) => setEditing(steps.find((s) => s.id === sid) ?? null)} onAddStep={addStep} />
            ) : (
              <WorkflowCanvas definition={def} selectedStepId={editing?.id} height={520} onSelectStep={(sid) => setEditing(steps.find((s) => s.id === sid) ?? null)} />
            )}
          </div>
          {editing && (
            <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, background: tok.surface, height: 560, position: "sticky", top: 16 }}>
              <StepEditor key={editing.id} step={editing} siblings={steps} onSave={saveStep} onDelete={() => deleteStep(editing.id)} onCancel={() => setEditing(null)} />
            </div>
          )}
        </div>
      )}

      {creatingStep && (
        <StepCreatorModal siblings={steps} templates={stepCatalog.data ?? []} onCancel={() => setCreatingStep(false)} onCreate={createStep} />
      )}

      {tab === "run" && (
        <RunWizard
          definition={def}
          run={run}
          busy={startRun.isPending || resumeRun.isPending}
          onStart={() => startRun.mutate({ workflowId: id })}
          onApprove={(stepId) => run && resumeRun.mutate({ runId: run.id, approvals: [stepId] })}
        />
      )}

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
