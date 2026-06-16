// StepCreatorModal — a single, well-structured modal for adding a step (not a stepped wizard).
// Pick what the step does; the picker collapses to a labeled chip and a tidy form reveals:
//   • name + the type-specific config (an AI task asks for a prompt; a fetch asks URL+method;
//     a human gate asks for instructions…)
//   • inputs — each a literal value or wired from an earlier step's output (${steps.id.output.x})
// Builds a WfStep draft (sans id) and hands it to onCreate.
import { useState, type ReactNode } from 'react';
import { exprPaths, resolveVars, type VarScope } from '@beamy/shared';
import { Button, Field, Select, TextInput, stepTypeMeta, tok } from './theme';
import { STEP_CREATE_GROUPS, stepTypeSpec, type StepConfigField, type StepTypeSpec } from './step-catalog';
import { buildPreviewScope } from './expr-scope';
import { ExpressionInput, type ExprSuggestion } from './ExpressionInput';
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
  /** When adding from a node's "+", the new step depends on this step instead of the last one. */
  afterStepId?: string;
  /** The org's stored Connections — populates a step's `connection`-kind config fields. */
  connectionOptions?: ConnectionOption[];
  onCreate: (draft: Omit<WfStep, 'id'>) => void;
  onCancel: () => void;
}

interface InputRow { key: number; name: string; value: string }

