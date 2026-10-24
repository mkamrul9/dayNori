import { Icon } from './Icon.js';
import React, { useState } from 'react';
import { colors, radii, spacing } from '@daynori/design-tokens';
import { Button } from './Button.js';
import { Dialog } from './Dialog.js';
import { ItemTypeBadge } from './ItemTypeBadge.js';
import { Feedback } from './Feedback.js';

export interface ConflictReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conflict: {
    id: string;
    entityId: string;
    entityType: string;
    conflictReason: string;
    baseRevision: number;
    serverRevision: number;
    detectedAt: string;
    localPayload: Record<string, unknown>;
    serverState?: Record<string, unknown>;
    baseState?: Record<string, unknown>;
  } | null;
  onResolve: (
    resolution: 'keep_server' | 'keep_local' | 'save_copy' | 'merge',
    customPayload?: Record<string, unknown>
  ) => Promise<void> | void;
  themeMode?: 'light' | 'dark';
}

function extractStructuredDocumentText(doc: unknown): string {
  if (!doc) return '';
  if (typeof doc === 'string') return doc;
  if (typeof doc !== 'object') return String(doc);
  const d = doc as Record<string, unknown>;
  if (typeof d.text === 'string') return d.text;
  if (Array.isArray(d.content)) {
    const parts = d.content.map(extractStructuredDocumentText).filter(Boolean);
    return parts.join('\n');
  }
  return '';
}

function formatPayloadSummary(payload: Record<string, unknown> | undefined): string {
  if (!payload) return '';
  let text =
    (payload['plainText'] as string | undefined) ??
    (payload['details'] as string | undefined) ??
    '';
  if (!text && payload['document']) {
    text = extractStructuredDocumentText(payload['document']);
    if (!text) {
      try {
        text = JSON.stringify(payload['document'], null, 2);
      } catch {
        text = '[Structured document]';
      }
    }
  }

  const structuredParts: string[] = [];
  if (payload['status']) structuredParts.push(`Status: ${String(payload['status'])}`);
  if (payload['priority']) structuredParts.push(`Priority: ${String(payload['priority'])}`);
  if (payload['deadline']) {
    const dl = payload['deadline'];
    if (typeof dl === 'object' && dl !== null && 'targetDate' in dl) {
      structuredParts.push(`Deadline: ${(dl as Record<string, unknown>).targetDate}`);
    } else {
      structuredParts.push(`Deadline: ${JSON.stringify(dl)}`);
    }
  }
  if (payload['schedule']) structuredParts.push(`Schedule: ${JSON.stringify(payload['schedule'])}`);
  if (payload['frequency']) structuredParts.push(`Frequency: ${String(payload['frequency'])}`);
  if (payload['timeZone'] || payload['timezone']) {
    structuredParts.push(`Timezone: ${String(payload['timeZone'] || payload['timezone'])}`);
  }
  if (payload['entryDate']) structuredParts.push(`Date: ${String(payload['entryDate'])}`);
  if (payload['mood']) structuredParts.push(`Mood: ${String(payload['mood'])}`);
  if (payload['folderId']) structuredParts.push(`Folder: ${String(payload['folderId'])}`);
  if (payload['parentId']) structuredParts.push(`Parent: ${String(payload['parentId'])}`);
  if (Array.isArray(payload['tags']) && payload['tags'].length > 0) {
    structuredParts.push(`Tags: ${payload['tags'].join(', ')}`);
  }

  const structuredSummary = structuredParts.join('\n');
  if (text && structuredSummary) {
    return `${structuredSummary}\n\n${text}`;
  }
  return text || structuredSummary;
}

