// StepEditor — the guided panel for designing a single step: what it is, what it depends on,
// and the outputs it must produce (with verifications). This is "design the steps and its
// tests". Imports only the verification CATALOG (no DB layer) to stay portable.
import { useState } from 'react';
import { Badge, Button, Field, Select, TextInput, stepTypeMeta, tok } from './theme';
import {
  WORKFLOW_OUTPUT_TYPES as OUTPUT_TYPES,
  verificationsFor,
  type WorkflowOutputType as OutputType,
} from '@beamy/shared';
import { STEP_TYPE_META } from './theme';
import { ConfigFields, type ConnectionOption } from './StepCreatorModal';
import { stepTypeSpec } from './step-catalog';
import type { WfStep, WfStepOutput, WfVerification } from './types';

const STEP_TYPE_OPTIONS = Object.entries(STEP_TYPE_META).map(([value, m]) => ({ value, label: `${m.label} · ${m.category}` }));

export interface StepEditorProps {
  step: WfStep;
  siblings: WfStep[]; // other steps in the workflow (for dependsOn)
  /** The org's stored Connections — populates a step's `connection`-kind config fields. */
  connectionOptions?: ConnectionOption[];
  onSave: (step: WfStep) => void;
  onDelete?: () => void;
  onCancel?: () => void;
}

