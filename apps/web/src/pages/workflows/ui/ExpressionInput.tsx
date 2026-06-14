// A text input with `${…}` autocomplete — type `${` and a dropdown suggests the available
// references (inputs.* and steps.<id>.output.<field>). Plain React + the kit's tokens, no deps.
// Caret-aware: it finds the open `${` token left of the caret, filters on the partial, and on
// accept inserts the full `${path}` and restores the caret after it.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { tok } from './theme';
import { activeToken, insertRef } from './expr-autocomplete';

export interface ExprSuggestion {
  /** The expression body, e.g. "steps.draft.output.total" or "inputs.client". */
  path: string;
  /** Human label, e.g. "Draft · total". */
  label: string;
}

export function ExpressionInput({
  value, onChange, suggestions, placeholder,
}: { value: string; onChange: (v: string) => void; suggestions: ExprSuggestion[]; placeholder?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const filtered = useMemo(() => {
    if (query == null) return [];
    const q = query.toLowerCase();
    return suggestions.filter((s) => s.path.toLowerCase().includes(q) || s.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query, suggestions]);
  const open = query != null && filtered.length > 0;

  const refresh = (val: string, caret: number) => {
    const tokenText = activeToken(val, caret);
    setQuery(tokenText);
    setHighlight(0);
  };

  const accept = (s: ExprSuggestion) => {
    const caret = ref.current?.selectionStart ?? value.length;
    const { next, caret: newCaret } = insertRef(value, caret, s.path);
    pendingCaret.current = newCaret;
    onChange(next);
    setQuery(null);
  };

  // Restore the caret after a programmatic insertion (controlled inputs reset it otherwise).
  useLayoutEffect(() => {
    if (pendingCaret.current != null && ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={ref}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => { onChange(e.target.value); refresh(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
        onClick={(e) => refresh(value, (e.target as HTMLInputElement).selectionStart ?? value.length)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % filtered.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + filtered.length) % filtered.length); }
          else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(filtered[highlight] ?? filtered[0]!); }
          else if (e.key === 'Escape') { e.preventDefault(); setQuery(null); }
        }}
        onBlur={() => window.setTimeout(() => setQuery(null), 120)}
        style={{ width: '100%', padding: '8px 11px', borderRadius: tok.radiusSm, border: `1px solid ${tok.border}`, fontFamily: tok.font, fontSize: 13, color: tok.ink, boxSizing: 'border-box' }}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 3, zIndex: 60, background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.radiusSm, boxShadow: '0 10px 30px rgba(0,0,0,.14)', overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
          {filtered.map((s, i) => (
            <button
              key={s.path}
              onMouseDown={(e) => { e.preventDefault(); accept(s); }}
              onMouseEnter={() => setHighlight(i)}
              style={{ display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', textAlign: 'left', border: 'none', borderBottom: `1px solid ${tok.border}`, cursor: 'pointer', padding: '7px 10px', background: i === highlight ? tok.surfaceAlt : 'transparent', fontFamily: tok.font }}
            >
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: tok.accent, whiteSpace: 'nowrap' }}>{s.path}</span>
              <span style={{ fontSize: 11, color: tok.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
