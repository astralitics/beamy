// StepCreatorModal — a single, well-structured modal for adding a step (not a stepped wizard).
// Pick what the step does; the picker collapses to a labeled chip and a tidy form reveals:
//   • name + the type-specific config (an AI task asks for a prompt; a fetch asks URL+method;
//     a human gate asks for instructions…)
//   • inputs — each a literal value or wired from an earlier step's output (${steps.id.output.x})
// Builds a WfStep draft (sans id) and hands it to onCreate.
import { useState, type ReactNode } from 'react';
import { Button, Field, Select, TextInput, stepTypeMeta, tok } from './theme';
import { STEP_CREATE_GROUPS, stepTypeSpec, type StepConfigField, type StepTypeSpec } from './step-catalog';
import type { WfStep, WfStepOutput } from './types';

export interface CatalogStep {
  id: string;
  name: string;
  stepType: string;
  summary?: string | null;
  config?: unknown;
  inputs?: unknown;
  outputs?: unknown;
}

export interface StepCreatorModalProps {
  siblings: WfStep[];
  /** Reusable step templates from the catalog — shown as a "From your catalog" group. */
  templates?: CatalogStep[];
  onCreate: (draft: Omit<WfStep, 'id'>) => void;
  onCancel: () => void;
}

interface InputRow { key: number; name: string; value: string }

