// WorkflowCanvas — an xyflow + dagre DAG of a workflow's steps (left→right). Prop-driven and
// read-friendly: pass a definition, optionally a per-step run status (to light it up during a
// run), and a selected step. `@xyflow/react` + `dagre` are peer deps the app provides; the app
// also imports `@xyflow/react/dist/style.css` once.
//
// Uncontrolled (defaultNodes/defaultEdges) inside a ReactFlowProvider, remounted via a `key`
// derived from the inputs — React Flow then owns node measurement, which is what lets edges
// route (controlled nodes without measurement write-back leave edges unrendered).
import { useMemo } from 'react';
import dagre from 'dagre';
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
} from '@xyflow/react';
import { statusMeta, stepTypeMeta, tok } from './theme';
import type { WfDefinition } from './types';

const NODE_W = 212;
const NODE_H = 66;

function StepNode({ data }: NodeProps) {
  const d = data as { label: string; type: string; status?: string; selected?: boolean };
  const meta = stepTypeMeta(d.type);
  const statusColor = d.status ? statusMeta(d.status).color : null;
  return (
    <div
      style={{
        width: NODE_W, minHeight: NODE_H, boxSizing: 'border-box', borderRadius: 12,
        background: 'var(--wf-surface, #fff)',
        border: `1px solid ${d.selected ? meta.color : 'var(--wf-border, #E7E5E0)'}`,
        borderLeft: `4px solid ${meta.color}`,
        boxShadow: d.selected ? `0 0 0 2px ${meta.color}33` : '0 1px 2px rgba(0,0,0,.05)',
        padding: '9px 12px', cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: meta.color, border: 'none', width: 7, height: 7 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: meta.color }}>{meta.label}</span>
        {statusColor && <span style={{ width: 8, height: 8, borderRadius: 999, background: statusColor }} />}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: tok.ink, marginTop: 3, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {d.label}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: meta.color, border: 'none', width: 7, height: 7 }} />
    </div>
  );
}

const nodeTypes = { step: StepNode } as const;

export interface WorkflowCanvasProps {
  definition: WfDefinition;
  statusByStep?: Record<string, string>;
  selectedStepId?: string | null;
  onSelectStep?: (stepId: string) => void;
  height?: number;
}

function CanvasInner({ definition, statusByStep, selectedStepId, onSelectStep, height = 460 }: WorkflowCanvasProps) {
  const built = useMemo(() => layout(definition, statusByStep, selectedStepId), [definition, statusByStep, selectedStepId]);
  const empty = (definition.steps ?? []).length === 0;
  return (
    <div style={{ height, width: '100%', background: tok.surfaceAlt, borderRadius: tok.radius, overflow: 'hidden', position: 'relative' }}>
      {empty ? (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: tok.inkFaint, fontSize: 14 }}>
          No steps yet — add the first step to see the graph.
        </div>
      ) : (
        <ReactFlow
          defaultNodes={built.nodes}
          defaultEdges={built.edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_e, n) => onSelectStep?.(n.id)}
        >
          <Background color={'var(--wf-border, #E7E5E0)'} gap={18} />
          <Controls showInteractive={false} />
        </ReactFlow>
      )}
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  const sig = useMemo(
    () =>
      JSON.stringify({
        s: (props.definition.steps ?? []).map((s) => [s.id, s.type, s.name, s.dependsOn ?? []]),
        st: props.statusByStep ?? null,
        sel: props.selectedStepId ?? null,
      }),
    [props.definition, props.statusByStep, props.selectedStepId],
  );
  return (
    <ReactFlowProvider>
      <CanvasInner key={sig} {...props} />
    </ReactFlowProvider>
  );
}

function layout(def: WfDefinition, statusByStep?: Record<string, string>, selectedStepId?: string | null) {
  const steps = def.steps ?? [];
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 26, ranksep: 64 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const s of steps) g.setNode(s.id, { width: NODE_W, height: NODE_H });

  const edges: Edge[] = [];
  const ids = new Set(steps.map((s) => s.id));
  const hasDeps = steps.some((s) => (s.dependsOn ?? []).length > 0);
  steps.forEach((s, i) => {
    const deps = hasDeps ? s.dependsOn ?? [] : i > 0 ? [steps[i - 1]!.id] : [];
    for (const dep of deps) {
      if (!ids.has(dep)) continue;
      g.setEdge(dep, s.id);
      edges.push({
        id: `${dep}->${s.id}`, source: dep, target: s.id, type: 'smoothstep',
        animated: statusByStep?.[s.id] === 'running',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#A8A29E' },
        style: { stroke: '#A8A29E', strokeWidth: 1.5 },
      });
    }
  });

  dagre.layout(g);
  const nodes: Node[] = steps.map((s) => {
    const p = g.node(s.id);
    return {
      id: s.id,
      type: 'step',
      position: { x: (p?.x ?? 0) - NODE_W / 2, y: (p?.y ?? 0) - NODE_H / 2 },
      width: NODE_W,
      height: NODE_H,
      data: { label: s.name ?? s.id, type: s.type, status: statusByStep?.[s.id], selected: s.id === selectedStepId },
    };
  });
  return { nodes, edges };
}