export const ConflictReviewDialog: React.FC<ConflictReviewDialogProps> = ({
  isOpen,
  onClose,
  conflict,
  onResolve,
  themeMode = 'light',
}) => {
  const palette = colors[themeMode];
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'side_by_side' | 'local' | 'server' | 'base'>(
    'side_by_side'
  );

  if (!conflict) return null;

  const isEditVsDelete =
    Boolean(conflict.serverState?.['deletedAt']) ||
    Boolean(conflict.serverState?.['isTombstone']) ||
    conflict.conflictReason.toLowerCase().includes('deleted');

  const localTitle =
    (conflict.localPayload['title'] as string | undefined) ??
    (conflict.localPayload['name'] as string | undefined) ??
    'Untitled (Local)';

  const serverTitle =
    (conflict.serverState?.['title'] as string | undefined) ??
    (conflict.serverState?.['name'] as string | undefined) ??
    (isEditVsDelete ? '[Deleted on server]' : 'Untitled (Server)');

  const baseTitle =
    (conflict.baseState?.['title'] as string | undefined) ??
    (conflict.baseState?.['name'] as string | undefined) ??
    'Untitled (Base)';

  const localBody = formatPayloadSummary(conflict.localPayload);
  const serverBody = isEditVsDelete
    ? '[Entity deleted on server]'
    : formatPayloadSummary(conflict.serverState);
  const baseBody = formatPayloadSummary(conflict.baseState);

  const isTaskConflict = conflict.entityType === 'task' || conflict.entityType === 'todo';

  const handleAction = async (resolution: 'keep_server' | 'keep_local' | 'save_copy' | 'merge') => {
    setIsResolving(true);
    setResolveError(null);
    try {
      await onResolve(resolution);
      onClose();
    } catch (err: unknown) {
      setResolveError(
        err instanceof Error ? err.message : 'Resolution failed. Both versions have been preserved.'
      );
    } finally {
      setIsResolving(false);
    }
  };

  const renderVersionColumn = (
    heading: string,
    badgeText: string,
    titleText: string,
    bodyText: string,
    isDeleted = false
  ) => (
    <div
      style={{
        flex: 1,
        minWidth: '220px',
        padding: `${spacing.md}px`,
        backgroundColor: isDeleted ? palette.status.dangerBg : palette.surfaceRaised,
        borderRadius: `${radii.sm}px`,
        border: `1px solid ${isDeleted ? palette.status.dangerBorder : palette.border.subtle}`,
        display: 'flex',
        flexDirection: 'column',
        gap: `${spacing.xs}px`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: '13px', color: palette.text.primary }}>
          {heading}
        </span>
        <span
          style={{
            fontSize: '11px',
            padding: '2px 6px',
            borderRadius: `${radii.sm}px`,
            backgroundColor: palette.action.subtle,
            color: palette.action.subtleText,
            fontWeight: 600,
          }}
        >
          {badgeText}
        </span>
      </div>

      <div
        style={{ fontWeight: 600, fontSize: '14px', color: palette.text.primary, marginTop: '4px' }}
      >
        {titleText}
      </div>

      <div
        style={{
          fontSize: '12px',
          color: palette.text.secondary,
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          maxHeight: '180px',
          overflowY: 'auto',
          padding: '6px',
          backgroundColor: palette.surface,
          borderRadius: `${radii.sm}px`,
          border: `1px solid ${palette.border.subtle}`,
          marginTop: '4px',
        }}
      >
        {bodyText || (
          <span style={{ color: palette.text.muted, fontStyle: 'italic' }}>[No content]</span>
        )}
      </div>
    </div>
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Review Sync Conflict"
      description="Another device or server update modified this item while you were working offline. Compare versions and choose a resolution."
      themeMode={themeMode}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
        {isEditVsDelete ? (
          <Feedback
            severity="warning"
            message="Item was deleted on the server, but edited offline on this device. You can restore it with your local changes, keep both as separate records, or accept deletion."
            themeMode={themeMode}
          />
        ) : (
          <Feedback
            severity="warning"
            message={`Conflict detected: ${conflict.conflictReason}. Local edits are preserved until you choose how to apply them.`}
            themeMode={themeMode}
          />
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
          <span style={{ fontSize: '12px', color: palette.text.muted }}>Entity:</span>
          <ItemTypeBadge kind={conflict.entityType} themeMode={themeMode} />
          <span style={{ fontSize: '12px', color: palette.text.secondary }}>
            Base Rev {conflict.baseRevision} <Icon name="arrow-right" /> Server Rev {conflict.serverRevision}
          </span>
        </div>

        {/* View Mode Switcher */}
        <div
          role="tablist"
          aria-label="Comparison views"
          style={{
            display: 'flex',
            gap: `${spacing.xs}px`,
            borderBottom: `1px solid ${palette.border.subtle}`,
            paddingBottom: '4px',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'side_by_side'}
            onClick={() => setActiveTab('side_by_side')}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: activeTab === 'side_by_side' ? 700 : 400,
              backgroundColor: activeTab === 'side_by_side' ? palette.action.subtle : 'transparent',
              color: activeTab === 'side_by_side' ? palette.text.primary : palette.text.secondary,
              border: 'none',
              borderRadius: `${radii.sm}px`,
              cursor: 'pointer',
            }}
          >
            Side-by-Side
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'local'}
            onClick={() => setActiveTab('local')}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: activeTab === 'local' ? 700 : 400,
              backgroundColor: activeTab === 'local' ? palette.action.subtle : 'transparent',
              color: activeTab === 'local' ? palette.text.primary : palette.text.secondary,
              border: 'none',
              borderRadius: `${radii.sm}px`,
              cursor: 'pointer',
            }}
          >
            Local Edits
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'server'}
            onClick={() => setActiveTab('server')}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: activeTab === 'server' ? 700 : 400,
              backgroundColor: activeTab === 'server' ? palette.action.subtle : 'transparent',
              color: activeTab === 'server' ? palette.text.primary : palette.text.secondary,
              border: 'none',
              borderRadius: `${radii.sm}px`,
              cursor: 'pointer',
            }}
          >
            Server Version
          </button>
          {conflict.baseState && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'base'}
              onClick={() => setActiveTab('base')}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: activeTab === 'base' ? 700 : 400,
                backgroundColor: activeTab === 'base' ? palette.action.subtle : 'transparent',
                color: activeTab === 'base' ? palette.text.primary : palette.text.secondary,
                border: 'none',
                borderRadius: `${radii.sm}px`,
                cursor: 'pointer',
              }}
            >
              Base (Original)
            </button>
          )}
        </div>

        {/* Content Comparison View */}
        <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
          {(activeTab === 'side_by_side' || activeTab === 'local') &&
            renderVersionColumn('Local Changes', 'This Device', localTitle, localBody)}
          {(activeTab === 'side_by_side' || activeTab === 'server') &&
            renderVersionColumn(
              'Server Version',
              `Rev ${conflict.serverRevision}`,
              serverTitle,
              serverBody,
              isEditVsDelete
            )}
          {((activeTab === 'side_by_side' && conflict.baseState) || activeTab === 'base') &&
            renderVersionColumn(
              'Base Original',
              `Rev ${conflict.baseRevision}`,
              baseTitle,
              baseBody
            )}
        </div>

        {/* Action Controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: `${spacing.sm}px`,
            paddingTop: `${spacing.sm}px`,
            borderTop: `1px solid ${palette.border.subtle}`,
            flexWrap: 'wrap',
            gap: `${spacing.sm}px`,
          }}
        >
          <div style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              themeMode={themeMode}
              disabled={isResolving}
              onClick={() => void handleAction('keep_server')}
            >
              {isEditVsDelete ? 'Accept Deletion' : 'Keep Server Version'}
            </Button>
            <Button
              variant="secondary"
              themeMode={themeMode}
              disabled={isResolving}
              onClick={() => void handleAction('keep_local')}
            >
              {isEditVsDelete ? 'Restore & Apply Edits' : 'Keep Local Edits'}
            </Button>
            {isTaskConflict && (
              <Button
                variant="secondary"
                themeMode={themeMode}
                disabled={isResolving}
                onClick={() => void handleAction('merge')}
              >
                Merge Non-Conflicting Fields
              </Button>
            )}
            <Button
              variant="primary"
              themeMode={themeMode}
              disabled={isResolving}
              onClick={() => void handleAction('save_copy')}
            >
              Keep Both (Separate Copy)
            </Button>
          </div>

          {resolveError && (
            <div style={{ width: '100%', marginTop: '6px' }}>
              <Feedback severity="danger" message={resolveError} themeMode={themeMode} />
            </div>
          )}

          <Button
            variant="secondary"
            themeMode={themeMode}
            onClick={onClose}
            disabled={isResolving}
          >
            Cancel Review
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
