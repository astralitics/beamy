// VersionHistory — the published versions of a workflow, newest first. The current version is
// marked; older ones can be restored onto the draft (history is never destroyed).
import { Badge, Button, tok } from './theme';
import type { VersionView } from './types';

export interface VersionHistoryProps {
  versions: VersionView[];
  currentVersionId?: string | null;
  onRestore?: (versionId: string) => void;
}

export function VersionHistory({ versions, currentVersionId, onRestore }: VersionHistoryProps) {
  if (versions.length === 0) {
    return <div style={{ fontSize: 13, color: tok.inkFaint, padding: '18px 4px' }}>No published versions yet. Publish the draft to snapshot it.</div>;
  }
  return (
    <div style={{ border: `1px solid ${tok.border}`, borderRadius: tok.radius, overflow: 'hidden', background: tok.surface }}>
      {versions.map((v, i) => {
        const current = v.id === currentVersionId;
        return (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: i < versions.length - 1 ? `1px solid ${tok.border}` : 'none' }}>
            <span style={{ fontFamily: tok.fontDisplay, fontSize: 15, color: tok.ink, width: 44 }}>v{v.versionNumber}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: tok.ink, fontWeight: 600 }}>{v.name}</div>
              <div style={{ fontSize: 12, color: tok.inkFaint }}>
                {(v.definition.steps ?? []).length} steps{v.publishedAt ? ` · ${new Date(v.publishedAt).toLocaleString()}` : ''}
              </div>
            </div>
            {current && <Badge label="Current" color="#059669" />}
            {!current && onRestore && <Button size="sm" variant="outline" onClick={() => onRestore(v.id)}>Restore</Button>}
          </div>
        );
      })}
    </div>
  );
}
