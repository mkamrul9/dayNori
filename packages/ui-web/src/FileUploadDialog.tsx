'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  colors,
  radii,
  spacing,
  touchTargets,
  typography,
  type ThemeMode,
} from '@daynori/design-tokens';
import { formatByteSize, type ClientUploadStatus } from '@daynori/domain';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Feedback } from './Feedback';
import { StorageUsageBar } from './StorageUsageBar';

export interface FileFolderOption {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string | null;
}

export interface UploadedFileItem {
  id?: string;
  fileName?: string;
  byteSize?: number;
  quarantineStatus?: 'quarantined' | 'verified' | 'rejected' | 'deleted';
  rejectionReason?: string | null;
  detectedMimeType?: string;
  [key: string]: unknown;
}

export interface UploadExecutionResult {
  success: boolean;
  fileItem?: UploadedFileItem;
  quarantineStatus?: 'verified' | 'rejected' | 'quarantined';
  rejectionReason?: string;
  error?: string;
}

export interface FileUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode?: ThemeMode;
  workspaceId: string;
  folders: FileFolderOption[];
  initialFolderId?: string | null;
  storedBytes: number;
  reservedBytes: number;
  maxBytes: number;
  onPerformUpload?: (
    file: File,
    folderId: string | null,
    onProgress: (percent: number, loaded: number) => void,
    abortSignal?: AbortSignal
  ) => Promise<UploadExecutionResult>;
  onUploadSuccess?: (file: UploadedFileItem) => void;
}

// Supported MIME types allowlist for UI check
const SUPPORTED_UI_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
];

const MAX_GENERAL_BYTES = 25 * 1024 * 1024;
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