export function StepCreatorModal({ siblings, templates, onCreate, onCancel }: StepCreatorModalProps) {
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [instructions, setInstructions] = useState('');
  const [rows, setRows] = useState<InputRow[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateOutputs, setTemplateOutputs] = useState<WfStepOutput[]>([]);
  const spec = type ? stepTypeSpec(type) : undefined;

  const pick = (s: StepTypeSpec) => {
    setType(s.type);
    setName((cur) => cur || s.title);
    setConfig({});
    setInstructions('');
    setTemplateId(null);
    setTemplateOutputs([]);
  };
  const pickTemplate = (t: CatalogStep) => {
    setType(t.stepType);
    setName(t.name);
    setConfig((t.config as Record<string, unknown>) ?? {});
    setInstructions('');
    setTemplateId(t.id);
    setTemplateOutputs((t.outputs as WfStepOutput[]) ?? []);
  };

  const finish = () => {
    if (!spec) return;
    const inputs: Record<string, unknown> = {};
    for (const r of rows) {
      if (r.name.trim()) inputs[r.name.trim()] = parseValue(r.value);
    }
    const last = siblings[siblings.length - 1];
    onCreate({
      type,
      name: name.trim() || spec.title,
      dependsOn: last ? [last.id] : [],
      config: Object.keys(config).length ? config : undefined,
      instructions: instructions.trim() || undefined,
      inputs: Object.keys(inputs).length ? inputs : undefined,
      templateId: templateId ?? undefined,
      outputs: templateOutputs.length ? templateOutputs : [],
    });
  };

  const meta = spec ? stepTypeMeta(spec.type) : null;

  return (
    <Overlay onCancel={onCancel}>
      <div style={{ padding: '18px 22px', borderBottom: `1px solid ${tok.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: tok.fontDisplay, fontSize: 21, color: tok.ink }}>Add a step</div>
        <Button variant="ghost" size="sm" onClick={onCancel}>✕</Button>
      </div>

      <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
        {!spec ? (
          <>
            {templates && templates.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <SectionLabel>From your catalog</SectionLabel>
                <p style={{ fontSize: 13, color: tok.inkMuted, margin: '0 0 12px' }}>Reuse a tested step you've already built.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
                  {templates.map((t) => {
                    const m = stepTypeMeta(t.stepType);
                    return (
                      <button
                        key={t.id}
                        onClick={() => pickTemplate(t)}
                        style={{ textAlign: 'left', cursor: 'pointer', padding: '11px 13px', borderRadius: tok.radiusSm, border: `1px solid ${tok.border}`, borderLeft: `3px solid ${m.color}`, background: tok.surface, fontFamily: tok.font }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: tok.ink, marginBottom: 2 }}>{t.name}</div>
                        <div style={{ fontSize: 12, color: tok.inkMuted, lineHeight: 1.35 }}>{t.summary || m.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <SectionLabel>Step type</SectionLabel>
            <p style={{ fontSize: 13, color: tok.inkMuted, margin: '0 0 16px' }}>{templates && templates.length ? 'Or define a new one:' : 'What should this step do?'}</p>
            <TypeGrid onPick={pick} selected={type} />
          </>
        ) : (
          <>
            {/* selected type → collapses to a chip + change */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 999, background: `${meta!.color}14`, color: meta!.color, fontSize: 13, fontWeight: 700 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: meta!.color }} />
                {spec.title}
                <span style={{ color: tok.inkFaint, fontWeight: 500 }}>· {spec.blurb}</span>
              </div>
              <button onClick={() => { setType(''); setTemplateId(null); }} style={{ background: 'none', border: 'none', color: tok.accent, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: tok.font }}>Change</button>
            </div>

            <Field label="Step name">
              <TextInput value={name} onChange={setName} placeholder={spec.title} />
            </Field>

            <ConfigFields spec={spec} config={config} onConfig={setConfig} />

            {spec.instructionsLabel && (
              <Field label={spec.instructionsLabel} hint="Shown to the person when the run reaches this step.">
                <TextArea value={instructions} onChange={setInstructions} rows={3} />
              </Field>
            )}

            <div style={{ height: 1, background: tok.border, margin: '6px 0 16px' }} />

            <SectionLabel>Inputs</SectionLabel>
            <p style={{ fontSize: 12, color: tok.inkFaint, margin: '2px 0 14px' }}>
              What this step needs to run. Use a fixed value, or wire it from an earlier step's output.
            </p>
            <InputsSection rows={rows} onRows={setRows} siblings={siblings} />
          </>
        )}
      </div>

      <div style={{ padding: '14px 22px', borderTop: `1px solid ${tok.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={finish} disabled={!spec}>Add step</Button>
      </div>
    </Overlay>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: tok.inkFaint, marginBottom: 8 }}>{children}</div>;
}

function TypeGrid({ onPick, selected }: { onPick: (s: StepTypeSpec) => void; selected: string }) {
  return (
    <div>
      {STEP_CREATE_GROUPS.map((g) => (
        <div key={g.group} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: tok.inkFaint, marginBottom: 8 }}>{g.group}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
            {g.items.map((s) => {
              const meta = stepTypeMeta(s.type);
              const on = selected === s.type;
              return (
                <button
                  key={s.type}
                  onClick={() => onPick(s)}
                  style={{
                    textAlign: 'left', cursor: 'pointer', padding: '11px 13px', borderRadius: tok.radiusSm,
                    border: `1px solid ${on ? meta.color : tok.border}`, borderLeft: `3px solid ${meta.color}`,
                    background: on ? `${meta.color}0D` : tok.surface, fontFamily: tok.font,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: tok.ink, marginBottom: 2 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: tok.inkMuted, lineHeight: 1.35 }}>{s.blurb}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Reusable renderer for a step type's config fields — used by the modal AND the editor. */
export function ConfigFields({
  spec, config, onConfig,
}: { spec: StepTypeSpec; config: Record<string, unknown>; onConfig: (c: Record<string, unknown>) => void }) {
  const set = (key: string, value: unknown) => onConfig({ ...config, [key]: value });
  return (
    <>
      {spec.config.map((f: StepConfigField) => (
        <Field key={f.key} label={f.label} hint={f.hint}>
          {f.kind === 'select' ? (
            <Select value={(config[f.key] as string) ?? f.options?.[0] ?? ''} onChange={(v) => set(f.key, v)} options={(f.options ?? []).map((o) => ({ value: o, label: o }))} />
          ) : f.kind === 'textarea' ? (
            <TextArea value={(config[f.key] as string) ?? ''} onChange={(v) => set(f.key, v)} rows={3} placeholder={f.placeholder} />
          ) : (
            <TextInput value={(config[f.key] as string) ?? ''} onChange={(v) => set(f.key, v)} placeholder={f.placeholder} />
          )}
        </Field>
      ))}
    </>
  );
}

function InputsSection({ rows, onRows, siblings }: { rows: InputRow[]; onRows: (r: InputRow[]) => void; siblings: WfStep[] }) {
  const add = () => onRows([...rows, { key: rows.length + (rows[rows.length - 1]?.key ?? 0) + 1, name: '', value: '' }]);
  const update = (key: number, patch: Partial<InputRow>) => onRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => onRows(rows.filter((r) => r.key !== key));

  return (
    <div>
      {rows.length === 0 && (
        <div style={{ fontSize: 13, color: tok.inkFaint, padding: '0 0 12px' }}>No inputs yet — add one if this step needs data.</div>
      )}
      {rows.map((r) => (
        <div key={r.key} style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, padding: 11, marginBottom: 10, background: tok.surfaceAlt }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: siblings.length ? 8 : 0 }}>
            <div style={{ width: 160 }}><TextInput value={r.name} onChange={(v) => update(r.key, { name: v })} placeholder="input name" /></div>
            <div style={{ flex: 1 }}><TextInput value={r.value} onChange={(v) => update(r.key, { value: v })} placeholder="value or ${steps.…}" /></div>
            <Button variant="ghost" size="sm" onClick={() => remove(r.key)}>✕</Button>
          </div>
          {siblings.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: tok.inkFaint }}>wire from:</span>
              {siblings.map((s) => (
                <button
                  key={s.id}
                  onClick={() => update(r.key, { value: referenceFor(s) })}
                  style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: tok.font, border: `1px solid ${tok.border}`, background: tok.surface, color: tok.inkMuted }}
                >
                  {s.name ?? s.id}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}>+ Add input</Button>
    </div>
  );
}

function TextArea({ value, onChange, rows, placeholder }: { value: string; onChange: (v: string) => void; rows: number; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      style={{ width: '100%', padding: '8px 11px', borderRadius: tok.radiusSm, border: `1px solid ${tok.border}`, fontFamily: tok.font, fontSize: 13, color: tok.ink, boxSizing: 'border-box', resize: 'vertical' }}
    />
  );
}

function referenceFor(step: WfStep): string {
  const out = step.outputs?.[0];
  return out ? `\${steps.${step.id}.output.${out.id}}` : `\${steps.${step.id}.output}`;
}

function parseValue(v: string): unknown {
  const t = v.trim();
  if (t === '') return '';
  if (t.startsWith('${')) return t;
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

function Overlay({ children, onCancel }: { children: ReactNode; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 20 }} onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(640px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.radius, boxShadow: '0 20px 50px rgba(0,0,0,.2)', overflow: 'hidden' }}
      >
        {children}
      </div>
    </div>
  );
}
