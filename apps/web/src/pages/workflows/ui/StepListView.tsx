// StepListView — the "List" side of a workflow's List ⇆ DAG toggle: its steps as a table
// (type, name, runs-after, checks). Click a row to edit; add a step inline.
import { Badge, Button, stepTypeMeta, tok } from './theme';
import type { WfStep } from './types';

export interface StepListViewProps {
  steps: WfStep[];
  selectedStepId?: string | null;
  onSelectStep: (stepId: string) => void;
  onAddStep?: () => void;
}

export function StepListView({ steps, selectedStepId, onSelectStep, onAddStep }: StepListViewProps) {
  return (
    <div>
      {steps.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', border: `1px dashed ${tok.border}`, borderRadius: tok.radius, color: tok.inkMuted, background: tok.surface }}>
          <div style={{ marginBottom: 12, fontSize: 14 }}>No steps yet.</div>
          {onAddStep && <Button onClick={onAddStep}>+ Add the first step</Button>}
        </div>
      ) : (
        <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, overflow: 'hidden', background: tok.surface }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: tok.surfaceAlt }}>
                {['#', 'Type', 'Step', 'Runs after', 'Checks'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 14px', color: tok.inkMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${tok.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {steps.map((s, i) => {
                const meta = stepTypeMeta(s.type);
                const deps = (s.dependsOn ?? []).map((d) => steps.find((x) => x.id === d)?.name ?? d);
                const checks = (s.outputs ?? []).reduce((n, o) => n + o.verifications.length, 0);
                const selected = s.id === selectedStepId;
                return (
                  <tr
                    key={s.id}
                    onClick={() => onSelectStep(s.id)}
                    style={{ cursor: 'pointer', borderBottom: `1px solid ${tok.border}`, background: selected ? tok.accentSoft : 'transparent' }}
                  >
                    <td style={{ padding: '10px 14px', color: tok.inkFaint, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                    <td style={{ padding: '10px 14px' }}><Badge label={meta.label} color={meta.color} /></td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: tok.ink }}>{s.name ?? s.id}</td>
                    <td style={{ padding: '10px 14px', color: tok.inkMuted }}>{deps.length ? deps.join(', ') : '—'}</td>
                    <td style={{ padding: '10px 14px', color: tok.inkMuted }}>{checks || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {steps.length > 0 && onAddStep && (
        <div style={{ marginTop: 12 }}><Button variant="outline" onClick={onAddStep}>+ Add step</Button></div>
      )}
    </div>
  );
}
