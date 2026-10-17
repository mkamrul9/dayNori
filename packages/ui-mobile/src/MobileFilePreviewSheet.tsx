import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import {
  formatByteSize,
  getFilePreviewKind,
  isSafeToPreview,
  type FilePreviewKind,
} from '@daynori/domain';
import { MobileButton } from './MobileButton';
import { MobileFeedback } from './MobileFeedback';
import { MobileModalSheet } from './MobileModalSheet';

export interface MobileFileItem {
  id: string;
  fileName: string;
  detectedMimeType?: string;
  byteSize: number;
  version: number;
  quarantineStatus: 'quarantined' | 'verified' | 'rejected' | 'deleted';
  sha256Checksum: string;
  folderName?: string | null;
  verifiedAt?: string | null;
  isOfflineAvailable?: boolean;
}

export interface MobileFilePreviewSheetProps {
  visible: boolean;
  onClose: () => void;
  themeMode?: ThemeMode;
  file: MobileFileItem | null;
  onRequestDownloadUrl?: (file: MobileFileItem) => Promise<string>;
  onToggleOffline?: (file: MobileFileItem, enable: boolean) => Promise<void>;
  onDelete?: (file: MobileFileItem) => Promise<void>;
  testID?: string;
}

export const MobileFilePreviewSheet: React.FC<MobileFilePreviewSheetProps> = ({
  visible,
  onClose,
  themeMode = 'light',
  file,
  onRequestDownloadUrl,
  onToggleOffline,
  onDelete,
  testID = 'mobile-file-preview-sheet',
}) => {
  const palette = colors[themeMode];
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isOfflineActive, setIsOfflineActive] = useState<boolean>(false);
  const [isUpdatingOffline, setIsUpdatingOffline] = useState<boolean>(false);

  useEffect(() => {
    if (visible && file) {
      setIsOfflineActive(Boolean(file.isOfflineAvailable));
      if (file.quarantineStatus === 'verified' && onRequestDownloadUrl) {
        onRequestDownloadUrl(file)
          .then((url) => setDownloadUrl(url))
          .catch(() => setDownloadUrl(null));
      } else {
        setDownloadUrl(null);
      }
    } else {
      setDownloadUrl(null);
    }
  }, [visible, file, onRequestDownloadUrl]);

  if (!file) return null;

  const previewKind: FilePreviewKind = file.detectedMimeType
    ? getFilePreviewKind(file.detectedMimeType)
    : 'unsupported';

  const canPreview = isSafeToPreview(file.quarantineStatus, file.detectedMimeType);

  const handleToggleOfflineClick = async () => {
    if (!onToggleOffline || isUpdatingOffline) return;
    setIsUpdatingOffline(true);
    try {
      const next = !isOfflineActive;
      await onToggleOffline(file, next);
      setIsOfflineActive(next);
    } finally {
      setIsUpdatingOffline(false);
    }
  };

  return (
    <MobileModalSheet
      visible={visible}
      onClose={onClose}
      title={file.fileName}
      themeMode={themeMode}
      testID={testID}
    >
      <View style={styles.content}>
        {/* Status badges */}
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  file.quarantineStatus === 'verified'
                    ? palette.action.subtle
                    : file.quarantineStatus === 'rejected'
                      ? '#fee2e2'
                      : '#fef3c7',
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                {
                  color:
                    file.quarantineStatus === 'verified'
                      ? palette.action.primary
                      : file.quarantineStatus === 'rejected'
                        ? palette.status.danger
                        : palette.status.warning,
                },
              ]}
            >
              {file.quarantineStatus === 'verified'
                ? '✓ Verified Clean'
                : file.quarantineStatus === 'rejected'
                  ? '✕ Security Rejected'
                  : '⏳ Quarantined'}
            </Text>
          </View>

          {isOfflineActive && (
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: palette.surfaceRaised,
                  borderColor: palette.border.subtle,
                  borderWidth: 1,
                },
              ]}
            >
              <Text style={[styles.badgeText, { color: palette.text.secondary }]}>
                📥 Offline Copy
              </Text>
            </View>
          )}

          <Text style={[styles.checksumText, { color: palette.text.muted }]}>
            SHA: {file.sha256Checksum.slice(0, 8)}...
          </Text>
        </View>

        {/* Quarantine / Rejection Notice */}
        {file.quarantineStatus !== 'verified' && (
          <MobileFeedback
            severity={file.quarantineStatus === 'rejected' ? 'danger' : 'warning'}
            message={
              file.quarantineStatus === 'rejected'
                ? 'Security inspection rejected this binary. Preview and download are blocked.'
                : 'This file is in quarantine. Preview is disabled until verification succeeds.'
            }
            themeMode={themeMode}
          />
        )}

        {/* Preview Container */}
        {canPreview && (
          <View
            style={[
              styles.previewContainer,
              { backgroundColor: palette.surfaceRaised, borderColor: palette.border.subtle },
            ]}
          >
            {/* 1. Image Preview */}
            {previewKind === 'image' && downloadUrl && (
              <Image
                source={{ uri: downloadUrl }}
                style={styles.imagePreview}
                resizeMode="contain"
                accessibilityLabel={file.fileName}
              />
            )}

            {/* 2. PDF Preview */}
            {previewKind === 'pdf' && (
              <View style={styles.pdfCard}>
                <Text style={{ fontSize: 40, marginBottom: spacing.xs }}>📕</Text>
                <Text style={[styles.pdfTitle, { color: palette.text.primary }]}>
                  {file.fileName}
                </Text>
                <Text style={[styles.pdfMeta, { color: palette.text.secondary }]}>
                  PDF Document • {formatByteSize(file.byteSize)}
                </Text>
              </View>
            )}

            {/* 3. Office Document Metadata Card */}
            {previewKind === 'office' && (
              <View style={styles.officeCard}>
                <Text style={{ fontSize: 40, marginBottom: spacing.xs }}>📘</Text>
                <Text style={[styles.officeTitle, { color: palette.text.primary }]}>
                  {file.fileName}
                </Text>
                <Text style={[styles.officeMeta, { color: palette.text.secondary }]}>
                  {file.detectedMimeType} • {formatByteSize(file.byteSize)}
                </Text>
                <View
                  style={[
                    styles.officeNoticeBox,
                    { backgroundColor: palette.surface, borderColor: palette.border.subtle },
                  ]}
                >
                  <Text style={[styles.officeNoticeText, { color: palette.text.secondary }]}>
                    In-browser office document editing is not supported in this release. You can
                    download the verified original file below.
                  </Text>
                </View>
              </View>
            )}

            {/* 4. Text or Unsupported Fallback */}
            {(previewKind === 'text' ||
              previewKind === 'unsupported' ||
              previewKind === 'audio') && (
              <View style={styles.fallbackCard}>
                <Text style={{ fontSize: 36, marginBottom: spacing.xs }}>📄</Text>
                <Text style={[styles.officeTitle, { color: palette.text.primary }]}>
                  {file.fileName}
                </Text>
                <Text style={[styles.officeMeta, { color: palette.text.secondary }]}>
                  {formatByteSize(file.byteSize)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Metadata Details */}
        <View style={styles.metaDetails}>
          <Text style={[styles.metaRow, { color: palette.text.secondary }]}>
            <Text style={{ fontWeight: '600' }}>Folder: </Text>
            {file.folderName || 'Workspace Inbox'}
          </Text>
          <Text style={[styles.metaRow, { color: palette.text.secondary }]}>
            <Text style={{ fontWeight: '600' }}>Size: </Text>
            {formatByteSize(file.byteSize)} ({file.byteSize.toLocaleString()} bytes)
          </Text>
          <Text style={[styles.metaRow, { color: palette.text.secondary }]}>
            <Text style={{ fontWeight: '600' }}>Version: </Text>v{file.version}
          </Text>
        </View>

        {/* Action Controls */}
        <View style={styles.actionRow}>
          {onToggleOffline && file.quarantineStatus === 'verified' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isOfflineActive ? 'Remove offline copy' : 'Save for offline'}
              disabled={isUpdatingOffline}
              onPress={handleToggleOfflineClick}
              style={[
                styles.offlineBtn,
                {
                  backgroundColor: isOfflineActive ? palette.surfaceRaised : palette.action.subtle,
                  borderColor: isOfflineActive ? palette.border.subtle : palette.action.primary,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: isOfflineActive ? palette.text.primary : palette.action.primary,
                }}
              >
                {isOfflineActive ? '✓ Available Offline' : '📥 Save Offline'}
              </Text>
            </Pressable>
          )}

          {onDelete && (
            <MobileButton variant="secondary" themeMode={themeMode} onPress={() => onDelete(file)}>
              Delete
            </MobileButton>
          )}

          <MobileButton variant="primary" themeMode={themeMode} onPress={onClose}>
            Close
          </MobileButton>
        </View>
      </View>
    </MobileModalSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingVertical: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  checksumText: {
    fontSize: 11,
    marginLeft: 'auto',
  },
  previewContainer: {
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
    marginVertical: spacing.sm,
    padding: spacing.md,
  },
  imagePreview: {
    width: '100%',
    height: 240,
    borderRadius: radii.sm,
  },
  pdfCard: {
    alignItems: 'center',
    padding: spacing.md,
  },
  pdfTitle: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  pdfMeta: {
    fontSize: 12,
  },
  officeCard: {
    alignItems: 'center',
    padding: spacing.sm,
    width: '100%',
  },
  officeTitle: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  officeMeta: {
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  officeNoticeBox: {
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: spacing.sm,
    width: '100%',
  },
  officeNoticeText: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  fallbackCard: {
    alignItems: 'center',
    padding: spacing.md,
  },
  metaDetails: {
    marginVertical: spacing.sm,
    gap: 4,
  },
  metaRow: {
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  offlineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    minHeight: touchTargets.mobileMin,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 'auto',
  },
});
