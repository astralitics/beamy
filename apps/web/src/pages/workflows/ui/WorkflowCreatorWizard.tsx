// WorkflowCreatorWizard — the guided "create a workflow" flow. Two modes: build it yourself
// (name/summary/trigger), or describe it in plain English and let Claude draft a wired DRAFT you
// then review on the canvas (D-8: the AI proposes, you publish).
import { useState } from 'react';
import { Button, Field, Select, TextInput, tok } from './theme';

export interface WorkflowCreatorWizardProps {
  onCreate: (input: { name: string; summary?: string; triggerType: string }) => void;
  /** Describe → Claude drafts a wired workflow. When omitted, only the manual path shows. */
  onBuildWithAI?: (input: { prompt: string; triggerType: string }) => void;
  onCancel: () => void;
  busy?: boolean;
  /** Inline error from a failed create/generate (input is preserved). */
  error?: string | null;
  /** Called when the user switches modes — the parent clears any stale mutation error. */
  onModeChange?: () => void;
}

const TRIGGERS = [
  { value: 'manual', label: 'Manual — someone starts it' },
  { value: 'scheduled', label: 'Scheduled — runs on a cron' },
  { value: 'signal', label: 'Signal — fires on a system event' },
];

export function WorkflowCreatorWizard({ onCreate, onBuildWithAI, onCancel, busy, error, onModeChange }: WorkflowCreatorWizardProps) {
  const [mode, setMode] = useState<'scratch' | 'ai'>('scratch');
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [triggerType, setTriggerType] = useState('manual');
  const [prompt, setPrompt] = useState('');

  const canCreate = !!name.trim();
  const canBuild = prompt.trim().length >= 8;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 20 }} onClick={busy ? undefined : onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(520px, 100%)', background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.radius, boxShadow: '0 20px 50px rgba(0,0,0,.2)', overflow: 'hidden' }}
      >
        <div style={{ padding: '20px 22px', borderBottom: `1px solid ${tok.border}` }}>
          <div style={{ fontFamily: tok.fontDisplay, fontSize: 22, color: tok.ink }}>New workflow</div>
          <div style={{ fontSize: 13, color: tok.inkMuted, marginTop: 3 }}>A repeatable process you'll build, test, and version.</div>
        </div>

        {onBuildWithAI && (
          <div style={{ padding: '14px 22px 0' }}>
            <div style={{ display: 'inline-flex', background: tok.surfaceAlt, border: `1px solid ${tok.border}`, borderRadius: 999, padding: 3 }}>
              {([['scratch', 'Start from scratch'], ['ai', '✨ Build with AI']] as const).map(([m, label]) => (
                <button key={m} onClick={() => { if (m !== mode) { setMode(m); onModeChange?.(); } }} disabled={busy} style={{ padding: '5px 16px', borderRadius: 999, border: 'none', cursor: busy ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: tok.font, background: mode === m ? tok.surface : 'transparent', color: mode === m ? tok.ink : tok.inkMuted }}>{label}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: 22 }}>
          {mode === 'scratch' ? (
            <>
              <Field label="Name">
                <TextInput value={name} onChange={setName} placeholder="e.g. Lead → bid → proposal" />
              </Field>
              <Field label="What's it for?" hint="One line — shown on the workflow card.">
                <TextInput value={summary} onChange={setSummary} placeholder="Turn a new lead into a sent proposal." />
              </Field>
            </>
          ) : (
            <Field label="Describe what this workflow should do" hint="Plain English — Claude drafts a wired workflow you can review and edit.">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                placeholder="When a new lead comes in, have AI draft a scope of work, get an owner to approve it, then email the client a proposal. If rejected, notify the sales rep."
                style={{ width: '100%', padding: '10px 12px', borderRadius: tok.radiusSm, border: `1px solid ${tok.border}`, fontFamily: tok.font, fontSize: 13, color: tok.ink, boxSizing: 'border-box', resize: 'vertical' }}
              />
            </Field>
          )}
          <Field label="Trigger">
            <Select value={triggerType} onChange={setTriggerType} options={TRIGGERS} />
          </Field>
          {error && <div style={{ fontSize: 12, color: tok.danger, marginTop: 4 }}>{error}</div>}
        </div>

        <div style={{ padding: '14px 22px', borderTop: `1px solid ${tok.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          {mode === 'scratch' ? (
            <Button onClick={() => canCreate && onCreate({ name: name.trim(), summary: summary.trim() || undefined, triggerType })} disabled={busy || !canCreate}>
              Create workflow
            </Button>
          ) : (
            <Button onClick={() => canBuild && onBuildWithAI?.({ prompt: prompt.trim(), triggerType })} disabled={busy || !canBuild}>
              {busy ? 'Drafting…' : 'Build with AI'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
