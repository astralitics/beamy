// WorkflowListView — the index. A real <table> of workflows (per the chassis "tables over tiles"
// preference) with a List ⇆ DAG toggle: List shows the table; DAG shows the selected workflow's
// graph. Prop-driven — the app supplies rows + the selected definition + callbacks.
import { useState } from 'react';
import { Badge, Button, statusMeta, tok } from './theme';
import { WorkflowCanvas } from './WorkflowCanvas';
import type { WfDefinition, WorkflowSummary } from './types';

export interface WorkflowListViewProps {
  workflows: WorkflowSummary[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onRun?: (id: string) => void;
  /** For the DAG tab: the definition of the focused workflow (the app loads it on select). */
  focusedId?: string | null;
  focusedDefinition?: WfDefinition | null;
  onFocus?: (id: string) => void;
}

export function WorkflowListView({
  workflows, onOpen, onCreate, onRun, focusedId, focusedDefinition, onFocus,
}: WorkflowListViewProps) {
  const [view, setView] = useState<'list' | 'dag'>('list');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <Toggle view={view} onChange={setView} />
        <Button onClick={onCreate}>+ New workflow</Button>
      </div>

      {view === 'list' ? (
        workflows.length === 0 ? (
          <Empty onCreate={onCreate} />
        ) : (
          <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, overflow: 'hidden', background: tok.surface }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: tok.surfaceAlt }}>
                  {['Workflow', 'Status', 'Version', 'Trigger', 'Steps', 'Last run', ''].map((h, i) => (
                    <th key={h || i} style={{ textAlign: i > 1 && i < 6 ? 'center' : 'left', padding: '10px 14px', color: tok.inkMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${tok.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workflows.map((w) => (
                  <tr
                    key={w.id}
                    onClick={() => onOpen(w.id)}
                    style={{ cursor: 'pointer', borderBottom: `1px solid ${tok.border}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = tok.surfaceAlt)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontWeight: 600, color: tok.ink, fontFamily: tok.fontDisplay, fontSize: 15 }}>{w.name}</div>
                      {w.summary && <div style={{ color: tok.inkFaint, fontSize: 12, marginTop: 2 }}>{w.summary}</div>}
                    </td>
                    <td style={{ padding: '11px 14px' }}><Badge {...statusMeta(w.status)} /></td>
                    <td style={{ padding: '11px 14px', textAlign: 'center', color: tok.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{w.status === 'draft' ? '—' : `v${w.version}`}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'center', color: tok.inkMuted, textTransform: 'capitalize' }}>{w.triggerType}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'center', color: tok.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{w.stepCount ?? '—'}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                      {w.lastRun ? <Badge {...statusMeta(w.lastRun.status)} /> : <span style={{ color: tok.inkFaint }}>never</span>}
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      {onRun && <Button size="sm" variant="outline" onClick={() => onRun(w.id)}>Run</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <DagTab workflows={workflows} focusedId={focusedId} focusedDefinition={focusedDefinition} onFocus={onFocus} onOpen={onOpen} />
      )}
    </div>
  );
}

function Toggle({ view, onChange }: { view: 'list' | 'dag'; onChange: (v: 'list' | 'dag') => void }) {
  return (
    <div style={{ display: 'inline-flex', background: tok.surfaceAlt, border: `1px solid ${tok.border}`, borderRadius: 999, padding: 3 }}>
      {(['list', 'dag'] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          style={{
            padding: '5px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: tok.font,
            background: view === v ? tok.surface : 'transparent', color: view === v ? tok.ink : tok.inkMuted,
            boxShadow: view === v ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
          }}
        >
          {v === 'list' ? 'List' : 'DAG'}
        </button>
      ))}
    </div>
  );
}

function DagTab({ workflows, focusedId, focusedDefinition, onFocus, onOpen }: {
  workflows: WorkflowSummary[]; focusedId?: string | null; focusedDefinition?: WfDefinition | null;
  onFocus?: (id: string) => void; onOpen: (id: string) => void;
}) {
  const active = focusedId ?? workflows[0]?.id ?? null;
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {workflows.map((w) => (
          <button
            key={w.id}
            onClick={() => onFocus?.(w.id)}
            style={{
              padding: '6px 13px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: tok.font,
              border: `1px solid ${active === w.id ? tok.accent : tok.border}`,
              background: active === w.id ? tok.accentSoft : tok.surface,
              color: active === w.id ? tok.accent : tok.inkMuted,
            }}
          >
            {w.name}
          </button>
        ))}
      </div>
      {focusedDefinition ? (
        <WorkflowCanvas definition={focusedDefinition} height={500} onSelectStep={() => active && onOpen(active)} />
      ) : (
        <div style={{ height: 500, display: 'grid', placeItems: 'center', color: tok.inkFaint, background: tok.surfaceAlt, borderRadius: tok.radius }}>
          Select a workflow to view its graph.
        </div>
      )}
    </div>
  );
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 24px', border: `1px dashed ${tok.border}`, borderRadius: tok.radius, background: tok.surface }}>
      <div style={{ fontFamily: tok.fontDisplay, fontSize: 22, color: tok.ink, marginBottom: 6 }}>No workflows yet</div>
      <div style={{ color: tok.inkMuted, fontSize: 14, marginBottom: 18 }}>Build your firm's repeatable processes — step by step, testable, versioned.</div>
      <Button onClick={onCreate}>+ Create your first workflow</Button>
    </div>
  );
}
