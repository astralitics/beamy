// Pure caret logic for the ${…} autocomplete — kept React-free so it's unit-testable without a
// browser (see scripts/expr-autocomplete.check.ts). ExpressionInput.tsx wires these to the DOM.

/**
 * The partial expression being typed: the text between the last `${` left of the caret and the
 * caret — or null if the caret isn't inside an OPEN token. Caret-symmetric: a `}` on either side
 * (before the caret, or after it before the next `${`) means the token is already closed.
 */
export function activeToken(value: string, caret: number): string | null {
  const before = value.slice(0, caret);
  const open = before.lastIndexOf('${');
  if (open === -1) return null;
  if (before.slice(open + 2).includes('}')) return null; // closed before the caret
  const after = value.slice(caret);
  const nextClose = after.indexOf('}');
  const nextOpen = after.indexOf('${');
  if (nextClose !== -1 && (nextOpen === -1 || nextClose < nextOpen)) return null; // closed after the caret
  return before.slice(open + 2);
}

/**
 * Insert a full `${path}` reference at the caret, replacing the half-typed token. Consumes any
 * remainder of that token to the right of the caret (its body + closing `}`) so no stray text or
 * brace is left behind. Returns the new value and where the caret should land (after the token).
 */
export function insertRef(value: string, caret: number, path: string): { next: string; caret: number } {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf('${');
  if (at === -1) return { next: value, caret };
  const afterCaret = value.slice(caret);
  const close = afterCaret.indexOf('}');
  const nextOpen = afterCaret.indexOf('${');
  const withinToken = close !== -1 && (nextOpen === -1 || close < nextOpen);
  const tail = withinToken ? afterCaret.slice(close + 1) : afterCaret;
  const token = `\${${path}}`;
  return { next: value.slice(0, at) + token + tail, caret: at + token.length };
}
