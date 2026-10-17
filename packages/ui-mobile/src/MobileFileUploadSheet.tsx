import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { formatByteSize, type ClientUploadStatus } from '@daynori/domain';
import { MobileButton } from './MobileButton';
import { MobileFeedback } from './MobileFeedback';
import { MobileModalSheet } from './MobileModalSheet';
import { MobileStorageUsageBar } from './MobileStorageUsageBar';

export interface MobileFileFolderOption {
  id: string;
  name: string;
  icon?: string;
}

export interface MobileSelectedFile {
  name: string;
  size: number;
  type: string;
  uri?: string;
  data?: ArrayBuffer;
}

export interface MobileFileUploadSheetProps {
  visible: boolean;
  onClose: () => void;
  themeMode?: ThemeMode;
  workspaceId?: string | null;
  folders: MobileFileFolderOption[];
  initialFolderId?: string | null;
  storedBytes: number;
  reservedBytes: number;
  maxBytes: number;
  onPickDocument?: () => Promise<MobileSelectedFile | null>;
  onUploadFile?: (
    file: MobileSelectedFile,
    folderId: string | null,
    onProgress?: (percent: number) => void
  ) => Promise<{ success: boolean; error?: string; rejectionReason?: string; fileItem?: unknown }>;
  onSuccess?: (fileItem: unknown) => void;
  testID?: string;
}

