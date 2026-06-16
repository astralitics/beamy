// RunStepInspector — the unified in-run node detail view (n8n's NDV, read-only for a recorded run).
// One component used by BOTH the Build canvas (right panel on a running flow) and the Runs dashboard
// (per-step detail), so "inspect a step's execution" looks the same everywhere.
//
//   Output  — what the step produced (or its error / not-yet-run state)
//   Params  — the step's configuration + instructions (what it was told to do)
//   Input   — the data that fed it: the outputs of the steps it depends on, plus declared inputs
import { useState, type ReactNode } from 'react';
import { Badge, statusMeta, stepTypeMeta, tok } from './theme';
import type { RunStepView, WfStep } from './types';

export interface UpstreamOutput {
  id: string;
  name: string;
  output?: unknown;
}

export interface RunStepInspectorProps {
  /** The definition step (config / inputs / instructions / dependsOn). */
  step: WfStep;
  /** The recorded runtime result for this step in this run (status / output / error / timing). */
  result?: RunStepView;
  /** Outputs of the steps this one depends on — the "Input" pane. */
  upstream?: UpstreamOutput[];
  onClose?: () => void;
  /** Lighter chrome for inline/embedded use (the dashboard list); no sticky header padding. */
  embedded?: boolean;
}

type Tab = 'output' | 'params' | 'input';

function fmtMs(ms: number): string {
  if (ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function JsonBlock({ value, surface }: { value: unknown; surface: string }) {
  return (
    <pre style={{ margin: 0, padding: 12, borderRadius: tok.radiusSm, background: surface, border: `1px solid ${tok.border}`, fontSize: 11, color: tok.ink, overflow: 'auto', maxHeight: 360, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {value == null ? '—' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: tok.inkFaint, margin: '0 0 6px' }}>{children}</div>;
}

export function RunStepInspector({ step, result, upstream = [], onClose, embedded }: RunStepInspectorProps) {
  const [tab, setTab] = useState<Tab>('output');
  const meta = stepTypeMeta(step.type);
  const config = (step.config ?? {}) as Record<string, unknown>;
  const declaredInputs = (step.inputs ?? {}) as Record<string, unknown>;
  const instructions = (step as { instructions?: string }).instructions;
  const hasParams = Object.keys(config).length > 0 || !!instructions;
  const hasInput = upstream.length > 0 || Object.keys(declaredInputs).length > 0;

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'output', label: 'Output', show: true },
    { id: 'params', label: 'Params', show: hasParams },
    { id: 'input', label: 'Input', show: hasInput },
  ];

  return (
    <div style={{ padding: embedded ? 12 : 16, overflow: 'auto', height: embedded ? 'auto' : '100%', background: embedded ? tok.surfaceAlt : undefined, boxSizing: 'border-box' }}>
      {/* The dashboard row already shows name/status/duration, so skip the header when embedded. */}
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: meta.color, flexShrink: 0 }} />
          <span style={{ flex: 1, fontFamily: tok.fontDisplay, fontSize: 16, color: tok.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.name ?? step.id}</span>
          {result && <Badge {...statusMeta(result.status)} />}
          {result?.durationMs != null && <span style={{ fontSize: 11, color: tok.inkFaint, fontVariantNumeric: 'tabular-nums' }}>{fmtMs(result.durationMs)}</span>}
          {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: tok.inkMuted, cursor: 'pointer', fontSize: 15, flexShrink: 0 }}>✕</button>}
        </div>
      )}

      {result?.error && <div style={{ marginBottom: 10, fontSize: 12, color: tok.danger, padding: '7px 10px', background: '#FEF2F2', border: `1px solid #FECACA`, borderRadius: tok.radiusSm }}>{result.error}</div>}

      {/* tab strip */}
      <div style={{ display: 'inline-flex', gap: 2, background: tok.surfaceAlt, border: `1px solid ${tok.border}`, borderRadius: 999, padding: 3, marginBottom: 12 }}>
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '4px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: tok.font, background: tab === t.id ? tok.surface : 'transparent', color: tab === t.id ? tok.ink : tok.inkMuted }}>{t.label}</button>
        ))}
      </div>

      {tab === 'output' && (
        !result ? (
          <div style={{ fontSize: 13, color: tok.inkFaint }}>This step hasn't run yet in this execution.</div>
        ) : (
          <JsonBlock value={result.output != null ? result.output : result.error ?? '—'} surface={tok.surfaceAlt} />
        )
      )}

      {tab === 'params' && (
        <>
          {instructions && (<><Label>Instructions</Label><div style={{ fontSize: 12, color: tok.ink, marginBottom: 12, whiteSpace: 'pre-wrap' }}>{instructions}</div></>)}
          {Object.keys(config).length > 0 ? (<><Label>Configuration</Label><JsonBlock value={config} surface={tok.surfaceAlt} /></>) : (!instructions && <div style={{ fontSize: 13, color: tok.inkFaint }}>No parameters.</div>)}
        </>
      )}

      {tab === 'input' && (
        <>
          {upstream.length > 0 && (
            <>
              <Label>From upstream steps</Label>
              {upstream.map((u) => (
                <div key={u.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: tok.inkMuted, marginBottom: 4 }}>{u.name}</div>
                  <JsonBlock value={u.output} surface={tok.surface} />
                </div>
              ))}
            </>
          )}
          {Object.keys(declaredInputs).length > 0 && (<><Label>Declared inputs</Label><JsonBlock value={declaredInputs} surface={tok.surface} /></>)}
          {!hasInput && <div style={{ fontSize: 13, color: tok.inkFaint }}>No inputs.</div>}
        </>
      )}
    </div>
  );
}
