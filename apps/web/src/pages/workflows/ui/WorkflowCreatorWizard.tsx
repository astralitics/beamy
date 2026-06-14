// WorkflowCreatorWizard — the guided "create a workflow" flow. Three modes: build it yourself
// (name/summary/trigger), describe it in plain English and let Claude draft a wired DRAFT, or start
// from a curated template. AI/template output is always a DRAFT you review on the canvas (D-8).
import { useState } from 'react';
import { Button, Field, Select, TextInput, tok } from './theme';

export interface TemplateCard {
  id: string;
  title: string;
  description: string;
  category: string;
  triggerType: string;
  stepCount: number;
}

export interface WorkflowCreatorWizardProps {
  onCreate: (input: { name: string; summary?: string; triggerType: string }) => void;
  /** Describe → Claude drafts a wired workflow. When omitted, the AI mode is hidden. */
  onBuildWithAI?: (input: { prompt: string; triggerType: string }) => void;
  /** Curated templates → one-click draft. When omitted, the template mode is hidden. */
  templates?: TemplateCard[];
  templatesLoading?: boolean;
  onUseTemplate?: (templateId: string) => void;
  onCancel: () => void;
  busy?: boolean;
  /** Inline error from a failed create/generate/instantiate (input is preserved). */
  error?: string | null;
  /** Called when the user switches modes — the parent clears any stale mutation error. */
  onModeChange?: () => void;
}

const TRIGGERS = [
  { value: 'manual', label: 'Manual — someone starts it' },
  { value: 'scheduled', label: 'Scheduled — runs on a cron' },
  { value: 'signal', label: 'Signal — fires on a system event' },
];

type Mode = 'scratch' | 'ai' | 'template';

export function WorkflowCreatorWizard({ onCreate, onBuildWithAI, templates, templatesLoading, onUseTemplate, onCancel, busy, error, onModeChange }: WorkflowCreatorWizardProps) {
  const [mode, setMode] = useState<Mode>('scratch');
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [triggerType, setTriggerType] = useState('manual');
  const [prompt, setPrompt] = useState('');

  const canCreate = !!name.trim();
  const canBuild = prompt.trim().length >= 8;

  const modes: [Mode, string][] = [['scratch', 'Start from scratch']];
  if (onBuildWithAI) modes.push(['ai', '✨ Build with AI']);
  if (onUseTemplate) modes.push(['template', 'From a template']);

  const switchMode = (m: Mode) => { if (m !== mode) { setMode(m); onModeChange?.(); } };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 20 }} onClick={busy ? undefined : onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 100%)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.radius, boxShadow: '0 20px 50px rgba(0,0,0,.2)', overflow: 'hidden' }}
      >
        <div style={{ padding: '20px 22px', borderBottom: `1px solid ${tok.border}` }}>
          <div style={{ fontFamily: tok.fontDisplay, fontSize: 22, color: tok.ink }}>New workflow</div>
          <div style={{ fontSize: 13, color: tok.inkMuted, marginTop: 3 }}>A repeatable process you'll build, test, and version.</div>
        </div>

        {modes.length > 1 && (
          <div style={{ padding: '14px 22px 0' }}>
            <div style={{ display: 'inline-flex', background: tok.surfaceAlt, border: `1px solid ${tok.border}`, borderRadius: 999, padding: 3 }}>
              {modes.map(([m, label]) => (
                <button key={m} onClick={() => switchMode(m)} disabled={busy} style={{ padding: '5px 14px', borderRadius: 999, border: 'none', cursor: busy ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: tok.font, background: mode === m ? tok.surface : 'transparent', color: mode === m ? tok.ink : tok.inkMuted }}>{label}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
          {mode === 'scratch' && (
            <>
              <Field label="Name">
                <TextInput value={name} onChange={setName} placeholder="e.g. Lead → bid → proposal" />
              </Field>
              <Field label="What's it for?" hint="One line — shown on the workflow card.">
                <TextInput value={summary} onChange={setSummary} placeholder="Turn a new lead into a sent proposal." />
              </Field>
              <Field label="Trigger">
                <Select value={triggerType} onChange={setTriggerType} options={TRIGGERS} />
              </Field>
            </>
          )}
          {mode === 'ai' && (
            <>
              <Field label="Describe what this workflow should do" hint="Plain English — Claude drafts a wired workflow you can review and edit.">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  placeholder="When a new lead comes in, have AI draft a scope of work, get an owner to approve it, then email the client a proposal. If rejected, notify the sales rep."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: tok.radiusSm, border: `1px solid ${tok.border}`, fontFamily: tok.font, fontSize: 13, color: tok.ink, boxSizing: 'border-box', resize: 'vertical' }}
                />
              </Field>
              <Field label="Trigger">
                <Select value={triggerType} onChange={setTriggerType} options={TRIGGERS} />
              </Field>
            </>
          )}
          {mode === 'template' && (
            <TemplateGallery templates={templates ?? []} loading={templatesLoading} busy={busy} onUse={(id) => onUseTemplate?.(id)} />
          )}
          {error && <div style={{ fontSize: 12, color: tok.danger, marginTop: 8 }}>{error}</div>}
        </div>

        {mode !== 'template' && (
          <div style={{ padding: '14px 22px', borderTop: `1px solid ${tok.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
            {mode === 'scratch' ? (
              <Button onClick={() => canCreate && onCreate({ name: name.trim(), summary: summary.trim() || undefined, triggerType })} disabled={busy || !canCreate}>Create workflow</Button>
            ) : (
              <Button onClick={() => canBuild && onBuildWithAI?.({ prompt: prompt.trim(), triggerType })} disabled={busy || !canBuild}>{busy ? 'Drafting…' : 'Build with AI'}</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateGallery({ templates, loading, busy, onUse }: { templates: TemplateCard[]; loading?: boolean; busy?: boolean; onUse: (id: string) => void }) {
  if (templates.length === 0) return <div style={{ fontSize: 13, color: tok.inkFaint }}>{loading ? 'Loading templates…' : 'No templates available.'}</div>;
  // Group by category, preserving first-seen order.
  const groups: { category: string; items: TemplateCard[] }[] = [];
  for (const t of templates) {
    let g = groups.find((x) => x.category === t.category);
    if (!g) { g = { category: t.category, items: [] }; groups.push(g); }
    g.items.push(t);
  }
  return (
    <div>
      {groups.map((g) => (
        <div key={g.category} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: tok.inkFaint, marginBottom: 6 }}>{g.category}</div>
          {g.items.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, background: tok.surface, padding: '10px 12px', marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: tok.fontDisplay, fontSize: 14, color: tok.ink }}>{t.title}</div>
                <div style={{ fontSize: 12, color: tok.inkMuted, marginTop: 2 }}>{t.description}</div>
                <div style={{ fontSize: 11, color: tok.inkFaint, marginTop: 3 }}>{t.stepCount} steps · {t.triggerType}</div>
              </div>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onUse(t.id)}>Use</Button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
