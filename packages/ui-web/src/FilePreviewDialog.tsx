'use client';

import React, { useCallback, useEffect, useId, useState } from 'react';
import { colors, radii, spacing, typography, type ThemeMode } from '@daynori/design-tokens';
import {
  formatByteSize,
  getFilePreviewKind,
  isSafeToPreview,
  type FilePreviewKind,
} from '@daynori/domain';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Feedback } from './Feedback';

export interface FileItemRecord {
  id: string;
  fileName: string;
  detectedMimeType?: string;
  byteSize: number;
  version: number;
  quarantineStatus: 'quarantined' | 'verified' | 'rejected' | 'deleted';
  sha256Checksum: string;
  folderName?: string | null;
  verifiedAt?: string | null;
  createdAt?: string;
  isOfflineAvailable?: boolean;
  rejectionReason?: string | null;
}

export interface FilePreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode?: ThemeMode;
  file: FileItemRecord | null;
  workspaceId: string;
  onRequestDownloadUrl?: (file: FileItemRecord) => Promise<string>;
  onToggleOffline?: (file: FileItemRecord, enableOffline: boolean) => Promise<void>;
  onDelete?: (file: FileItemRecord) => Promise<void>;
}

export const FilePreviewDialog: React.FC<FilePreviewDialogProps> = ({
  isOpen,
  onClose,
  themeMode = 'light',
  file,
  workspaceId: _workspaceId,
  onRequestDownloadUrl,
  onToggleOffline,
  onDelete,
}) => {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState<boolean>(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isOfflineActive, setIsOfflineActive] = useState<boolean>(false);
  const [isUpdatingOffline, setIsUpdatingOffline] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [textContent, setTextContent] = useState<string | null>(null);

  const palette = colors[themeMode];
  const liveRegionId = useId();

  const fetchCapabilityUrl = useCallback(async () => {
    if (!file || file.quarantineStatus !== 'verified') {
      setDownloadUrl(null);
      return;
    }

    if (!onRequestDownloadUrl) {
      setUrlError('Download link generator not configured.');
      return;
    }

    setIsLoadingUrl(true);
    setUrlError(null);

    try {
      const url = await onRequestDownloadUrl(file);
      setDownloadUrl(url);

      if (file.detectedMimeType === 'text/plain' || file.detectedMimeType === 'text/markdown') {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const txt = await res.text();
            setTextContent(txt);
          }
        } catch {
          /* ignore */
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to obtain download capability.';
      setUrlError(msg);
      setDownloadUrl(null);
    } finally {
      setIsLoadingUrl(false);
    }
  }, [file, onRequestDownloadUrl]);

  useEffect(() => {
    if (isOpen && file) {
      setIsOfflineActive(Boolean(file.isOfflineAvailable));
      setTextContent(null);
      void fetchCapabilityUrl();
    } else {
      setDownloadUrl(null);
      setTextContent(null);
      setUrlError(null);
    }
  }, [isOpen, file, fetchCapabilityUrl]);

  if (!file) return null;

  const previewKind: FilePreviewKind = file.detectedMimeType
    ? getFilePreviewKind(file.detectedMimeType)
    : 'unsupported';

  const canPreview = isSafeToPreview(file.quarantineStatus, file.detectedMimeType);

  const handleToggleOfflineClick = async () => {
    if (!onToggleOffline || isUpdatingOffline) return;
    setIsUpdatingOffline(true);
    try {
      const nextState = !isOfflineActive;
      await onToggleOffline(file, nextState);
      setIsOfflineActive(nextState);
    } finally {
      setIsUpdatingOffline(false);
    }
  };

  const handleDeleteClick = async () => {
    if (!onDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(file);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={file.fileName}
      description={`Version ${file.version} • ${formatByteSize(file.byteSize)} • ${
        file.folderName ? `Folder: ${file.folderName}` : 'Workspace Inbox'
      }`}
      themeMode={themeMode}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
        {/* Status Badges Header */}
        <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: radii.pill,
              fontSize: typography.webScale.metadata,
              fontWeight: 600,
              backgroundColor:
                file.quarantineStatus === 'verified'
                  ? palette.action.subtle
                  : file.quarantineStatus === 'rejected'
                    ? '#fee2e2'
                    : '#fef3c7',
              color:
                file.quarantineStatus === 'verified'
                  ? palette.action.primary
                  : file.quarantineStatus === 'rejected'
                    ? palette.status.danger
                    : palette.status.warning,
            }}
          >
            {file.quarantineStatus === 'verified'
              ? '✓ Verified Clean'
              : file.quarantineStatus === 'rejected'
                ? '✕ Security Rejected'
                : '⏳ Quarantine Pending'}
          </span>

          {isOfflineActive && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: radii.pill,
                fontSize: typography.webScale.metadata,
                fontWeight: 600,
                backgroundColor: palette.surfaceRaised,
                color: palette.text.secondary,
                border: `1px solid ${palette.border.subtle}`,
              }}
            >
              📥 Available Offline
            </span>
          )}

          <span
            style={{
              fontSize: typography.webScale.metadata,
              color: palette.text.muted,
              marginLeft: 'auto',
            }}
          >
            SHA-256: {file.sha256Checksum.slice(0, 12)}...
          </span>
        </div>

        {/* Live region for accessibility */}
        <div
          id={liveRegionId}
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
          }}
        >
          {isLoadingUrl && 'Generating secure preview URL...'}
          {urlError && `Download capability error: ${urlError}`}
        </div>

        {/* Quarantine / Security Alert */}
        {file.quarantineStatus !== 'verified' && (
          <Feedback
            severity={file.quarantineStatus === 'rejected' ? 'danger' : 'warning'}
            message={
              file.quarantineStatus === 'rejected'
                ? 'This file was rejected by malware and active content inspection. Download and preview are blocked.'
                : 'This file is currently in quarantine and undergoing security analysis. Preview is disabled until verification succeeds.'
            }
            themeMode={themeMode}
          />
        )}

        {/* Preview Container (Only for verified files) */}
        {canPreview && (
          <div
            style={{
              backgroundColor: palette.surfaceRaised,
              border: `1px solid ${palette.border.subtle}`,
              borderRadius: radii.card,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 220,
              maxHeight: 460,
              position: 'relative',
            }}
          >
            {previewKind === 'office' ? (
              <div
                style={{
                  padding: `${spacing.lg}px`,
                  width: '100%',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: `${spacing.sm}px`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                  <span style={{ fontSize: 36 }} aria-hidden="true">
                    📄
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, color: palette.text.primary }}>
                      {file.fileName}
                    </div>
                    <div
                      style={{
                        fontSize: typography.webScale.metadata,
                        color: palette.text.secondary,
                      }}
                    >
                      {file.detectedMimeType} • {formatByteSize(file.byteSize)}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: spacing.sm,
                    backgroundColor: palette.surface,
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.border.subtle}`,
                    fontSize: typography.webScale.metadata,
                    color: palette.text.secondary,
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Office Document Notice:</strong> In-browser office document editing is not
                  supported in this release. You can download the verified original file to view or
                  edit in Microsoft Word, Excel, or LibreOffice.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 4 }}>
                  <a
                    href={downloadUrl || '#'}
                    download={file.fileName}
                    style={{ textDecoration: 'none' }}
                  >
                    <Button variant="primary" themeMode={themeMode}>
                      📥 Download Document
                    </Button>
                  </a>
                </div>
              </div>
            ) : (
              <>
                {isLoadingUrl && (
                  <div style={{ color: palette.text.secondary, padding: spacing.lg }}>
                    Loading preview...
                  </div>
                )}

                {urlError && !downloadUrl && (
                  <div style={{ padding: spacing.md, textAlign: 'center' }}>
                    <p style={{ color: palette.status.danger, margin: '0 0 8px 0' }}>{urlError}</p>
                    <Button variant="secondary" themeMode={themeMode} onClick={fetchCapabilityUrl}>
                      Retry Link
                    </Button>
                  </div>
                )}

                {downloadUrl && !isLoadingUrl && (
                  <>
                    {/* 1. Image Preview */}
                    {previewKind === 'image' && (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: spacing.sm,
                          boxSizing: 'border-box',
                        }}
                      >
                        <img
                          src={downloadUrl}
                          alt={file.fileName}
                          style={{
                            maxWidth: '100%',
                            maxHeight: 380,
                            objectFit: 'contain',
                            borderRadius: radii.sm,
                          }}
                        />
                      </div>
                    )}

                    {/* 2. PDF Preview */}
                    {previewKind === 'pdf' && (
                      <div
                        style={{
                          width: '100%',
                          height: 380,
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        <iframe
                          src={downloadUrl}
                          title={`Preview of ${file.fileName}`}
                          sandbox="allow-scripts"
                          style={{
                            width: '100%',
                            flex: 1,
                            border: 'none',
                          }}
                        />
                        <div
                          style={{
                            padding: `${spacing.xs}px ${spacing.sm}px`,
                            backgroundColor: palette.surface,
                            borderTop: `1px solid ${palette.border.subtle}`,
                            display: 'flex',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <a
                            href={downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: typography.webScale.metadata,
                              color: palette.action.primary,
                              textDecoration: 'none',
                              fontWeight: 500,
                            }}
                          >
                            Open PDF in full tab ↗
                          </a>
                        </div>
                      </div>
                    )}

                    {/* 3. Text / Markdown Inert Preview */}
                    {previewKind === 'text' && (
                      <div
                        style={{
                          width: '100%',
                          maxHeight: 380,
                          overflowY: 'auto',
                          padding: spacing.md,
                          boxSizing: 'border-box',
                          backgroundColor: palette.surface,
                        }}
                      >
                        <pre
                          style={{
                            margin: 0,
                            fontFamily: 'monospace, monospace',
                            fontSize: typography.webScale.metadata,
                            color: palette.text.primary,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                          }}
                        >
                          {textContent ?? 'Loading file text...'}
                        </pre>
                      </div>
                    )}

                    {/* 4. Audio Player */}
                    {previewKind === 'audio' && (
                      <div style={{ padding: spacing.lg, width: '100%', textAlign: 'center' }}>
                        <audio controls src={downloadUrl} style={{ width: '100%', maxWidth: 400 }}>
                          Your browser does not support audio playback.
                        </audio>
                      </div>
                    )}

                    {/* 5. Unsupported format fallback */}
                    {previewKind === 'unsupported' && (
                      <div style={{ padding: spacing.lg, textAlign: 'center' }}>
                        <p style={{ color: palette.text.secondary }}>
                          No direct preview available for this file type ({file.detectedMimeType}).
                        </p>
                        <a
                          href={downloadUrl}
                          download={file.fileName}
                          style={{ textDecoration: 'none' }}
                        >
                          <Button variant="primary" themeMode={themeMode}>
                            Download File
                          </Button>
                        </a>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Metadata Details Table */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '120px 1fr',
            rowGap: 6,
            fontSize: typography.webScale.metadata,
            color: palette.text.secondary,
            padding: `${spacing.xs}px ${spacing.sm}px`,
          }}
        >
          <span style={{ fontWeight: 600 }}>File Type:</span>
          <span>{file.detectedMimeType || 'Unknown'}</span>

          <span style={{ fontWeight: 600 }}>File Size:</span>
          <span>
            {formatByteSize(file.byteSize)} ({file.byteSize.toLocaleString()} bytes)
          </span>

          <span style={{ fontWeight: 600 }}>Checksum:</span>
          <span style={{ fontFamily: 'monospace, monospace', wordBreak: 'break-all' }}>
            {file.sha256Checksum}
          </span>

          {file.verifiedAt && (
            <>
              <span style={{ fontWeight: 600 }}>Verified At:</span>
              <span>{new Date(file.verifiedAt).toLocaleString()}</span>
            </>
          )}
        </div>

        {/* Action Controls Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: `${spacing.sm}px`,
            flexWrap: 'wrap',
            gap: `${spacing.sm}px`,
          }}
        >
          <div style={{ display: 'flex', gap: spacing.xs }}>
            {onToggleOffline && file.quarantineStatus === 'verified' && (
              <Button
                variant={isOfflineActive ? 'secondary' : 'subtle'}
                themeMode={themeMode}
                disabled={isUpdatingOffline}
                onClick={handleToggleOfflineClick}
              >
                {isOfflineActive ? 'Remove Offline Copy' : 'Save for Offline'}
              </Button>
            )}

            {onDelete && (
              <Button
                variant="subtle"
                themeMode={themeMode}
                disabled={isDeleting}
                onClick={handleDeleteClick}
                style={{ color: palette.status.danger }}
              >
                Delete File
              </Button>
            )}
          </div>

          <div style={{ display: 'flex', gap: spacing.xs }}>
            {downloadUrl && file.quarantineStatus === 'verified' && (
              <a href={downloadUrl} download={file.fileName} style={{ textDecoration: 'none' }}>
                <Button variant="primary" themeMode={themeMode}>
                  Download
                </Button>
              </a>
            )}
            <Button variant="secondary" themeMode={themeMode} onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