export const MobileFileUploadSheet: React.FC<MobileFileUploadSheetProps> = ({
  visible,
  onClose,
  themeMode = 'light',
  workspaceId: _workspaceId,
  folders,
  initialFolderId = null,
  storedBytes,
  reservedBytes,
  maxBytes,
  onPickDocument,
  onUploadFile,
  onSuccess,
  testID = 'mobile-file-upload-sheet',
}) => {
  const palette = colors[themeMode];
  const [selectedFile, setSelectedFile] = useState<MobileSelectedFile | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(initialFolderId);
  const [uploadStatus, setUploadStatus] = useState<ClientUploadStatus>('idle');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  const handleOpenDevicePicker = async () => {
    if (!onPickDocument) return;
    setErrorMessage(null);
    setRejectionReason(null);
    try {
      const picked = await onPickDocument();
      if (picked) {
        setSelectedFile(picked);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to pick file from device.');
    }
  };

  const handleSelectMockDocument = (preset: 'image' | 'pdf' | 'doc') => {
    setErrorMessage(null);
    setRejectionReason(null);
    if (preset === 'image') {
      setSelectedFile({
        name: 'field-inspection-photo.png',
        size: 512 * 1024,
        type: 'image/png',
      });
    } else if (preset === 'pdf') {
      setSelectedFile({
        name: 'Government-Application-Form.pdf',
        size: 1024 * 1024 * 2,
        type: 'application/pdf',
      });
    } else {
      setSelectedFile({
        name: 'Civil-Service-Guide.docx',
        size: 1024 * 768,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    }
  };

  const handleStartUpload = async () => {
    if (!selectedFile || !onUploadFile) return;

    setUploadStatus('uploading');
    setProgressPercent(20);
    setErrorMessage(null);
    setRejectionReason(null);

    try {
      const res = await onUploadFile(selectedFile, targetFolderId, (pct) => {
        setProgressPercent(pct);
        if (pct >= 100) setUploadStatus('verifying');
      });

      if (res.success) {
        setUploadStatus('ready');
        setProgressPercent(100);
        if (onSuccess) onSuccess(res.fileItem);
      } else {
        if (res.rejectionReason) {
          setUploadStatus('rejected');
          setRejectionReason(res.rejectionReason);
        } else {
          setUploadStatus('failed');
          setErrorMessage(res.error || 'Upload failed.');
        }
      }
    } catch (err: unknown) {
      setUploadStatus('failed');
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  const handleCancel = () => {
    setUploadStatus('cancelled');
    setErrorMessage('Upload was cancelled locally.');
  };

  return (
    <MobileModalSheet
      visible={visible}
      onClose={uploadStatus === 'uploading' ? handleCancel : onClose}
      title="Upload File"
      themeMode={themeMode}
      testID={testID}
    >
      <View style={styles.content}>
        {/* Storage Bar */}
        <MobileStorageUsageBar
          storedBytes={storedBytes}
          reservedBytes={reservedBytes}
          maxBytes={maxBytes}
          themeMode={themeMode}
        />

        {/* Folder Destination Selector */}
        <Text style={[styles.sectionLabel, { color: palette.text.secondary }]}>
          Folder Placement
        </Text>
        <View style={styles.folderRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select Workspace Inbox"
            accessibilityState={{ selected: targetFolderId === null }}
            onPress={() => setTargetFolderId(null)}
            style={[
              styles.folderPill,
              {
                backgroundColor:
                  targetFolderId === null ? palette.action.subtle : palette.surfaceRaised,
                borderColor:
                  targetFolderId === null ? palette.action.primary : palette.border.subtle,
              },
            ]}
          >
            <Text
              style={[
                styles.folderPillText,
                { color: targetFolderId === null ? palette.action.primary : palette.text.primary },
              ]}
            >
              📥 Inbox
            </Text>
          </Pressable>

          {folders.map((f) => {
            const isSelected = targetFolderId === f.id;
            return (
              <Pressable
                key={f.id}
                accessibilityRole="button"
                accessibilityLabel={`Select folder ${f.name}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => setTargetFolderId(f.id)}
                style={[
                  styles.folderPill,
                  {
                    backgroundColor: isSelected ? palette.action.subtle : palette.surfaceRaised,
                    borderColor: isSelected ? palette.action.primary : palette.border.subtle,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.folderPillText,
                    { color: isSelected ? palette.action.primary : palette.text.primary },
                  ]}
                >
                  {f.icon ?? '📁'} {f.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* File Selection Box */}
        {uploadStatus !== 'ready' && (
          <View
            style={[
              styles.pickerBox,
              { backgroundColor: palette.surfaceRaised, borderColor: palette.border.subtle },
            ]}
          >
            <Text style={{ fontSize: 32, marginBottom: spacing.xs }}>📄</Text>
            <Text style={[styles.pickerTitle, { color: palette.text.primary }]}>
              {selectedFile ? selectedFile.name : 'Select document to upload'}
            </Text>
            <Text style={[styles.pickerMeta, { color: palette.text.secondary }]}>
              {selectedFile
                ? `${formatByteSize(selectedFile.size)} • ${selectedFile.type}`
                : 'Choose a file format below (PDF, Image, DOC/DOCX)'}
            </Text>

            {/* Device File Picker */}
            {onPickDocument && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Browse device files"
                onPress={handleOpenDevicePicker}
                style={[
                  styles.devicePickBtn,
                  {
                    backgroundColor: palette.action.subtle,
                    borderColor: palette.action.primary,
                  },
                ]}
              >
                <Text style={[styles.devicePickBtnText, { color: palette.action.primary }]}>
                  📂 Browse Device Storage
                </Text>
              </Pressable>
            )}

            {/* Quick Picker Buttons */}
            <View style={styles.quickPickRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose Image file"
                onPress={() => handleSelectMockDocument('image')}
                style={[styles.quickPickBtn, { borderColor: palette.border.subtle }]}
              >
                <Text style={{ color: palette.text.primary, fontSize: 12 }}>🖼️ Image</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose PDF document"
                onPress={() => handleSelectMockDocument('pdf')}
                style={[styles.quickPickBtn, { borderColor: palette.border.subtle }]}
              >
                <Text style={{ color: palette.text.primary, fontSize: 12 }}>📕 PDF</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose Office document"
                onPress={() => handleSelectMockDocument('doc')}
                style={[styles.quickPickBtn, { borderColor: palette.border.subtle }]}
              >
                <Text style={{ color: palette.text.primary, fontSize: 12 }}>📘 DOCX</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Progress Bar */}
        {(uploadStatus === 'uploading' || uploadStatus === 'verifying') && (
          <View style={styles.progressContainer}>
            <Text style={[styles.progressText, { color: palette.text.secondary }]}>
              {uploadStatus === 'verifying'
                ? 'Verifying and scanning for safety...'
                : `Uploading ${progressPercent}%`}
            </Text>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
              style={[styles.progressBarTrack, { backgroundColor: palette.surfaceRaised }]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${uploadStatus === 'verifying' ? 100 : progressPercent}%`,
                    backgroundColor:
                      uploadStatus === 'verifying' ? palette.status.info : palette.action.primary,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* Feedbacks */}
        {uploadStatus === 'ready' && (
          <MobileFeedback
            severity="success"
            message={`File '${selectedFile?.name}' verified and uploaded successfully.`}
            themeMode={themeMode}
          />
        )}

        {uploadStatus === 'rejected' && (
          <MobileFeedback
            severity="danger"
            message={`File rejected: ${rejectionReason || 'Failed security quarantine verification.'}`}
            themeMode={themeMode}
          />
        )}

        {(uploadStatus === 'failed' || uploadStatus === 'cancelled' || errorMessage) && (
          <MobileFeedback
            severity={uploadStatus === 'cancelled' ? 'info' : 'danger'}
            message={errorMessage || 'Upload failed.'}
            themeMode={themeMode}
          />
        )}

        {/* Actions */}
        <View style={styles.actionRow}>
          {uploadStatus === 'uploading' && (
            <MobileButton variant="secondary" themeMode={themeMode} onPress={handleCancel}>
              Cancel
            </MobileButton>
          )}

          {(uploadStatus === 'failed' || uploadStatus === 'cancelled') && (
            <MobileButton variant="primary" themeMode={themeMode} onPress={handleStartUpload}>
              Retry
            </MobileButton>
          )}

          {uploadStatus === 'idle' && (
            <MobileButton
              variant="primary"
              themeMode={themeMode}
              disabled={!selectedFile}
              onPress={handleStartUpload}
            >
              Upload
            </MobileButton>
          )}

          {uploadStatus === 'ready' && (
            <MobileButton variant="primary" themeMode={themeMode} onPress={onClose}>
              Done
            </MobileButton>
          )}
        </View>
      </View>
    </MobileModalSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingVertical: spacing.sm,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  folderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  folderPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: touchTargets.mobileMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderPillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  pickerBox: {
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  pickerMeta: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  devicePickBtn: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radii.sm,
    borderWidth: 1,
    minHeight: touchTargets.mobileMin,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  devicePickBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  quickPickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickPickBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    minHeight: touchTargets.mobileMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    marginBottom: spacing.md,
  },
  progressText: {
    fontSize: 12,
    marginBottom: 4,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.md,
  },
});