export const FileUploadDialog: React.FC<FileUploadDialogProps> = ({
  isOpen,
  onClose,
  themeMode = 'light',
  workspaceId,
  folders,
  initialFolderId = null,
  storedBytes,
  reservedBytes,
  maxBytes,
  onPerformUpload,
  onUploadSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(initialFolderId);
  const [uploadStatus, setUploadStatus] = useState<ClientUploadStatus>('idle');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [transferredBytes, setTransferredBytes] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadedFileItem, setUploadedFileItem] = useState<UploadedFileItem | null>(null);

  const statusAnnounceId = useId();
  const palette = colors[themeMode];

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setTargetFolderId(initialFolderId);
      setUploadStatus('idle');
      setProgressPercent(0);
      setTransferredBytes(0);
      setErrorMessage(null);
      setRejectionReason(null);
      setUploadedFileItem(null);
      abortControllerRef.current = null;
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [isOpen, initialFolderId]);

  const handleFileSelect = (file: File) => {
    setErrorMessage(null);
    setRejectionReason(null);

    const isAudio = file.type.startsWith('audio/');
    const maxAllowed = isAudio ? MAX_AUDIO_BYTES : MAX_GENERAL_BYTES;

    if (file.size > maxAllowed) {
      setErrorMessage(
        `File exceeds maximum allowed size of ${formatByteSize(maxAllowed)} (selected file is ${formatByteSize(file.size)}).`
      );
      setSelectedFile(null);
      return;
    }

    if (file.size === 0) {
      setErrorMessage('Empty files (0 bytes) cannot be uploaded.');
      setSelectedFile(null);
      return;
    }

    const declaredMime = file.type || 'application/octet-stream';
    const isAllowed = SUPPORTED_UI_MIME_TYPES.includes(declaredMime);
    if (!isAllowed) {
      setErrorMessage(
        `Unsupported file type '${declaredMime}'. Supported types: Images (JPEG, PNG, WebP, GIF), Documents (PDF, DOC, DOCX, XLSX, Text), Audio (MP3, WAV, OGG, WebM).`
      );
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setUploadStatus('idle');
  };

  const startUpload = useCallback(async () => {
    if (!selectedFile || !workspaceId) return;

    if (!onPerformUpload) {
      setErrorMessage('Upload executor is not configured.');
      setUploadStatus('failed');
      return;
    }

    setUploadStatus('reserving');
    setErrorMessage(null);
    setRejectionReason(null);
    setProgressPercent(0);
    setTransferredBytes(0);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setUploadStatus('uploading');

      const result = await onPerformUpload(
        selectedFile,
        targetFolderId,
        (percent, loaded) => {
          setProgressPercent(percent);
          setTransferredBytes(loaded);
          if (percent >= 100) {
            setUploadStatus('verifying');
          }
        },
        abortController.signal
      );

      if (abortController.signal.aborted) {
        setUploadStatus('cancelled');
        setErrorMessage('Upload cancelled locally.');
        return;
      }

      if (result.success && result.fileItem) {
        if (
          result.quarantineStatus === 'verified' ||
          result.fileItem.quarantineStatus === 'verified'
        ) {
          setUploadStatus('ready');
          setUploadedFileItem(result.fileItem);
          if (onUploadSuccess) onUploadSuccess(result.fileItem);
        } else if (
          result.quarantineStatus === 'rejected' ||
          result.fileItem.quarantineStatus === 'rejected'
        ) {
          setUploadStatus('rejected');
          setRejectionReason(
            result.rejectionReason ||
              result.fileItem.rejectionReason ||
              'Security policy or malware inspection rejected the file.'
          );
        } else {
          setUploadStatus('verifying');
          setUploadedFileItem(result.fileItem);
        }
      } else {
        if (result.quarantineStatus === 'rejected') {
          setUploadStatus('rejected');
          setRejectionReason(result.rejectionReason || 'Security policy rejected the file.');
        } else {
          setUploadStatus('failed');
          setErrorMessage(result.error || 'Upload failed.');
        }
      }
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        setUploadStatus('cancelled');
        setErrorMessage('Upload cancelled locally.');
        return;
      }
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setUploadStatus('failed');
      setErrorMessage(message);
    }
  }, [selectedFile, workspaceId, targetFolderId, onPerformUpload, onUploadSuccess]);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUploadStatus('cancelled');
    setErrorMessage(
      'Upload cancelled locally. The local transfer was stopped; server reservation will expire safely.'
    );
  };

  const handleRetry = () => {
    void startUpload();
  };

  const folderOptions = [
    { id: '', name: '📁 Workspace Inbox (Unfiled)' },
    ...folders.map((f) => ({
      id: f.id,
      name: `${f.icon ?? '📁'} ${f.name}`,
    })),
  ];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={uploadStatus === 'uploading' ? handleCancel : onClose}
      title="Upload File"
      description="Upload documents, images, or files into your canonical workspace folders."
      themeMode={themeMode}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
        {/* Storage Quota Bar */}
        <StorageUsageBar
          storedBytes={storedBytes}
          reservedBytes={reservedBytes}
          maxBytes={maxBytes}
          themeMode={themeMode}
        />

        {/* Live region for accessibility announcements */}
        <div
          id={statusAnnounceId}
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
          {uploadStatus === 'uploading' && `Uploading: ${progressPercent}% complete`}
          {uploadStatus === 'verifying' && 'Scanning and verifying uploaded binary...'}
          {uploadStatus === 'ready' && 'File successfully verified and ready.'}
          {uploadStatus === 'rejected' && `File rejected: ${rejectionReason}`}
          {uploadStatus === 'failed' && `Upload failed: ${errorMessage}`}
          {uploadStatus === 'cancelled' && 'Upload cancelled.'}
        </div>

        {/* Folder Placement Selector */}
        <div>
          <label
            htmlFor="upload-folder-select"
            style={{
              display: 'block',
              fontSize: typography.webScale.supporting,
              fontWeight: 600,
              color: palette.text.primary,
              marginBottom: 4,
            }}
          >
            Folder Destination
          </label>
          <select
            id="upload-folder-select"
            value={targetFolderId ?? ''}
            disabled={uploadStatus === 'uploading' || uploadStatus === 'verifying'}
            onChange={(e) => setTargetFolderId(e.target.value ? e.target.value : null)}
            style={{
              width: '100%',
              minHeight: touchTargets.webMin,
              padding: '8px 12px',
              borderRadius: radii.sm,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              fontSize: typography.webScale.supporting,
            }}
          >
            {folderOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>

        {/* Drag and Drop / Picker Box */}
        {uploadStatus !== 'ready' && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) handleFileSelect(dropped);
            }}
            style={{
              border: `2px dashed ${isDragging ? palette.action.primary : palette.border.subtle}`,
              borderRadius: radii.card,
              backgroundColor: isDragging ? palette.action.subtle : palette.surfaceRaised,
              padding: `${spacing.lg}px`,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: `${spacing.sm}px`,
              transition: 'background-color 150ms ease, border-color 150ms ease',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              id="file-upload-input"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />

            <div style={{ fontSize: '32px' }} aria-hidden="true">
              📤
            </div>

            <div style={{ color: palette.text.primary, fontWeight: 600 }}>
              {selectedFile ? selectedFile.name : 'Choose a file or drag & drop here'}
            </div>

            <div style={{ fontSize: typography.webScale.metadata, color: palette.text.secondary }}>
              {selectedFile
                ? `${formatByteSize(selectedFile.size)} • ${selectedFile.type || 'binary'}`
                : 'Images (JPEG, PNG, WebP), Documents (PDF, DOC, DOCX), Audio (up to 25 MB)'}
            </div>

            <Button
              type="button"
              variant="secondary"
              themeMode={themeMode}
              disabled={uploadStatus === 'uploading' || uploadStatus === 'verifying'}
              onClick={() => fileInputRef.current?.click()}
            >
              {selectedFile ? 'Change File' : 'Browse Files'}
            </Button>
          </div>
        )}

        {/* Upload Progress Bar */}
        {(uploadStatus === 'uploading' || uploadStatus === 'verifying') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: typography.webScale.metadata,
                color: palette.text.secondary,
              }}
            >
              <span>
                {uploadStatus === 'verifying'
                  ? 'Verifying and scanning for safety...'
                  : `Uploading (${progressPercent}%)`}
              </span>
              <span>
                {uploadStatus === 'uploading' && selectedFile
                  ? `${formatByteSize(transferredBytes)} / ${formatByteSize(selectedFile.size)}`
                  : ''}
              </span>
            </div>

            <div
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                height: 8,
                width: '100%',
                backgroundColor: palette.surfaceRaised,
                borderRadius: radii.pill,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${uploadStatus === 'verifying' ? 100 : progressPercent}%`,
                  backgroundColor:
                    uploadStatus === 'verifying' ? palette.status.info : palette.action.primary,
                  transition: 'width 150ms ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Ready / Success State */}
        {uploadStatus === 'ready' && uploadedFileItem && (
          <Feedback
            severity="success"
            message={`File '${uploadedFileItem.fileName ?? 'uploaded'}' (${formatByteSize(
              uploadedFileItem.byteSize ?? 0
            )}) verified and saved successfully.`}
            themeMode={themeMode}
          />
        )}

        {/* Rejected State */}
        {uploadStatus === 'rejected' && (
          <Feedback
            severity="danger"
            message={`File rejected by security scanner: ${
              rejectionReason || 'Malicious content or active script vectors detected.'
            }`}
            themeMode={themeMode}
          />
        )}

        {/* Failed / Cancelled State */}
        {(uploadStatus === 'failed' || uploadStatus === 'cancelled' || errorMessage) && (
          <Feedback
            severity={uploadStatus === 'cancelled' ? 'info' : 'danger'}
            message={errorMessage || 'An error occurred during upload.'}
            themeMode={themeMode}
          />
        )}

        {/* Modal Action Controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: `${spacing.sm}px`,
            marginTop: `${spacing.sm}px`,
          }}
        >
          {uploadStatus === 'uploading' && (
            <Button variant="secondary" themeMode={themeMode} onClick={handleCancel}>
              Cancel Upload
            </Button>
          )}

          {(uploadStatus === 'failed' || uploadStatus === 'cancelled') && (
            <Button variant="primary" themeMode={themeMode} onClick={handleRetry}>
              Retry Upload
            </Button>
          )}

          {uploadStatus === 'idle' && (
            <>
              <Button variant="secondary" themeMode={themeMode} onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                themeMode={themeMode}
                disabled={!selectedFile}
                onClick={startUpload}
              >
                Upload File
              </Button>
            </>
          )}

          {uploadStatus === 'ready' && (
            <Button variant="primary" themeMode={themeMode} onClick={onClose}>
              Done
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
};
