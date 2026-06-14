// Builds a design-time VarScope for the expression editor's live preview. At authoring time we
// don't have real upstream outputs, so we synthesize a SHAPE per declared output — using
// ‹angle-bracketed› placeholders so the preview visibly reads as schema, not confirmed data.
// The same shared resolveVars then runs over it, so the preview matches runtime resolution exactly.
import type { VarScope } from '@beamy/shared';
import type { WfStep, WfStepOutput } from './types';

/** A type-shaped placeholder value for one declared output. */
// Every leaf is an ‹angle-bracket› token so the preview always reads as schema, never as confirmed
// data — while keeping the natural SHAPE so common sub-paths (e.g. .approved, .name) still resolve.
function sampleValue(o: WfStepOutput): unknown {
  switch (o.type) {
    case 'text': return '‹sample text›';
    case 'scalar':
    case 'measurement': return '‹number›';
    case 'file': return { name: '‹file›' };
    case 'photo-set': return ['‹photo›'];
    case 'list': return ['‹item›'];
    case 'decision': return { approved: '‹true/false›' };
    case 'structured': return { '‹field›': '‹value›' };
    case 'entity-ref': return '‹ref›';
    case 'signature': return '‹signature›';
    case 'event': return '‹event›';
    default: return `‹${o.name}›`;
  }
}

/** The synthetic output object for a step, keyed by each declared output id. */
function sampleFor(step: WfStep): Record<string, unknown> {
  return Object.fromEntries((step.outputs ?? []).map((o) => [o.id, sampleValue(o)]));
}

/**
 * A VarScope for previewing `${...}` while authoring: `steps.<id>.output.<field>` resolves to a
 * type-shaped placeholder from each sibling's declared outputs; `inputs.<name>` resolves to a
 * pinned value when present (the n8n "pin data" borrow), else ''.
 */
export function buildPreviewScope(siblings: WfStep[], pinned?: Record<string, string>): VarScope {
  return {
    inputs: pinned ?? {},
    outputs: Object.fromEntries(siblings.map((s) => [s.id, sampleFor(s)])),
  };
}
