// WorkflowCanvas — an xyflow + dagre DAG of a workflow's steps (left→right). Read mode just
// renders the flow; `editable` mode turns the canvas into an authoring surface, the n8n way:
// drag from one node's right handle to another's left handle to add a dependency, and select an
// edge + press Delete to remove it. A pill "trigger" node marks where the flow starts.
//
// Uncontrolled (defaultNodes/defaultEdges) inside a ReactFlowProvider, remounted via a `key`
// derived from the inputs — React Flow then owns node measurement, which is what lets edges
// route. onConnect/onEdgesDelete fire on the uncontrolled instance; we lift them to the parent,
// which rewrites `dependsOn` and re-renders (a fresh key remounts with the new edges).
import { useMemo } from 'react';
import dagre from 'dagre';
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { statusMeta, stepTypeMeta, tok } from './theme';
import type { WfDefinition, WfNote } from './types';

const NODE_W = 212;
const NODE_H = 66;
const TRIGGER_W = 150;
const TRIGGER_ID = '__trigger__';
const TRIGGER_COLOR = '#6D28D9';

function StepNode({ id, data }: NodeProps) {
  const d = data as { label: string; type: string; status?: string; selected?: boolean; editable?: boolean; onAddAfter?: (id: string) => void };
  const meta = stepTypeMeta(d.type);
  const statusColor = d.status ? statusMeta(d.status).color : null;
  return (
    <div
      style={{
        width: NODE_W, minHeight: NODE_H, boxSizing: 'border-box', borderRadius: 12, position: 'relative',
        background: 'var(--wf-surface, #fff)',
        border: `1px solid ${d.selected ? meta.color : 'var(--wf-border, #E7E5E0)'}`,
        borderLeft: `4px solid ${meta.color}`,
        boxShadow: d.selected ? `0 0 0 2px ${meta.color}33` : '0 1px 2px rgba(0,0,0,.05)',
        padding: '9px 12px', cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: meta.color, border: 'none', width: 8, height: 8 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: meta.color }}>{meta.label}</span>
        {statusColor && <span style={{ width: 8, height: 8, borderRadius: 999, background: statusColor }} />}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: tok.ink, marginTop: 3, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {d.label}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: meta.color, border: 'none', width: 8, height: 8 }} />
      {d.editable && d.onAddAfter && (
        <button
          title="Add a step after this"
          onClick={(e) => { e.stopPropagation(); d.onAddAfter!(id); }}
          style={{ position: 'absolute', right: -30, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, borderRadius: 999, border: `1px solid ${meta.color}`, background: 'var(--wf-surface, #fff)', color: meta.color, cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'grid', placeItems: 'center', padding: 0, zIndex: 5 }}
          className="nodrag nopan"
        >
          +
        </button>
      )}
    </div>
  );
}

