// RunWizard — execute a workflow and watch it advance. Automated steps auto-run; the wizard
// pauses at a human gate with an Approve action, then resumes to a success/failure end state.
// Prop-driven: the app calls startRun/resumeRun and feeds the resulting RunView back in.
import { Badge, Button, statusMeta, stepTypeMeta, tok } from './theme';
import { WorkflowCanvas } from './WorkflowCanvas';
import type { RunView, WfDefinition } from './types';

export interface RunWizardProps {
  definition: WfDefinition;
  run: RunView | null;
  onStart: () => void;
  onApprove: (stepId: string) => void;
  busy?: boolean;
}

export function RunWizard({ definition, run, onStart, onApprove, busy }: RunWizardProps) {
  const statusByStep = run ? Object.fromEntries(run.steps.map((s) => [s.stepId, s.status])) : {};
  const pausedStep = run?.pausedStepId ? definition.steps.find((s) => s.id === run.pausedStepId) : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: tok.fontDisplay, fontSize: 18, color: tok.ink }}>Run</span>
          {run && <Badge {...statusMeta(run.status)} />}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(!run || run.status === 'completed' || run.status === 'failed') && (
            <Button onClick={onStart} disabled={busy}>{run ? 'Run again' : 'Start run'}</Button>
          )}
          {run?.status === 'paused' && pausedStep && (
            <Button onClick={() => onApprove(pausedStep.id)} disabled={busy}>Approve “{pausedStep.name ?? pausedStep.id}” →</Button>
          )}
        </div>
      </div>

      {run?.status === 'paused' && pausedStep && (
        <Banner color="#D97706" text={`Waiting on a person at “${pausedStep.name ?? pausedStep.id}”. Approve to continue.`} />
      )}
      {run?.status === 'completed' && <Banner color="#16A34A" text="Run completed — every step finished." />}
      {run?.status === 'failed' && <Banner color="#DC2626" text="Run failed. See the failing step below." />}

      <WorkflowCanvas definition={definition} statusByStep={statusByStep} height={360} />

      {run && (
        <div style={{ marginTop: 14, border: `1px solid ${tok.border}`, borderRadius: tok.radius, overflow: 'hidden', background: tok.surface }}>
          {run.steps.map((s, i) => {
            const meta = stepTypeMeta(s.stepType);
            const st = statusMeta(s.status);
            return (
              <div key={s.stepId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < run.steps.length - 1 ? `1px solid ${tok.border}` : 'none' }}>
                <span style={{ width: 22, height: 22, borderRadius: 999, background: `${st.color}1A`, color: st.color, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: meta.color }} />
                <span style={{ flex: 1, fontSize: 13, color: tok.ink }}>{definition.steps.find((d) => d.id === s.stepId)?.name ?? s.stepId}</span>
                {s.error && <span style={{ fontSize: 12, color: tok.danger }}>{s.error}</span>}
                <Badge {...st} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Banner({ color, text }: { color: string; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: tok.radiusSm, background: `${color}12`, border: `1px solid ${color}33`, color, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
      {text}
    </div>
  );
}