export function StepCreatorModal({ siblings, templates, afterStepId, connectionOptions, onCreate, onCancel }: StepCreatorModalProps) {
  const afterName = afterStepId ? siblings.find((s) => s.id === afterStepId)?.name ?? afterStepId : null;
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
      dependsOn: afterStepId ? [afterStepId] : last ? [last.id] : [],
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
        <div>
          <div style={{ fontFamily: tok.fontDisplay, fontSize: 21, color: tok.ink }}>Add a step</div>
          {afterName && <div style={{ fontSize: 12, color: tok.inkMuted, marginTop: 2 }}>Runs after “{afterName}”</div>}
        </div>
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

            <ConfigFields spec={spec} config={config} onConfig={setConfig} connectionOptions={connectionOptions} />

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

/** A stored Connection option for a `connection`-kind config field. */
export interface ConnectionOption { value: string; label: string }

/** Reusable renderer for a step type's config fields — used by the modal AND the editor.
 *  `connectionOptions` populates any `connection`-kind field (the org's stored credentials). */
export function ConfigFields({
  spec, config, onConfig, connectionOptions = [],
}: { spec: StepTypeSpec; config: Record<string, unknown>; onConfig: (c: Record<string, unknown>) => void; connectionOptions?: ConnectionOption[] }) {
  const set = (key: string, value: unknown) => onConfig({ ...config, [key]: value });
  return (
    <>
      {spec.config.map((f: StepConfigField) => (
        <Field key={f.key} label={f.label} hint={f.hint}>
          {f.kind === 'connection' ? (
            <Select
              value={(config[f.key] as string) ?? ''}
              onChange={(v) => set(f.key, v)}
              options={[{ value: '', label: connectionOptions.length ? 'No authentication' : 'No connections yet' }, ...connectionOptions]}
            />
          ) : f.kind === 'cases' ? (
            <CasesEditor cases={(config[f.key] as SwitchCaseRow[]) ?? []} onChange={(c) => set(f.key, c)} />
          ) : f.kind === 'select' ? (
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

/** A single case in a switch step's `config.cases`. Mirrors the engine's case shape. The `id` is the
 *  stable output key a downstream step gates on (`${steps.<sw>.output.cases.<id>}`). It is assigned
 *  ONCE (from the first non-empty value) and then frozen, so editing a value later can never dangle a
 *  gate that already references the id; an as-yet-valueless row has no id (omitted). */
export interface SwitchCaseRow { id?: string; value: string; label?: string }

/** Slugify a case value into an output-key-safe id (lowercase, underscores). Shared with StepEditor. */
export function slugifyCase(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

/** Assign ids to rows that don't have one yet (deriving a unique slug from the value); PRESERVE any id
 *  already assigned. Keeping ids stable across value/label edits + add/remove is what prevents a
 *  downstream `when` gate (which stored the id) from silently dangling. */
function withCaseIds(rows: SwitchCaseRow[]): SwitchCaseRow[] {
  const taken = new Set(rows.map((r) => r.id).filter((x): x is string => !!x));
  return rows.map((r) => {
    if (r.id) return r; // already has a stable id — never re-derive it
    const v = r.value.trim();
    if (!v) return r; // no value yet → leave it id-less until one exists
    const base = slugifyCase(v) || 'case';
    let id = base;
    let n = 2;
    while (taken.has(id)) id = `${base}_${n++}`;
    taken.add(id);
    return { ...r, id };
  });
}

/** Editor for a switch step's cases. Each row is a value to match + an optional human label; the id is
 *  derived once from the value and then frozen. Order matters (first match wins); anything unmatched
 *  takes the default path. */
function CasesEditor({ cases, onChange }: { cases: SwitchCaseRow[]; onChange: (c: SwitchCaseRow[]) => void }) {
  const update = (i: number, patch: Partial<SwitchCaseRow>) =>
    onChange(withCaseIds(cases.map((c, j) => (j === i ? { ...c, ...patch } : c))));
  const add = () => onChange(withCaseIds([...cases, { value: '', label: '' }]));
  const remove = (i: number) => onChange(withCaseIds(cases.filter((_, j) => j !== i)));

  return (
    <div>
      {cases.length === 0 && (
        <div style={{ fontSize: 12, color: tok.inkFaint, marginBottom: 8 }}>No cases yet — add one path per value you want to route.</div>
      )}
      {cases.map((c, i) => (
        <div key={c.id ?? `row_${i}`} style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, padding: 10, marginBottom: 8, background: tok.surfaceAlt }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TextInput value={c.value} onChange={(v) => update(i, { value: v })} placeholder="value to match (e.g. high)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TextInput value={c.label ?? ''} onChange={(v) => update(i, { label: v })} placeholder="label (optional)" />
            </div>
            <Button variant="ghost" size="sm" onClick={() => remove(i)}>✕</Button>
          </div>
          <div style={{ fontSize: 10, color: tok.inkFaint, marginTop: 5, fontFamily: 'ui-monospace, monospace' }}>
            → routes to <span style={{ color: tok.inkMuted }}>output.cases.{c.id || '…'}</span>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}>+ Add case</Button>
    </div>
  );
}

function InputsSection({ rows, onRows, siblings }: { rows: InputRow[]; onRows: (r: InputRow[]) => void; siblings: WfStep[] }) {
  const add = () => onRows([...rows, { key: rows.length + (rows[rows.length - 1]?.key ?? 0) + 1, name: '', value: '' }]);
  const update = (key: number, patch: Partial<InputRow>) => onRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => onRows(rows.filter((r) => r.key !== key));
  // Design-time scope for the live "→ resolves to" preview (synthetic, type-shaped placeholders).
  const scope = buildPreviewScope(siblings);

  return (
    <div>
      {rows.length === 0 && (
        <div style={{ fontSize: 13, color: tok.inkFaint, padding: '0 0 12px' }}>No inputs yet — add one if this step needs data.</div>
      )}
      {rows.map((r) => (
        <div key={r.key} style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, padding: 11, marginBottom: 10, background: tok.surfaceAlt }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 150, flexShrink: 0 }}><TextInput value={r.name} onChange={(v) => update(r.key, { name: v })} placeholder="input name" /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ExpressionField value={r.value} onChange={(v) => update(r.key, { value: v })} siblings={siblings} scope={scope} />
            </div>
            <Button variant="ghost" size="sm" onClick={() => remove(r.key)}>✕</Button>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}>+ Add input</Button>
    </div>
  );
}

/** Expression editor for an input value: type a literal, use `${` autocomplete, or click a "wire
 * from" chip. Shows the reference's human label (fx) and a live "→ resolves to" sample preview. */
export function ExpressionField({ value, onChange, siblings, scope }: { value: string; onChange: (v: string) => void; siblings: WfStep[]; scope: VarScope }) {
  const refs = siblings.flatMap((s) => {
    const outs = s.outputs ?? [];
    if (outs.length === 0) return [{ label: s.name ?? s.id, expr: `\${steps.${s.id}.output}` }];
    return outs.map((o) => ({ label: `${s.name ?? s.id} · ${o.name}`, expr: `\${steps.${s.id}.output.${o.id}}` }));
  });
  const suggestions: ExprSuggestion[] = refs.map((r) => ({ path: r.expr.slice(2, -1), label: r.label }));
  const label = labelForRef(value, siblings);
  const tokens = exprPaths(value);
  let previewText = '';
  if (tokens.length) {
    const resolved = resolveVars(value, scope);
    previewText = resolved == null ? '' : typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
  }
  return (
    <div>
      <ExpressionInput value={value} onChange={onChange} suggestions={suggestions} placeholder="value or ${steps.…}" />
      {label && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${tok.accent}1A`, color: tok.accent }}>fx</span>
          <span style={{ fontSize: 11, color: tok.inkMuted }}>{label}</span>
        </div>
      )}
      {tokens.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: tok.surfaceAlt, color: tok.inkFaint }}>fx sample</span>
          <span style={{ fontSize: 11, color: tok.inkMuted, fontFamily: 'ui-monospace, monospace' }}>→ {previewText ? (previewText.length > 120 ? `${previewText.slice(0, 120)}…` : previewText) : 'no upstream data'}</span>
        </div>
      )}
      {refs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: tok.inkFaint }}>wire from:</span>
          {refs.map((ref) => {
            const on = value.trim() === ref.expr;
            return (
              <button
                key={ref.expr}
                onClick={() => onChange(ref.expr)}
                title={ref.expr}
                style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: tok.font, border: `1px solid ${on ? tok.accent : tok.border}`, background: on ? `${tok.accent}14` : tok.surface, color: on ? tok.accent : tok.inkMuted }}
              >
                {ref.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Human-readable label for a `${steps.id.output.x}` reference (or null if not such an expression).
 *  The `.output` segment is optional — the engine resolver treats `${steps.id.x}` the same way. */
function labelForRef(value: string, siblings: WfStep[]): string | null {
  const m = /^\$\{steps\.([^.}]+)(?:\.output)?(?:\.([^}]+))?\}$/.exec((value ?? '').trim());
  if (!m) return null;
  const step = siblings.find((s) => s.id === m[1]);
  const stepName = step?.name ?? m[1];
  const out = step?.outputs?.find((o) => o.id === m[2]);
  const outName = out?.name ?? m[2] ?? 'output';
  return `${stepName} → ${outName}`;
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
