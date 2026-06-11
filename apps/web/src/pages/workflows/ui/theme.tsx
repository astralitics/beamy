// Theme contract + shared primitives for the workflow-studio UI kit.
// Components style themselves via `--wf-*` CSS variables with light defaults; an app themes the
// kit by setting those vars on the <WorkflowStudioRoot> wrapper (map them to Beamy's ink/paper
// or Cadenza's CSS vars). Zero dependency on the host's Tailwind config — pure inline styles.
import type { CSSProperties, ReactNode } from 'react';

export const tok = {
  bg: 'var(--wf-bg, #FAFAF7)',
  surface: 'var(--wf-surface, #FFFFFF)',
  surfaceAlt: 'var(--wf-surface-alt, #F4F3EE)',
  border: 'var(--wf-border, #E7E5E0)',
  ink: 'var(--wf-ink, #1C1917)',
  inkMuted: 'var(--wf-ink-muted, #78716C)',
  inkFaint: 'var(--wf-ink-faint, #A8A29E)',
  accent: 'var(--wf-accent, #A14A1F)',
  accentSoft: 'var(--wf-accent-soft, #FBF1EB)',
  danger: 'var(--wf-danger, #DC2626)',
  radius: 'var(--wf-radius, 12px)',
  radiusSm: 'var(--wf-radius-sm, 8px)',
  fontDisplay: 'var(--wf-font-display, "Fraunces", ui-serif, Georgia, serif)',
  font: 'var(--wf-font, "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif)',
};

export interface StepTypeMeta { label: string; category: 'execution' | 'control' | 'human' | 'terminal'; color: string }

export const STEP_TYPE_META: Record<string, StepTypeMeta> = {
  mcp_tool_call: { label: 'MCP tool', category: 'execution', color: '#059669' },
  function_call: { label: 'Function', category: 'execution', color: '#059669' },
  http_call: { label: 'HTTP call', category: 'execution', color: '#0891B2' },
  ai_agent_task: { label: 'AI agent', category: 'execution', color: '#9333EA' },
  db_operation: { label: 'DB op', category: 'execution', color: '#059669' },
  provision_resource: { label: 'Provision', category: 'execution', color: '#059669' },
  call_workflow: { label: 'Call workflow', category: 'execution', color: '#2563EB' },
  notify: { label: 'Notify', category: 'execution', color: '#3B82F6' },
  branch: { label: 'Branch', category: 'control', color: '#D97706' },
  loop: { label: 'Loop', category: 'control', color: '#D97706' },
  parallel: { label: 'Parallel', category: 'control', color: '#D97706' },
  wait_for_condition: { label: 'Wait', category: 'control', color: '#D97706' },
  delay: { label: 'Delay', category: 'control', color: '#D97706' },
  human_approval: { label: 'Approval', category: 'human', color: '#DB2777' },
  human_input: { label: 'Human input', category: 'human', color: '#DB2777' },
  succeed: { label: 'Succeed', category: 'terminal', color: '#16A34A' },
  fail: { label: 'Fail', category: 'terminal', color: '#DC2626' },
};
export function stepTypeMeta(t: string): StepTypeMeta {
  return STEP_TYPE_META[t] ?? { label: t, category: 'execution', color: '#64748B' };
}

export const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#78716C' },
  published: { label: 'Published', color: '#059669' },
  archived: { label: 'Archived', color: '#A8A29E' },
  running: { label: 'Running', color: '#0891B2' },
  paused: { label: 'Awaiting', color: '#D97706' },
  completed: { label: 'Completed', color: '#16A34A' },
  failed: { label: 'Failed', color: '#DC2626' },
  skipped: { label: 'Skipped', color: '#A8A29E' },
  cancelled: { label: 'Cancelled', color: '#A8A29E' },
};
export function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s, color: '#64748B' };
}

// ── primitives ──────────────────────────────────────────────────

export function Badge({ label, color, soft = true }: { label: string; color: string; soft?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600,
        color: soft ? color : '#fff', background: soft ? `${color}1A` : color,
        border: `1px solid ${color}33`, whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
      {label}
    </span>
  );
}

export function Button({
  children, onClick, variant = 'primary', size = 'md', disabled, type = 'button', title,
}: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md'; disabled?: boolean; type?: 'button' | 'submit'; title?: string;
}) {
  const pad = size === 'sm' ? '5px 11px' : '8px 16px';
  const styles: Record<string, CSSProperties> = {
    primary: { background: tok.accent, color: '#fff', border: `1px solid ${tok.accent}` },
    outline: { background: tok.surface, color: tok.ink, border: `1px solid ${tok.border}` },
    ghost: { background: 'transparent', color: tok.inkMuted, border: '1px solid transparent' },
    danger: { background: 'transparent', color: tok.danger, border: `1px solid ${tok.danger}33` },
  };
  return (
    <button
      type={type} onClick={onClick} disabled={disabled} title={title}
      style={{
        ...styles[variant], padding: pad, borderRadius: tok.radiusSm, fontSize: 13, fontWeight: 600,
        fontFamily: tok.font, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'filter .15s', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.radius, ...style }}>
      {children}
    </div>
  );
}

export function TextInput({
  value, onChange, placeholder, type = 'text',
}: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type}
      style={{
        width: '100%', padding: '8px 11px', borderRadius: tok.radiusSm, border: `1px solid ${tok.border}`,
        background: tok.surface, color: tok.ink, fontSize: 13, fontFamily: tok.font, outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  );
}

export function Select({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%', padding: '8px 11px', borderRadius: tok.radiusSm, border: `1px solid ${tok.border}`,
        background: tok.surface, color: tok.ink, fontSize: 13, fontFamily: tok.font, outline: 'none',
        boxSizing: 'border-box', appearance: 'none',
      }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: tok.ink, marginBottom: 5 }}>{label}</div>
      {hint && <div style={{ fontSize: 12, color: tok.inkFaint, marginBottom: 6 }}>{hint}</div>}
      {children}
    </label>
  );
}

/** The themeable root wrapper — set `--wf-*` overrides via `style` to retheme the whole kit. */
export function WorkflowStudioRoot({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontFamily: tok.font, color: tok.ink, background: tok.bg, ...style }}>
      {children}
    </div>
  );
}
