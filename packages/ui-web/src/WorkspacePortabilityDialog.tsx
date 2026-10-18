import React, { useState } from 'react';
import { colors, radii, spacing, touchTargets } from '@daynori/design-tokens';
import type {
  CreateExportResponse,
  ImportPreviewResponse,
  ExecuteImportResponse,
  ImportDuplicateStrategy,
  ImportDuplicateItem,
} from '@daynori/contracts';
import { Button } from './Button.js';
import { Dialog } from './Dialog.js';
import { Feedback } from './Feedback.js';

export interface WorkspacePortabilityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  themeMode?: 'light' | 'dark';
  initialTab?: 'export' | 'import';
  // Export callbacks
  onRequestExport: (password?: string) => Promise<CreateExportResponse>;
  // Import callbacks
  onPreviewImport: (archiveBase64: string) => Promise<ImportPreviewResponse>;
  onExecuteImport: (previewId: string, strategy: ImportDuplicateStrategy) => Promise<ExecuteImportResponse>;
}

export const WorkspacePortabilityDialog: React.FC<WorkspacePortabilityDialogProps> = ({
  isOpen,
  onClose,
  workspaceId: _workspaceId,
  themeMode = 'light',
  initialTab = 'export',
  onRequestExport,
  onPreviewImport,
  onExecuteImport,
}) => {
  const palette = colors[themeMode];
  const [activeTab, setActiveTab] = useState<'export' | 'import'>(initialTab);

  // Export State
  const [password, setPassword] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<CreateExportResponse | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Import State
  const [isUploading, setIsUploading] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewResponse | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<ImportDuplicateStrategy>('create_copy');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ExecuteImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const res = await onRequestExport(password || undefined);
      setExportResult(res);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setImportError(null);
    setImportPreview(null);
    setImportResult(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      // Convert buffer to base64
      let binary = '';
      const bytes = new Uint8Array(arrayBuffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const base64 = btoa(binary);

      const preview = await onPreviewImport(base64);
      setImportPreview(preview);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const res = await onExecuteImport(importPreview.previewId, selectedStrategy);
      setImportResult(res);
      setImportPreview(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Workspace Portability (Export & Import)"
      themeMode={themeMode}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
        {/* Tab Navigation */}
        <div
          role="tablist"
          aria-label="Portability Operations"
          style={{
            display: 'flex',
            gap: `${spacing.xs}px`,
            borderBottom: `1px solid ${palette.border.subtle}`,
            paddingBottom: `${spacing.xs}px`,
          }}
        >
          <button
            role="tab"
            aria-selected={activeTab === 'export'}
            id="tab-export"
            type="button"
            onClick={() => {
              setActiveTab('export');
              setExportError(null);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: `${radii.sm}px`,
              border: 'none',
              backgroundColor: activeTab === 'export' ? palette.action.primary : 'transparent',
              color: activeTab === 'export' ? palette.action.label : palette.text.secondary,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: `${touchTargets.webMin}px`,
            }}
          >
            📦 Export Workspace
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'import'}
            id="tab-import"
            type="button"
            onClick={() => {
              setActiveTab('import');
              setImportError(null);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: `${radii.sm}px`,
              border: 'none',
              backgroundColor: activeTab === 'import' ? palette.action.primary : 'transparent',
              color: activeTab === 'import' ? palette.action.label : palette.text.secondary,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: `${touchTargets.webMin}px`,
            }}
          >
            📥 Import Archive
          </button>
        </div>

        {/* Tab 1: Export Flow */}
        {activeTab === 'export' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
            <p style={{ margin: 0, fontSize: '14px', color: palette.text.secondary, lineHeight: 1.5 }}>
              Create a portable archive of your core workspace. Notes, tasks, routines, journal entries,
              calendar events, and file attachments are bundled in open, documented formats (JSON,
              Markdown, CSV, and binaries) with a cryptographic manifest.
            </p>

            <Feedback
              severity="warning"
              message="Vault & External Drive Notice: Encrypted vault plaintexts and external Google Drive mirrors require separate policies and are excluded from this core archive."
              themeMode={themeMode}
            />

            {exportError && (
              <Feedback severity="danger" message={exportError} themeMode={themeMode} />
            )}

            {!exportResult ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: `${spacing.sm}px`,
                  backgroundColor: palette.surfaceRaised,
                  padding: `${spacing.md}px`,
                  borderRadius: `${radii.card}px`,
                }}
              >
                <label
                  htmlFor="export-password-input"
                  style={{ fontSize: '13px', fontWeight: 600, color: palette.text.primary }}
                >
                  Confirm Password or Reauthentication:
                </label>
                <input
                  id="export-password-input"
                  type="password"
                  placeholder="Enter current password if prompted"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: `${radii.sm}px`,
                    border: `1px solid ${palette.border.subtle}`,
                    backgroundColor: palette.surface,
                    color: palette.text.primary,
                    fontSize: '14px',
                    minHeight: `${touchTargets.webMin}px`,
                  }}
                />

                <Button
                  id="btn-confirm-export"
                  variant="primary"
                  themeMode={themeMode}
                  onClick={handleStartExport}
                  disabled={isExporting}
                >
                  {isExporting ? 'Generating Export Archive...' : '🔒 Verify & Export Workspace (.zip)'}
                </Button>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: `${spacing.sm}px`,
                  backgroundColor: palette.surfaceRaised,
                  padding: `${spacing.md}px`,
                  borderRadius: `${radii.card}px`,
                }}
              >
                <h4 style={{ margin: 0, fontSize: '15px', color: palette.status.success }}>
                  ✓ Export Archive Ready
                </h4>
                <div style={{ fontSize: '13px', color: palette.text.primary, lineHeight: 1.6 }}>
                  <div>📁 Folders: {exportResult.manifestSummary.foldersCount}</div>
                  <div>📝 Notes: {exportResult.manifestSummary.notesCount}</div>
                  <div>✅ Tasks: {exportResult.manifestSummary.tasksCount}</div>
                  <div>🔄 Routines: {exportResult.manifestSummary.routinesCount}</div>
                  <div>📖 Journal Entries: {exportResult.manifestSummary.journalCount}</div>
                  <div>📅 Calendar Events: {exportResult.manifestSummary.calendarCount}</div>
                  <div>
                    📎 Attachments: {exportResult.manifestSummary.filesCount} (
                    {(exportResult.manifestSummary.totalBinaryBytes / 1024).toFixed(1)} KB)
                  </div>
                  <div style={{ color: palette.status.warning, marginTop: '6px' }}>
                    ⏳ Ephemeral link expires: {new Date(exportResult.expiresAt).toLocaleTimeString()}
                  </div>
                </div>

                {exportResult.downloadUrl && (
                  <a
                    id="btn-download-export-link"
                    href={exportResult.downloadUrl}
                    download
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '10px 16px',
                      borderRadius: `${radii.sm}px`,
                      backgroundColor: palette.action.primary,
                      color: palette.action.label,
                      fontWeight: 600,
                      textDecoration: 'none',
                      minHeight: `${touchTargets.webMin}px`,
                      textAlign: 'center',
                    }}
                  >
                    ⬇️ Download Export Archive (.zip)
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Import Flow */}
        {activeTab === 'import' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
            <p style={{ margin: 0, fontSize: '14px', color: palette.text.secondary, lineHeight: 1.5 }}>
              Import a validated Daynori workspace archive. The archive will be inspected for safety,
              path traversal, and duplicate entities before any database records are modified.
            </p>

            {importError && (
              <Feedback severity="danger" message={importError} themeMode={themeMode} />
            )}

            {importResult && (
              <Feedback
                severity="success"
                message={`Import completed successfully! Imported: ${importResult.importedCounts.notes} notes, ${importResult.importedCounts.tasks} tasks, ${importResult.importedCounts.journal} journal entries, ${importResult.importedCounts.files} files. (Skipped: ${importResult.skippedCounts}, Copied: ${importResult.copiedCounts}, Overwritten: ${importResult.overwrittenCounts}).`}
                themeMode={themeMode}
              />
            )}

            {!importPreview && !importResult && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: `${spacing.sm}px`,
                  backgroundColor: palette.surfaceRaised,
                  padding: `${spacing.md}px`,
                  borderRadius: `${radii.card}px`,
                  border: `2px dashed ${palette.border.subtle}`,
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                <label
                  htmlFor="import-file-input"
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: palette.text.primary,
                    cursor: 'pointer',
                  }}
                >
                  Select a Daynori Export Archive (.zip)
                </label>
                <input
                  id="import-file-input"
                  type="file"
                  accept=".zip,application/zip"
                  onChange={handleFileChange}
                  disabled={isUploading}
                  style={{ fontSize: '13px', color: palette.text.secondary }}
                />
                {isUploading && (
                  <span style={{ fontSize: '13px', color: palette.action.primary }}>
                    Verifying and inspecting archive...
                  </span>
                )}
              </div>
            )}

            {/* Preview Stage */}
            {importPreview && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: `${spacing.sm}px`,
                  backgroundColor: palette.surfaceRaised,
                  padding: `${spacing.md}px`,
                  borderRadius: `${radii.card}px`,
                }}
              >
                <h4 style={{ margin: 0, fontSize: '15px', color: palette.text.primary }}>
                  🔍 Import Archive Preview
                </h4>

                <div style={{ fontSize: '13px', color: palette.text.primary, lineHeight: 1.6 }}>
                  <div>📁 Folders: {importPreview.manifestSummary.foldersCount}</div>
                  <div>📝 Notes: {importPreview.manifestSummary.notesCount}</div>
                  <div>✅ Tasks: {importPreview.manifestSummary.tasksCount}</div>
                  <div>🔄 Routines: {importPreview.manifestSummary.routinesCount}</div>
                  <div>📖 Journal Entries: {importPreview.manifestSummary.journalCount}</div>
                  <div>📅 Calendar Events: {importPreview.manifestSummary.calendarCount}</div>
                  <div>
                    📎 Attachments: {importPreview.manifestSummary.filesCount} (
                    {(importPreview.storageQuota.requiredBytes / 1024).toFixed(1)} KB)
                  </div>
                </div>

                {/* Quota Check */}
                <div style={{ fontSize: '13px' }}>
                  {importPreview.storageQuota.isQuotaSufficient ? (
                    <span style={{ color: palette.status.success }}>
                      ✓ Storage quota sufficient (
                      {(importPreview.storageQuota.availableBytes / 1024).toFixed(1)} KB available)
                    </span>
                  ) : (
                    <span style={{ color: palette.status.danger }}>
                      ✗ Insufficient storage quota (requires{' '}
                      {(importPreview.storageQuota.requiredBytes / 1024).toFixed(1)} KB, only{' '}
                      {(importPreview.storageQuota.availableBytes / 1024).toFixed(1)} KB available)
                    </span>
                  )}
                </div>

                {/* Duplicates notice & strategy selector */}
                {importPreview.detectedDuplicates.length > 0 && (
                  <div
                    style={{
                      marginTop: `${spacing.xs}px`,
                      padding: `${spacing.sm}px`,
                      backgroundColor: palette.surface,
                      borderRadius: `${radii.sm}px`,
                      border: `1px solid ${palette.border.subtle}`,
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: palette.status.warning }}>
                      ⚠️ {importPreview.detectedDuplicates.length} Duplicate Entities Detected:
                    </div>
                    <ul style={{ margin: '6px 0 10px 16px', padding: 0, fontSize: '12px', color: palette.text.secondary }}>
                      {importPreview.detectedDuplicates.slice(0, 4).map((d: ImportDuplicateItem, i: number) => (
                        <li key={i}>
                          [{d.entityType}] {d.title}
                        </li>
                      ))}
                      {importPreview.detectedDuplicates.length > 4 && (
                        <li>...and {importPreview.detectedDuplicates.length - 4} more</li>
                      )}
                    </ul>

                    <label
                      htmlFor="duplicate-strategy-select"
                      style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}
                    >
                      Duplicate Resolution Strategy:
                    </label>
                    <select
                      id="duplicate-strategy-select"
                      value={selectedStrategy}
                      onChange={(e) => setSelectedStrategy(e.target.value as ImportDuplicateStrategy)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: `${radii.sm}px`,
                        border: `1px solid ${palette.border.subtle}`,
                        backgroundColor: palette.surfaceRaised,
                        color: palette.text.primary,
                        fontSize: '13px',
                        minHeight: `${touchTargets.webMin}px`,
                      }}
                    >
                      <option value="create_copy">Create separate copies with "(Copy)" suffix</option>
                      <option value="skip">Skip duplicates and keep existing items</option>
                      <option value="overwrite_if_newer">Overwrite existing items only if imported is newer</option>
                    </select>
                  </div>
                )}

                {/* Confirmation Actions */}
                <div style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: `${spacing.sm}px` }}>
                  <Button
                    id="btn-confirm-import-execute"
                    variant="primary"
                    themeMode={themeMode}
                    onClick={handleConfirmImport}
                    disabled={isImporting || !importPreview.storageQuota.isQuotaSufficient}
                  >
                    {isImporting ? 'Importing Workspace Data...' : '✓ Confirm & Import Data'}
                  </Button>
                  <Button
                    id="btn-cancel-import-preview"
                    variant="secondary"
                    themeMode={themeMode}
                    onClick={() => setImportPreview(null)}
                    disabled={isImporting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
};