export function StepEditor({ step, siblings, connectionOptions, onSave, onDelete, onCancel }: StepEditorProps) {
  const [draft, setDraft] = useState<WfStep>(() => ({ ...step, outputs: step.outputs ?? [], dependsOn: step.dependsOn ?? [] }));
  const set = (patch: Partial<WfStep>) => setDraft((d) => ({ ...d, ...patch }));
  const meta = stepTypeMeta(draft.type);
  const others = siblings.filter((s) => s.id !== draft.id);
  // "Run on" gating: any branch sibling offers a true/false path to gate this step on.
  const branchSiblings = others.filter((s) => s.type === 'branch');
  const runOnOptions = [
    { value: '', label: 'Always' },
    ...branchSiblings.flatMap((b) => [
      { value: `\${steps.${b.id}.output.onTrue}`, label: `When "${b.name ?? b.id}" is true` },
      { value: `\${steps.${b.id}.output.onFalse}`, label: `When "${b.name ?? b.id}" is false` },
    ]),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${tok.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: meta.color }} />
          <span style={{ fontFamily: tok.fontDisplay, fontSize: 17, color: tok.ink }}>Edit step</span>
        </div>
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>✕</Button>}
      </div>

      <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
        <Field label="Step name">
          <TextInput value={draft.name ?? ''} onChange={(v) => set({ name: v })} placeholder="e.g. Draft estimate" />
        </Field>
        <Field label="Step type" hint="What this step does. Execution steps dispatch to a handler; human steps pause for a person.">
          <Select value={draft.type} onChange={(v) => set({ type: v })} options={STEP_TYPE_OPTIONS} />
        </Field>
        {(() => {
          const sp = stepTypeSpec(draft.type);
          return sp && sp.config.length ? (
            <ConfigFields spec={sp} config={draft.config ?? {}} onConfig={(c) => set({ config: c })} connectionOptions={connectionOptions} />
          ) : null;
        })()}
        <Field label="Instructions" hint="Guidance shown to the operator (for human steps) or notes for the runtime.">
          <textarea
            value={draft.instructions ?? ''}
            onChange={(e) => set({ instructions: e.target.value })}
            rows={2}
            style={{ width: '100%', padding: '8px 11px', borderRadius: tok.radiusSm, border: `1px solid ${tok.border}`, fontFamily: tok.font, fontSize: 13, color: tok.ink, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </Field>

        {others.length > 0 && (
          <Field label="Runs after" hint="The steps that must complete before this one (the DAG edges).">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {others.map((s) => {
                const on = (draft.dependsOn ?? []).includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => set({ dependsOn: on ? (draft.dependsOn ?? []).filter((d) => d !== s.id) : [...(draft.dependsOn ?? []), s.id] })}
                    style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: tok.font, border: `1px solid ${on ? tok.accent : tok.border}`, background: on ? tok.accentSoft : tok.surface, color: on ? tok.accent : tok.inkMuted }}
                  >
                    {on ? '✓ ' : ''}{s.name ?? s.id}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {branchSiblings.length > 0 && (
          <Field label="Run on" hint="Gate this step on a branch's path. To merge both paths back together, run after the Branch itself — not after both the true and false steps (that would skip it).">
            <Select
              value={draft.when ?? ''}
              onChange={(v) => {
                // Re-point the single branch dependency: drop any branch-sibling dep this gate added
                // before, then add the newly-selected one. Adding it gives the canvas edge + cascade;
                // the engine also orders by `when` so correctness doesn't depend on this.
                const branchIds = new Set(branchSiblings.map((b) => b.id));
                const kept = (draft.dependsOn ?? []).filter((d) => !branchIds.has(d));
                if (!v) { set({ when: undefined, dependsOn: kept }); return; }
                const branchId = /^\$\{steps\.([^.}]+)\.output\./.exec(v)?.[1];
                set({ when: v, dependsOn: branchId ? [...kept, branchId] : kept });
              }}
              options={runOnOptions}
            />
          </Field>
        )}

        <OutputsEditor outputs={draft.outputs ?? []} onChange={(outputs) => set({ outputs })} />
      </div>

      <div style={{ padding: '12px 18px', borderTop: `1px solid ${tok.border}`, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        {onDelete ? <Button variant="danger" size="sm" onClick={onDelete}>Delete step</Button> : <span />}
        <Button onClick={() => onSave(draft)}>Save step</Button>
      </div>
    </div>
  );
}

function OutputsEditor({ outputs, onChange }: { outputs: WfStepOutput[]; onChange: (o: WfStepOutput[]) => void }) {
  const add = () => onChange([...outputs, { id: `out_${outputs.length + 1}`, name: 'Output', type: 'text', required: true, verifications: [] }]);
  const update = (i: number, patch: Partial<WfStepOutput>) => onChange(outputs.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const remove = (i: number) => onChange(outputs.filter((_, j) => j !== i));

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: tok.ink, textTransform: 'uppercase', letterSpacing: '.04em' }}>Outputs & checks</div>
        <Button size="sm" variant="outline" onClick={add}>+ Output</Button>
      </div>
      {outputs.length === 0 && <div style={{ fontSize: 12, color: tok.inkFaint, paddingBottom: 6 }}>No outputs. Add one to declare what this step must produce + verify.</div>}
      {outputs.map((o, i) => (
        <div key={i} style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, padding: 11, marginBottom: 8, background: tok.surfaceAlt }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}><TextInput value={o.name} onChange={(v) => update(i, { name: v })} placeholder="Output name" /></div>
            <div style={{ width: 130 }}>
              <Select value={o.type} onChange={(v) => update(i, { type: v, verifications: [] })} options={OUTPUT_TYPES.map((t) => ({ value: t, label: t }))} />
            </div>
            <Button variant="ghost" size="sm" onClick={() => remove(i)}>✕</Button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: tok.inkMuted, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={o.required} onChange={(e) => update(i, { required: e.target.checked })} />
            Required (a failing check here blocks the step)
          </label>
          <VerificationPicker outputType={o.type as OutputType} verifications={o.verifications} onChange={(verifications) => update(i, { verifications })} />
        </div>
      ))}
    </div>
  );
}

function VerificationPicker({ outputType, verifications, onChange }: { outputType: OutputType; verifications: WfVerification[]; onChange: (v: WfVerification[]) => void }) {
  const available = verificationsFor(outputType);
  const has = (kind: string) => verifications.some((v) => v.kind === kind);
  const toggle = (kind: string) => onChange(has(kind) ? verifications.filter((v) => v.kind !== kind) : [...verifications, { kind, params: {} }]);
  if (available.length === 0) return <div style={{ fontSize: 11, color: tok.inkFaint }}>No checks for “{outputType}”.</div>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {available.map((v) => (
        <button
          key={v.id}
          title={v.summary}
          onClick={() => toggle(v.id)}
          style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: tok.font, border: `1px solid ${has(v.id) ? '#059669' : tok.border}`, background: has(v.id) ? '#05966915' : tok.surface, color: has(v.id) ? '#059669' : tok.inkMuted }}
        >
          {has(v.id) ? '✓ ' : '+ '}{v.label}
        </button>
      ))}
    </div>
  );
}