function TriggerNode({ data }: NodeProps) {
  const d = data as { triggerType?: string };
  return (
    <div style={{ width: TRIGGER_W, minHeight: NODE_H, boxSizing: 'border-box', borderRadius: 999, background: 'var(--wf-surface, #fff)', border: `1px solid ${TRIGGER_COLOR}`, borderLeft: `4px solid ${TRIGGER_COLOR}`, padding: '9px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: TRIGGER_COLOR }}>Trigger</span>
      <div style={{ fontSize: 13, fontWeight: 600, color: tok.ink, marginTop: 2, textTransform: 'capitalize' }}>{d.triggerType ?? 'manual'}</div>
      <Handle type="source" position={Position.Right} style={{ background: TRIGGER_COLOR, border: 'none', width: 8, height: 8 }} />
    </div>
  );
}

function NoteNode({ id, data }: NodeProps) {
  const d = data as { text: string; editable?: boolean; onEdit?: (id: string) => void; onDelete?: (id: string) => void };
  return (
    <div
      onDoubleClick={(e) => { e.stopPropagation(); if (d.editable) d.onEdit?.(id); }}
      style={{ width: 184, minHeight: 70, boxSizing: 'border-box', background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', fontSize: 12, lineHeight: 1.4, color: '#713F12', whiteSpace: 'pre-wrap', wordBreak: 'break-word', position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,.06)', cursor: d.editable ? 'move' : 'default' }}
    >
      {d.text || (d.editable ? 'Double-click to edit…' : '')}
      {d.editable && (
        <button
          className="nodrag nopan"
          title="Delete note"
          onClick={(e) => { e.stopPropagation(); d.onDelete?.(id); }}
          style={{ position: 'absolute', top: 2, right: 4, background: 'none', border: 'none', color: '#A16207', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 2 }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

const nodeTypes = { step: StepNode, trigger: TriggerNode, note: NoteNode } as const;

interface EdgeData {
  editable?: boolean;
  label?: string;
  synthetic?: boolean;
  onAddOnEdge?: (source: string, target: string) => void;
  onLabelEdge?: (source: string, target: string) => void;
}

// A connection that (in editable mode) carries an optional label and a midpoint "+" to insert a
// step between the two it links. Read mode / synthetic trigger edges render as a plain line.
function EditableEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps) {
  const d = (data ?? {}) as EdgeData;
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const interactive = d.editable && !d.synthetic;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {(d.label || interactive) && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan" style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all', display: 'flex', alignItems: 'center', gap: 4 }}>
            {d.label && (
              <span
                onClick={(e) => { e.stopPropagation(); if (interactive) d.onLabelEdge?.(source, target); }}
                title={interactive ? 'Edit label' : undefined}
                style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: 'var(--wf-surface, #fff)', border: '1px solid #D6D3CE', color: '#57534E', cursor: interactive ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
              >
                {d.label}
              </span>
            )}
            {interactive && (
              <button
                title="Insert a step here"
                onClick={(e) => { e.stopPropagation(); d.onAddOnEdge?.(source, target); }}
                style={{ width: 18, height: 18, borderRadius: 999, border: '1px solid #A8A29E', background: 'var(--wf-surface, #fff)', color: '#57534E', cursor: 'pointer', fontSize: 12, lineHeight: 1, display: 'grid', placeItems: 'center', padding: 0 }}
              >
                +
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { wf: EditableEdge } as const;

export interface WorkflowCanvasProps {
  definition: WfDefinition;
  statusByStep?: Record<string, string>;
  selectedStepId?: string | null;
  onSelectStep?: (stepId: string) => void;
  /** Clicking the trigger node (e.g. to open the trigger config). */
  onSelectTrigger?: () => void;
  height?: number;
  editable?: boolean;
  triggerType?: string;
  onConnect?: (source: string, target: string) => void;
  onDisconnect?: (source: string, target: string) => void;
  onAddAfter?: (sourceStepId: string) => void;
  onMoveNode?: (stepId: string, x: number, y: number) => void;
  edgeLabels?: Record<string, string>;
  onAddOnEdge?: (source: string, target: string) => void;
  onLabelEdge?: (source: string, target: string) => void;
  /** Bump to force a fresh auto-layout (e.g. the Tidy button clears manual positions). */
  layoutNonce?: number;
  notes?: WfNote[];
  onMoveNote?: (noteId: string, x: number, y: number) => void;
  onEditNote?: (noteId: string) => void;
  onDeleteNote?: (noteId: string) => void;
}

function CanvasInner({ definition, statusByStep, selectedStepId, onSelectStep, onSelectTrigger, height = 460, editable, triggerType, onConnect, onDisconnect, onAddAfter, onMoveNode, edgeLabels, onAddOnEdge, onLabelEdge, notes, onMoveNote, onEditNote, onDeleteNote }: WorkflowCanvasProps) {
  const built = useMemo(
    () => layout(definition, { statusByStep, selectedStepId, editable, triggerType, edgeLabels, onAddAfter, onAddOnEdge, onLabelEdge, notes, onEditNote, onDeleteNote }),
    [definition, statusByStep, selectedStepId, editable, triggerType, edgeLabels, onAddAfter, onAddOnEdge, onLabelEdge, notes, onEditNote, onDeleteNote],
  );
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
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={!!editable}
          nodesConnectable={!!editable}
          edgesFocusable={!!editable}
          deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
          isValidConnection={(c) => c.source !== c.target}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_e, n) => { if (n.id === TRIGGER_ID) onSelectTrigger?.(); else onSelectStep?.(n.id); }}
          onNodeDragStop={(_e, n) => {
            if (!editable) return;
            const x = Math.round(n.position.x), y = Math.round(n.position.y);
            if (n.type === 'note') onMoveNote?.(n.id, x, y);
            else if (n.id !== TRIGGER_ID) onMoveNode?.(n.id, x, y);
          }}
          onConnect={(c: Connection) => { if (editable && c.source && c.target && c.source !== TRIGGER_ID && c.source !== c.target) onConnect?.(c.source, c.target); }}
          onEdgesDelete={(eds: Edge[]) => { if (editable) for (const e of eds) if (e.source !== TRIGGER_ID) onDisconnect?.(e.source, e.target); }}
          onEdgeDoubleClick={(_e, edge) => { if (editable && !(edge.data as EdgeData | undefined)?.synthetic) onLabelEdge?.(edge.source, edge.target); }}
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
        e: !!props.editable,
        tt: props.triggerType ?? null,
        el: props.edgeLabels ?? null,
        n: props.layoutNonce ?? 0,
        nt: (props.notes ?? []).map((nn) => [nn.id, nn.text]),
      }),
    [props.definition, props.statusByStep, props.selectedStepId, props.editable, props.triggerType, props.edgeLabels, props.layoutNonce, props.notes],
  );
  return (
    <ReactFlowProvider>
      <CanvasInner key={sig} {...props} />
    </ReactFlowProvider>
  );
}

function mkEdge(
  source: string,
  target: string,
  opts: { statusByStep?: Record<string, string>; synthetic?: boolean; editable?: boolean; label?: string; onAddOnEdge?: (s: string, t: string) => void; onLabelEdge?: (s: string, t: string) => void },
): Edge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    type: 'wf',
    animated: opts.statusByStep?.[target] === 'running',
    deletable: !opts.synthetic,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#A8A29E' },
    style: { stroke: '#A8A29E', strokeWidth: 1.5, ...(opts.synthetic ? { strokeDasharray: '4 4' } : {}) },
    data: { editable: !!opts.editable, label: opts.label, synthetic: !!opts.synthetic, onAddOnEdge: opts.onAddOnEdge, onLabelEdge: opts.onLabelEdge },
  };
}

function layout(
  def: WfDefinition,
  opts: {
    statusByStep?: Record<string, string>;
    selectedStepId?: string | null;
    editable?: boolean;
    triggerType?: string;
    edgeLabels?: Record<string, string>;
    onAddAfter?: (sourceStepId: string) => void;
    onAddOnEdge?: (source: string, target: string) => void;
    onLabelEdge?: (source: string, target: string) => void;
    notes?: WfNote[];
    onEditNote?: (noteId: string) => void;
    onDeleteNote?: (noteId: string) => void;
  },
) {
  const { statusByStep, selectedStepId, editable, triggerType, edgeLabels, onAddAfter, onAddOnEdge, onLabelEdge, notes, onEditNote, onDeleteNote } = opts;
  const steps = def.steps ?? [];
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 26, ranksep: 64 });
  g.setDefaultEdgeLabel(() => ({}));

  const showTrigger = !!triggerType && steps.length > 0;
  if (showTrigger) g.setNode(TRIGGER_ID, { width: TRIGGER_W, height: NODE_H });
  for (const s of steps) g.setNode(s.id, { width: NODE_W, height: NODE_H });

  const edges: Edge[] = [];
  const ids = new Set(steps.map((s) => s.id));
  const hasDeps = steps.some((s) => (s.dependsOn ?? []).length > 0);
  const rootIds: string[] = [];
  steps.forEach((s, i) => {
    // editable mode shows only explicit dependencies; read mode falls back to a linear chain
    const deps = (editable || hasDeps ? s.dependsOn ?? [] : i > 0 ? [steps[i - 1]!.id] : []).filter((d) => ids.has(d));
    if (deps.length === 0) rootIds.push(s.id);
    for (const dep of deps) {
      g.setEdge(dep, s.id);
      edges.push(mkEdge(dep, s.id, { statusByStep, editable, label: edgeLabels?.[`${dep}->${s.id}`], onAddOnEdge, onLabelEdge }));
    }
  });
  if (showTrigger) {
    for (const r of rootIds) {
      g.setEdge(TRIGGER_ID, r);
      edges.push(mkEdge(TRIGGER_ID, r, { statusByStep, synthetic: true }));
    }
  }

  dagre.layout(g);
  const nodes: Node[] = [];
  if (showTrigger) {
    const p = g.node(TRIGGER_ID);
    nodes.push({
      id: TRIGGER_ID, type: 'trigger',
      position: { x: (p?.x ?? 0) - TRIGGER_W / 2, y: (p?.y ?? 0) - NODE_H / 2 },
      width: TRIGGER_W, height: NODE_H, connectable: false, deletable: false, draggable: false,
      data: { triggerType },
    });
  }
  for (const s of steps) {
    const p = g.node(s.id);
    // manual position wins; otherwise dagre's auto-layout slot
    const position = s.position ?? { x: (p?.x ?? 0) - NODE_W / 2, y: (p?.y ?? 0) - NODE_H / 2 };
    nodes.push({
      id: s.id, type: 'step',
      position,
      width: NODE_W, height: NODE_H,
      data: { label: s.name ?? s.id, type: s.type, status: statusByStep?.[s.id], selected: s.id === selectedStepId, editable: !!editable, onAddAfter },
    });
  }
  for (const note of notes ?? []) {
    nodes.push({
      id: note.id, type: 'note',
      position: note.position,
      width: 184, height: 70, connectable: false, draggable: !!editable, selectable: false,
      data: { text: note.text, editable: !!editable, onEdit: onEditNote, onDelete: onDeleteNote },
    });
  }
  return { nodes, edges };
}
