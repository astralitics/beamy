// Shared input/output editors for a step's interface — used by the step detail page and the
// workflow step editor. Inputs are declarations (name + type); outputs declare a name + type +
// whether they're required + their verifications (the success criteria the test scores against).
import {
  WORKFLOW_OUTPUT_TYPES as IO_TYPES,
  verificationsFor,
  type WorkflowOutputType,
} from '@beamy/shared';
import { Button, Select, TextInput, tok } from './theme';
import type { WfStepInput, WfStepOutput, WfVerification } from './types';

const TYPE_OPTIONS = IO_TYPES.map((t) => ({ value: t, label: t }));

export function InputsDeclEditor({ inputs, onChange }: { inputs: WfStepInput[]; onChange: (v: WfStepInput[]) => void }) {
  const add = () => onChange([...inputs, { name: `input${inputs.length + 1}`, type: 'text' }]);
  const update = (i: number, patch: Partial<WfStepInput>) => onChange(inputs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const remove = (i: number) => onChange(inputs.filter((_, j) => j !== i));
  return (
    <div>
      {inputs.length === 0 && <div style={{ fontSize: 12, color: tok.inkFaint, paddingBottom: 8 }}>No inputs declared. Add what this step consumes.</div>}
      {inputs.map((inp, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1 }}><TextInput value={inp.name} onChange={(v) => update(i, { name: v })} placeholder="input name" /></div>
          <div style={{ width: 150 }}><Select value={inp.type} onChange={(v) => update(i, { type: v })} options={TYPE_OPTIONS} /></div>
          <Button variant="ghost" size="sm" onClick={() => remove(i)}>✕</Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add}>+ Input</Button>
    </div>
  );
}

export function OutputsEditor({ outputs, onChange }: { outputs: WfStepOutput[]; onChange: (o: WfStepOutput[]) => void }) {
  const add = () => onChange([...outputs, { id: `out_${outputs.length + 1}`, name: 'Output', type: 'text', required: true, verifications: [] }]);
  const update = (i: number, patch: Partial<WfStepOutput>) => onChange(outputs.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const remove = (i: number) => onChange(outputs.filter((_, j) => j !== i));

  return (
    <div>
      {outputs.length === 0 && <div style={{ fontSize: 12, color: tok.inkFaint, paddingBottom: 8 }}>No outputs. Declare what this step produces + how to verify it.</div>}
      {outputs.map((o, i) => (
        <div key={i} style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, padding: 11, marginBottom: 8, background: tok.surfaceAlt }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}><TextInput value={o.name} onChange={(v) => update(i, { name: v })} placeholder="Output name" /></div>
            <div style={{ width: 130 }}>
              <Select value={o.type} onChange={(v) => update(i, { type: v, verifications: [] })} options={TYPE_OPTIONS} />
            </div>
            <Button variant="ghost" size="sm" onClick={() => remove(i)}>✕</Button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: tok.inkMuted, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={o.required} onChange={(e) => update(i, { required: e.target.checked })} />
            Required (a failing check here blocks the step)
          </label>
          <VerificationPicker outputType={o.type as WorkflowOutputType} verifications={o.verifications} onChange={(verifications) => update(i, { verifications })} />
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add}>+ Output</Button>
    </div>
  );
}

export function VerificationPicker({ outputType, verifications, onChange }: { outputType: WorkflowOutputType; verifications: WfVerification[]; onChange: (v: WfVerification[]) => void }) {
  const available = verificationsFor(outputType);
  const has = (kind: string) => verifications.some((v) => v.kind === kind);
  const toggle = (kind: string) => onChange(has(kind) ? verifications.filter((v) => v.kind !== kind) : [...verifications, { kind, params: {} }]);
  if (available.length === 0) return <div style={{ fontSize: 11, color: tok.inkFaint }}>No checks for “{outputType}”.</div>;
  return (
    <div>
      <div style={{ fontSize: 11, color: tok.inkFaint, marginBottom: 5 }}>Success criteria:</div>
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
    </div>
  );
}
