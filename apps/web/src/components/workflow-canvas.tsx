import { useMemo } from "react";
import dagre from "dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { StepType, WorkflowDef, WorkflowStep } from "../data/workflows";

/**
 * Read-only horizontal DAG canvas for a workflow. Built with React Flow +
 * dagre (the same stack Cadenza uses), but laid out left→right (`rankdir: LR`)
 * so a flow reads as a horizontal pipeline. Pan + zoom only — no editing —
 * since these are illustrative sample flows for now.
 *
 * Styled with Beamy's tokens (ink/paper); each step type gets a colored chip +
 * left border so the graph is scannable at a glance.
 */

const NODE_WIDTH = 216;
const NODE_HEIGHT = 76;

const TYPE_META: Record<
  StepType,
  { label: string; chip: string; border: string; dot: string }
> = {
  trigger: { label: "Trigger", chip: "bg-sky-50 text-sky-700", border: "border-l-sky-400", dot: "#38bdf8" },
  task: { label: "Task", chip: "bg-slate-100 text-slate-700", border: "border-l-slate-400", dot: "#94a3b8" },
  approval: { label: "Approval", chip: "bg-amber-50 text-amber-700", border: "border-l-amber-400", dot: "#fbbf24" },
  automation: { label: "Automation", chip: "bg-emerald-50 text-emerald-700", border: "border-l-emerald-400", dot: "#34d399" },
  ai: { label: "AI", chip: "bg-violet-50 text-violet-700", border: "border-l-violet-400", dot: "#a78bfa" },
  notification: { label: "Notify", chip: "bg-blue-50 text-blue-700", border: "border-l-blue-400", dot: "#60a5fa" },
};

interface StepNodeData extends Record<string, unknown> {
  step: WorkflowStep;
}
type StepNode = Node<StepNodeData, "step">;

function StepNode({ data }: NodeProps<StepNode>) {
  const step = data.step;
  const meta = TYPE_META[step.type];
  return (
    <div
      className={`flex flex-col gap-1 rounded-xl border border-l-4 border-ink-200 bg-white p-3 shadow-sm ${meta.border}`}
      style={{ width: NODE_WIDTH }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-ink-300 !bg-white" />
      <span
        className={`inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.chip}`}
      >
        {meta.label}
      </span>
      <div className="text-[13px] font-semibold leading-snug text-ink-900">{step.name}</div>
      {step.detail ? (
        <div className="truncate text-[11px] text-ink-400" title={step.detail}>
          {step.detail}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-ink-300 !bg-white" />
    </div>
  );
}

const nodeTypes = { step: StepNode } as const;

function buildGraph(steps: WorkflowStep[]): { nodes: StepNode[]; edges: Edge[] } {
  const ids = new Set(steps.map((s) => s.id));
  const edges: Edge[] = [];
  for (const s of steps) {
    for (const dep of s.dependsOn) {
      if (!ids.has(dep)) continue;
      edges.push({
        id: `${dep}->${s.id}`,
        source: dep,
        target: s.id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#a1a1aa" },
        style: { stroke: "#a1a1aa", strokeWidth: 1.5 },
      });
    }
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 64 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const s of steps) g.setNode(s.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const nodes: StepNode[] = steps.map((s) => {
    const pos = g.node(s.id);
    return {
      id: s.id,
      type: "step",
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: { step: s },
      // Give React Flow explicit dimensions so edges route immediately instead
      // of waiting on a ResizeObserver measurement (which races on lazy mount
      // and can leave edges unrendered).
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });
  return { nodes, edges };
}

function CanvasInner({ workflow }: { workflow: WorkflowDef }) {
  const built = useMemo(() => buildGraph(workflow.steps), [workflow]);

  // Uncontrolled (defaultNodes/defaultEdges) — React Flow owns measurement and
  // fit. The `key` on <WorkflowCanvas> (set by the page) remounts cleanly per
  // workflow, so there's no stale state to sync via effects.
  return (
    <ReactFlow
      defaultNodes={built.nodes}
      defaultEdges={built.edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      nodesConnectable={false}
      edgesFocusable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={18} size={1} color="#e4e4e7" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function WorkflowCanvas({ workflow }: { workflow: WorkflowDef }) {
  return (
    <ReactFlowProvider>
      <CanvasInner workflow={workflow} />
    </ReactFlowProvider>
  );
}

export default WorkflowCanvas;
