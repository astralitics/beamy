// WorkflowCreatorWizard — the guided "create a workflow" flow. A focused modal: name it, say
// what it's for, pick how it's triggered. Keeps the empty-state inviting rather than a blank form.
import { useState } from 'react';
import { Button, Field, Select, TextInput, tok } from './theme';

export interface WorkflowCreatorWizardProps {
  onCreate: (input: { name: string; summary?: string; triggerType: string }) => void;
  onCancel: () => void;
  busy?: boolean;
}

const TRIGGERS = [
  { value: 'manual', label: 'Manual — someone starts it' },
  { value: 'scheduled', label: 'Scheduled — runs on a cron' },
  { value: 'signal', label: 'Signal — fires on a system event' },
];

export function WorkflowCreatorWizard({ onCreate, onCancel, busy }: WorkflowCreatorWizardProps) {
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [triggerType, setTriggerType] = useState('manual');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 20 }} onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(520px, 100%)', background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.radius, boxShadow: '0 20px 50px rgba(0,0,0,.2)', overflow: 'hidden' }}
      >
        <div style={{ padding: '20px 22px', borderBottom: `1px solid ${tok.border}` }}>
          <div style={{ fontFamily: tok.fontDisplay, fontSize: 22, color: tok.ink }}>New workflow</div>
          <div style={{ fontSize: 13, color: tok.inkMuted, marginTop: 3 }}>A repeatable process you'll build step by step, test, and version.</div>
        </div>
        <div style={{ padding: 22 }}>
          <Field label="Name">
            <TextInput value={name} onChange={setName} placeholder="e.g. Lead → bid → proposal" />
          </Field>
          <Field label="What's it for?" hint="One line — shown on the workflow card.">
            <TextInput value={summary} onChange={setSummary} placeholder="Turn a new lead into a sent proposal." />
          </Field>
          <Field label="Trigger">
            <Select value={triggerType} onChange={setTriggerType} options={TRIGGERS} />
          </Field>
        </div>
        <div style={{ padding: '14px 22px', borderTop: `1px solid ${tok.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => name.trim() && onCreate({ name: name.trim(), summary: summary.trim() || undefined, triggerType })} disabled={busy || !name.trim()}>
            Create workflow
          </Button>
        </div>
      </div>
    </div>
  );
}
