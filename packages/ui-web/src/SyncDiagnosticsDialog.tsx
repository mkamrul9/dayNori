import React, { useState } from 'react';
import { colors, radii, spacing } from '@daynori/design-tokens';
import type { RedactedSyncDiagnostics } from '@daynori/sync';
import { formatSyncStateLabel } from '@daynori/sync';
import { Button } from './Button.js';
import { Dialog } from './Dialog.js';
import { Feedback } from './Feedback.js';

export interface SyncDiagnosticsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  diagnostics: RedactedSyncDiagnostics | null;
  onSyncNow?: () => Promise<void> | void;
  onOpenRecoveryExport?: () => void;
  onReviewConflicts?: () => void;
  onRefresh?: () => Promise<void> | void;
  themeMode?: 'light' | 'dark';
}

export const SyncDiagnosticsDialog: React.FC<SyncDiagnosticsDialogProps> = ({
  isOpen,
  onClose,
  diagnostics,
  onSyncNow,
  onOpenRecoveryExport,
  onReviewConflicts,
  onRefresh,
  themeMode = 'light',
}) => {
  const palette = colors[themeMode];
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!diagnostics) return null;

  const statusLabel = formatSyncStateLabel(diagnostics.cloudSyncStatus);

  const handleSync = async () => {
    if (!onSyncNow) return;
    setIsSyncing(true);
    try {
      await onSyncNow();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderMetricRow = (label: string, value: string | number | boolean | null) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: `${spacing.xs}px 0`,
        borderBottom: `1px solid ${palette.border.subtle}`,
        fontSize: '13px',
      }}
    >
      <span style={{ color: palette.text.secondary }}>{label}</span>
      <span
        style={{
          fontWeight: 600,
          color: palette.text.primary,
          fontFamily: typeof value === 'number' ? 'monospace' : 'inherit',
        }}
      >
        {value === null || value === undefined ? '—' : String(value)}
      </span>
    </div>
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Sync & Offline Diagnostics"
      description="Inspect local sync state, pending queue metrics, and network health. All document contents and private tokens are excluded."
      themeMode={themeMode}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
        {diagnostics.failedCount > 0 || diagnostics.consecutiveFailures > 0 ? (
          <Feedback
            severity="warning"
            message={`Notice: ${diagnostics.failedCount} failed mutations or ${diagnostics.consecutiveFailures} consecutive sync failures detected. Queued work remains safe locally.`}
            themeMode={themeMode}
          />
        ) : (
          <Feedback
            severity="info"
            message="Status: Redacted diagnostics view. No personal journal entries, notes, or credentials are leaked or uploaded automatically."
            themeMode={themeMode}
          />
        )}

        <div
          style={{
            backgroundColor: palette.surfaceRaised,
            borderRadius: `${radii.sm}px`,
            padding: `${spacing.sm}px ${spacing.md}px`,
            border: `1px solid ${palette.border.subtle}`,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '13px', color: palette.text.primary, marginBottom: `${spacing.xs}px` }}>
            Connection & Workspace State
          </div>
          {renderMetricRow('Workspace ID', diagnostics.workspaceId)}
          {renderMetricRow('User ID (Masked)', diagnostics.userIdRedacted)}
          {renderMetricRow('Device ID (Masked)', diagnostics.deviceIdRedacted)}
          {renderMetricRow('Network Status', diagnostics.networkStatus.toUpperCase())}
          {renderMetricRow('Leader Tab', diagnostics.isLeader ? 'Yes (Active Coordinator)' : 'No (Follower Tab)')}
          {renderMetricRow('Sync State Label', statusLabel)}
        </div>

        <div
          style={{
            backgroundColor: palette.surfaceRaised,
            borderRadius: `${radii.sm}px`,
            padding: `${spacing.sm}px ${spacing.md}px`,
            border: `1px solid ${palette.border.subtle}`,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '13px', color: palette.text.primary, marginBottom: `${spacing.xs}px` }}>
            Queue & History Metrics
          </div>
          {renderMetricRow('Queued Mutations', diagnostics.queueLength)}
          {renderMetricRow('In-Flight Batches', diagnostics.inFlightCount)}
          {renderMetricRow('Failed Operations', diagnostics.failedCount)}
          {renderMetricRow('Active Conflicts', diagnostics.activeConflictsCount)}
          {renderMetricRow('Consecutive Failures', diagnostics.consecutiveFailures)}
          {renderMetricRow('Last Synced', diagnostics.lastSyncedAt ? new Date(diagnostics.lastSyncedAt).toLocaleString() : 'Never')}
          {renderMetricRow('Last Sync Sequence', diagnostics.lastSyncSequence)}
          {renderMetricRow('Access Epoch', diagnostics.accessEpochRedacted || 'None')}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: `${spacing.xs}px`,
            flexWrap: 'wrap',
            gap: `${spacing.sm}px`,
          }}
        >
          <div style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}>
            {onSyncNow && (
              <Button
                variant="primary"
                themeMode={themeMode}
                disabled={isSyncing || diagnostics.networkStatus === 'offline'}
                onClick={() => void handleSync()}
              >
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            )}
            {onRefresh && (
              <Button
                variant="secondary"
                themeMode={themeMode}
                disabled={isRefreshing}
                onClick={() => void handleRefresh()}
              >
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
            )}
            {onOpenRecoveryExport && (
              <Button
                variant="secondary"
                themeMode={themeMode}
                onClick={onOpenRecoveryExport}
              >
                Export Recovery Data
              </Button>
            )}
            {onReviewConflicts && diagnostics.activeConflictsCount > 0 && (
              <Button
                variant="primary"
                themeMode={themeMode}
                onClick={onReviewConflicts}
              >
                Review Conflicts ({diagnostics.activeConflictsCount})
              </Button>
            )}
          </div>

          <Button variant="secondary" themeMode={themeMode} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
