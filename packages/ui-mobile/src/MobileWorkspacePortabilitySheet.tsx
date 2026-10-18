import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import type {
  CreateExportResponse,
  ImportPreviewResponse,
  ExecuteImportResponse,
  ImportDuplicateStrategy,
} from '@daynori/contracts';
import { MobileButton } from './MobileButton.js';
import { MobileFeedback } from './MobileFeedback.js';
import { MobileModalSheet } from './MobileModalSheet.js';

export interface MobileWorkspacePortabilitySheetProps {
  visible: boolean;
  onClose: () => void;
  workspaceId: string;
  themeMode?: ThemeMode;
  testID?: string;
  onExportWorkspace: (password?: string) => Promise<CreateExportResponse>;
  onPreviewImport: (archiveBase64: string) => Promise<ImportPreviewResponse>;
  onExecuteImport: (previewId: string, strategy: ImportDuplicateStrategy) => Promise<ExecuteImportResponse>;
  onPickArchive?: () => Promise<{ name: string; base64: string } | null>;
  onDownloadExport?: (downloadUrl: string) => Promise<void>;
}

export const MobileWorkspacePortabilitySheet: React.FC<MobileWorkspacePortabilitySheetProps> = ({
  visible,
  onClose,
  workspaceId: _workspaceId,
  themeMode = 'light',
  testID = 'mobile-portability-sheet',
  onExportWorkspace,
  onPreviewImport,
  onExecuteImport,
  onPickArchive,
  onDownloadExport,
}) => {
  const palette = colors[themeMode];
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');

  // Export state
  const [password, setPassword] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<CreateExportResponse | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Import state
  const [isUploading, setIsUploading] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewResponse | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<ImportDuplicateStrategy>('create_copy');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ExecuteImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  if (!visible) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const res = await onExportWorkspace(password || undefined);
      setExportResult(res);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
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
    <MobileModalSheet
      visible={visible}
      onClose={onClose}
      title="Workspace Portability"
      themeMode={themeMode}
      testID={testID}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Tab Selector */}
        <View style={[styles.tabBar, { borderColor: palette.border.subtle }]}>
          <Pressable
            testID="mobile-tab-export"
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'export' }}
            onPress={() => setActiveTab('export')}
            style={[
              styles.tabButton,
              activeTab === 'export' && { backgroundColor: palette.action.primary },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'export' ? palette.action.label : palette.text.secondary },
              ]}
            >
              📦 Export
            </Text>
          </Pressable>
          <Pressable
            testID="mobile-tab-import"
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'import' }}
            onPress={() => setActiveTab('import')}
            style={[
              styles.tabButton,
              activeTab === 'import' && { backgroundColor: palette.action.primary },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'import' ? palette.action.label : palette.text.secondary },
              ]}
            >
              📥 Import
            </Text>
          </Pressable>
        </View>

        {/* Tab 1: Export */}
        {activeTab === 'export' && (
          <View style={styles.section}>
            <Text style={[styles.bodyText, { color: palette.text.secondary }]}>
              Export your notes, tasks, routines, journal, calendar, and clean attachments in standard
              open formats with a cryptographic manifest.
            </Text>

            <MobileFeedback
              severity="warning"
              message="Vault & External Drive Notice: Encrypted vault plaintexts and external Google Drive mirrors require separate policies and are excluded."
              themeMode={themeMode}
            />

            {exportError && (
              <MobileFeedback severity="danger" message={exportError} themeMode={themeMode} />
            )}

            {!exportResult ? (
              <View style={[styles.card, { backgroundColor: palette.surfaceRaised }]}>
                <Text style={[styles.fieldLabel, { color: palette.text.primary }]}>
                  Confirm Password or Reauthentication:
                </Text>
                <TextInput
                  testID="mobile-export-password-input"
                  secureTextEntry
                  placeholder="Enter current password if prompted"
                  placeholderTextColor={palette.text.secondary}
                  value={password}
                  onChangeText={setPassword}
                  style={[
                    styles.input,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border.subtle,
                      color: palette.text.primary,
                    },
                  ]}
                />
                <View style={{ marginTop: spacing.sm }}>
                  <MobileButton
                    testID="mobile-btn-start-export"
                    variant="primary"
                    themeMode={themeMode}
                    onPress={handleStartExport}
                    disabled={isExporting}
                    accessibilityLabel="Export Workspace"
                  >
                    {isExporting ? 'Generating Archive...' : '🔒 Verify & Export (.zip)'}
                  </MobileButton>
                </View>
              </View>
            ) : (
              <View style={[styles.card, { backgroundColor: palette.surfaceRaised }]}>
                <Text style={[styles.successTitle, { color: palette.status.success }]}>
                  ✓ Export Archive Ready
                </Text>
                <Text style={[styles.summaryText, { color: palette.text.primary }]}>
                  📁 Folders: {exportResult.manifestSummary.foldersCount}
                  {'\n'}📝 Notes: {exportResult.manifestSummary.notesCount}
                  {'\n'}✅ Tasks: {exportResult.manifestSummary.tasksCount}
                  {'\n'}🔄 Routines: {exportResult.manifestSummary.routinesCount}
                  {'\n'}📖 Journal: {exportResult.manifestSummary.journalCount}
                  {'\n'}📅 Calendar: {exportResult.manifestSummary.calendarCount}
                  {'\n'}📎 Files: {exportResult.manifestSummary.filesCount} (
                  {(exportResult.manifestSummary.totalBinaryBytes / 1024).toFixed(1)} KB)
                </Text>
                <Text style={[styles.expiryText, { color: palette.status.warning }]}>
                  ⏳ Ephemeral link expires: {new Date(exportResult.expiresAt).toLocaleTimeString()}
                </Text>
                {exportResult.downloadUrl && onDownloadExport && (
                  <View style={{ marginTop: spacing.sm }}>
                    <MobileButton
                      testID="mobile-btn-save-export"
                      variant="secondary"
                      themeMode={themeMode}
                      onPress={() => {
                        if (exportResult.downloadUrl && onDownloadExport) {
                          onDownloadExport(exportResult.downloadUrl);
                        }
                      }}
                      accessibilityLabel="Download and save export archive"
                    >
                      💾 Save Archive to Device
                    </MobileButton>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Tab 2: Import */}
        {activeTab === 'import' && (
          <View style={styles.section}>
            <Text style={[styles.bodyText, { color: palette.text.secondary }]}>
              Import a validated Daynori export archive with safety, traversal protection, and
              duplicate resolution.
            </Text>

            {importError && (
              <MobileFeedback severity="danger" message={importError} themeMode={themeMode} />
            )}

            {importResult && (
              <MobileFeedback
                severity="success"
                message={`Import complete! ${importResult.importedCounts.notes} notes, ${importResult.importedCounts.tasks} tasks, ${importResult.importedCounts.journal} journal entries. (Skipped: ${importResult.skippedCounts}, Copied: ${importResult.copiedCounts}, Overwritten: ${importResult.overwrittenCounts}).`}
                themeMode={themeMode}
              />
            )}

            {!importPreview && !importResult && (
              <View style={[styles.card, { backgroundColor: palette.surfaceRaised }]}>
                <Text style={[styles.fieldLabel, { color: palette.text.primary }]}>
                  Select Export Archive:
                </Text>
                <Text style={{ fontSize: 13, color: palette.text.secondary }}>
                  Choose a previously exported Daynori .zip archive to preview content and resolve conflicts.
                </Text>
                <View style={{ marginTop: spacing.xs }}>
                  <MobileButton
                    testID="mobile-btn-select-archive"
                    variant="primary"
                    themeMode={themeMode}
                    onPress={async () => {
                      setIsUploading(true);
                      setImportError(null);
                      try {
                        let base64Data = '';
                        if (onPickArchive) {
                          const asset = await onPickArchive();
                          if (!asset) {
                            setIsUploading(false);
                            return; // User canceled picker
                          }
                          base64Data = asset.base64;
                        }
                        const preview = await onPreviewImport(base64Data);
                        setImportPreview(preview);
                      } catch (err) {
                        setImportError(err instanceof Error ? err.message : String(err));
                      } finally {
                        setIsUploading(false);
                      }
                    }}
                    disabled={isUploading}
                    accessibilityLabel="Choose Archive to Preview"
                  >
                    {isUploading ? 'Inspecting Archive...' : '📂 Choose Archive to Preview'}
                  </MobileButton>
                </View>
              </View>
            )}

            {importPreview && (
              <View style={[styles.card, { backgroundColor: palette.surfaceRaised }]}>
                <Text style={[styles.fieldLabel, { color: palette.text.primary, fontSize: 15 }]}>
                  Archive Summary
                </Text>
                <Text style={[styles.summaryText, { color: palette.text.primary }]}>
                  📝 Notes: {importPreview.manifestSummary.notesCount}
                  {'\n'}✅ Tasks: {importPreview.manifestSummary.tasksCount}
                  {'\n'}📖 Journal: {importPreview.manifestSummary.journalCount}
                  {'\n'}📎 Attachments: {importPreview.manifestSummary.filesCount}
                </Text>

                {importPreview.detectedDuplicates.length > 0 && (
                  <View style={{ marginTop: spacing.xs }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: palette.status.warning }}>
                      ⚠️ {importPreview.detectedDuplicates.length} duplicates detected
                    </Text>
                    <Text style={{ fontSize: 12, color: palette.text.secondary, marginVertical: 4 }}>
                      Strategy:
                    </Text>
                    {(['create_copy', 'skip', 'overwrite_if_newer'] as const).map((strat) => (
                      <Pressable
                        key={strat}
                        testID={`mobile-import-strat-${strat}`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: selectedStrategy === strat }}
                        onPress={() => setSelectedStrategy(strat)}
                        style={[
                          styles.strategyRow,
                          selectedStrategy === strat && {
                            borderColor: palette.action.primary,
                            backgroundColor: palette.surface,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            color: selectedStrategy === strat ? palette.action.primary : palette.text.primary,
                            fontWeight: selectedStrategy === strat ? '700' : '500',
                          }}
                        >
                          {strat === 'create_copy'
                            ? 'Create (Copy)'
                            : strat === 'skip'
                              ? 'Skip Duplicates'
                              : 'Overwrite If Newer'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                  <MobileButton
                    testID="mobile-btn-confirm-import"
                    variant="primary"
                    themeMode={themeMode}
                    onPress={handleConfirmImport}
                    disabled={isImporting || !importPreview.storageQuota.isQuotaSufficient}
                    accessibilityLabel="Confirm Import"
                  >
                    {isImporting ? 'Importing...' : '✓ Confirm & Import'}
                  </MobileButton>
                  <MobileButton
                    testID="mobile-btn-cancel-preview"
                    variant="secondary"
                    themeMode={themeMode}
                    onPress={() => setImportPreview(null)}
                    disabled={isImporting}
                    accessibilityLabel="Cancel Preview"
                  >
                    Cancel
                  </MobileButton>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </MobileModalSheet>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  tabBar: {
    flexDirection: 'row',
    gap: spacing.xs,
    borderBottomWidth: 1,
    paddingBottom: spacing.xs,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    gap: spacing.sm,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    padding: spacing.md,
    borderRadius: radii.card,
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 14,
    minHeight: 44,
  },
  successTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  summaryText: {
    fontSize: 13,
    lineHeight: 20,
  },
  expiryText: {
    fontSize: 12,
    marginTop: 4,
  },
  strategyRow: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 4,
  },
});
