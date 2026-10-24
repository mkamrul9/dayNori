import React, { useState } from 'react';
import { colors, radii, spacing } from '@daynori/design-tokens';
import type { RecoveryExport } from '@daynori/sync';
import { Button } from './Button.js';
import { Dialog } from './Dialog.js';
import { Feedback } from './Feedback.js';

export interface RecoveryExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  exportData: RecoveryExport | null;
  themeMode?: 'light' | 'dark';
}

export const RecoveryExportDialog: React.FC<RecoveryExportDialogProps> = ({
  isOpen,
  onClose,
  exportData,
  themeMode = 'light',
}) => {
  const palette = colors[themeMode];
  const [copied, setCopied] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  if (!exportData) return null;

  const jsonString = JSON.stringify(exportData, null, 2);

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `daynori-recovery-${exportData.workspaceId.slice(0, 8)}-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonString);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = jsonString;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore clipboard error
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Export Local Recovery Data"
      description="Export recoverable offline drafts, pending mutations, and conflict records to your local device. No data is sent to any external server."
      themeMode={themeMode}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
        <Feedback
          severity="warning"
          message="Security Notice: Exported recovery data is unencrypted plain JSON. Store the file securely. Credentials, session tokens, and vault plaintexts are excluded."
          themeMode={themeMode}
        />

        <div
          style={{
            backgroundColor: palette.surfaceRaised,
            borderRadius: `${radii.sm}px`,
            padding: `${spacing.md}px`,
            border: `1px solid ${palette.border.subtle}`,
            display: 'flex',
            flexDirection: 'column',
            gap: `${spacing.xs}px`,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '13px', color: palette.text.primary, marginBottom: '4px' }}>
            Recovery Export Summary
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: palette.text.secondary }}>Uncommitted Offline Drafts:</span>
            <span style={{ fontWeight: 600, color: palette.text.primary }}>
              {exportData.summary.draftsCount}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: palette.text.secondary }}>Queued Local Mutations:</span>
            <span style={{ fontWeight: 600, color: palette.text.primary }}>
              {exportData.summary.pendingMutationsCount}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: palette.text.secondary }}>Active Conflict Records:</span>
            <span style={{ fontWeight: 600, color: palette.text.primary }}>
              {exportData.summary.conflictsCount}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: palette.text.secondary }}>Unfinalized File Attachments:</span>
            <span style={{ fontWeight: 600, color: palette.text.primary }}>
              {exportData.summary.unfinalizedFilesCount}
            </span>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowRawJson(!showRawJson)}
            style={{
              background: 'none',
              border: 'none',
              color: palette.action.primary,
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {showRawJson ? 'Hide JSON preview' : 'View raw JSON preview'}
          </button>

          {showRawJson && (
            <pre
              style={{
                marginTop: `${spacing.xs}px`,
                padding: `${spacing.sm}px`,
                backgroundColor: palette.surface,
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.subtle}`,
                fontSize: '11px',
                color: palette.text.secondary,
                maxHeight: '220px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {jsonString}
            </pre>
          )}
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
            <Button variant="primary" themeMode={themeMode} onClick={handleDownload}>
              Download JSON File
            </Button>
            <Button variant="secondary" themeMode={themeMode} onClick={() => void handleCopy()}>
              {copied ? 'Copied to Clipboard!' : 'Copy to Clipboard'}
            </Button>
          </div>

          <Button variant="secondary" themeMode={themeMode} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
