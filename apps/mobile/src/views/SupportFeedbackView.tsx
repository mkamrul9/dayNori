import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  BackHandler,
  Pressable,
} from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import {
  Icon,
  MobileButton,
  MobileCard,
  MobileTextArea,
  MobileTextField,
  MobileSwitch,
} from '@daynori/ui-mobile';
import {
  collectClientDiagnostics,
  createFeedbackDraft,
  getFeedbackStorageKey,
  sanitizeDiagnostics,
  type FeedbackClientSubmissionState,
  type FeedbackDiagnostics,
  type FeedbackDraft,
  type FeedbackReportReceipt,
  type FeedbackReportType,
} from '@daynori/domain';
import type { DaynoriApiClient } from '@daynori/api-client';
import { defaultSecureStorage } from '../auth/secureStorage.js';

export interface SupportFeedbackViewProps {
  themeMode: ThemeMode;
  userId?: string | null;
  workspaceId?: string | null;
  apiClient?: DaynoriApiClient | null;
  onClose: () => void;
}

const REPORT_TYPES: Array<{ value: FeedbackReportType; label: string }> = [
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'contact', label: 'Contact' },
];

const CATEGORIES_BY_TYPE: Record<FeedbackReportType, string[]> = {
  bug: ['ui', 'sync', 'performance', 'data', 'general'],
  suggestion: ['feature', 'improvement', 'ui', 'general'],
  contact: ['question', 'support', 'privacy', 'account'],
};

export function SupportFeedbackView({
  themeMode,
  userId,
  workspaceId,
  apiClient,
  onClose,
}: SupportFeedbackViewProps) {
  const palette = colors[themeMode];

  const [reportType, setReportType] = useState<FeedbackReportType>('bug');
  const [draft, setDraft] = useState<FeedbackDraft>(() => createFeedbackDraft('bug'));
  const [submissionState, setSubmissionState] =
    useState<FeedbackClientSubmissionState>('draft');
  const [receipt, setReceipt] = useState<FeedbackReportReceipt | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDiagnosticsPreview, setShowDiagnosticsPreview] = useState(false);

  // Hardware back button dismisses sheet
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => backHandler.remove();
  }, [onClose]);

  const storageKey = useMemo(() => {
    const uid = userId || 'anonymous';
    const wid = workspaceId || 'local';
    return getFeedbackStorageKey(uid, wid, reportType);
  }, [userId, workspaceId, reportType]);

  // Load draft from storage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await defaultSecureStorage.getItemAsync(storageKey);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw) as FeedbackDraft;
          if (parsed && parsed.reportType === reportType) {
            setDraft(parsed);
            setSubmissionState(parsed.state || 'draft');
            if (parsed.receipt) {
              setReceipt(parsed.receipt);
            }
            return;
          }
        }
      } catch {
        // Fallback to fresh draft
      }
      if (!cancelled) {
        setDraft(createFeedbackDraft(reportType));
        setSubmissionState('draft');
        setReceipt(null);
        setErrorMessage(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey, reportType]);

  const persistDraft = useCallback(
    (nextDraft: FeedbackDraft) => {
      setDraft(nextDraft);
      defaultSecureStorage
        .setItemAsync(storageKey, JSON.stringify(nextDraft))
        .catch(() => {});
    },
    [storageKey]
  );

  const handleFieldChange = (field: keyof FeedbackDraft, value: unknown) => {
    const next = {
      ...draft,
      [field]: value,
      updatedAt: new Date().toISOString(),
    };
    persistDraft(next);
  };

  const handleTypeChange = (typeVal: FeedbackReportType) => {
    setReportType(typeVal);
    setReceipt(null);
    setErrorMessage(null);
    setSubmissionState('draft');
    setDraft((prev) => ({
      ...prev,
      reportType: typeVal,
      category: CATEGORIES_BY_TYPE[typeVal][0] || 'general',
      updatedAt: new Date().toISOString(),
    }));
  };

  const clientDiagnostics = useMemo<FeedbackDiagnostics>(() => {
    return collectClientDiagnostics({
      appVersion: '0.1.0',
      platform: 'android',
      route: '/support',
    });
  }, []);

  const handleSubmit = async () => {
    const trimmedSummary = draft.summary.trim();
    const trimmedDesc = draft.description.trim();

    if (trimmedSummary.length < 3) {
      setErrorMessage('Summary must be at least 3 characters long.');
      return;
    }
    if (trimmedDesc.length < 10) {
      setErrorMessage('Description must be at least 10 characters long.');
      return;
    }

    if (!apiClient || !workspaceId) {
      // Local queuing fallback when offline or unauthenticated
      setSubmissionState('failed_retry');
      setErrorMessage('Network client unavailable. Draft has been saved locally on this device.');
      return;
    }

    setSubmissionState('submitting');
    setErrorMessage(null);

    const sanitizedDiag = draft.includeDiagnostics
      ? sanitizeDiagnostics(clientDiagnostics)
      : undefined;

    try {
      const response = await apiClient.createFeedbackReport(workspaceId, {
        clientReportId: draft.clientReportId,
        reportType: draft.reportType,
        category: draft.category || 'general',
        summary: trimmedSummary,
        description: trimmedDesc,
        stepsToReproduce: draft.stepsToReproduce?.trim() || undefined,
        expectedBehavior: draft.expectedBehavior?.trim() || undefined,
        actualBehavior: draft.actualBehavior?.trim() || undefined,
        frequency: draft.frequency || undefined,
        severity: draft.severity || undefined,
        replyEmail: draft.replyEmail?.trim() || undefined,
        includeDiagnostics: draft.includeDiagnostics,
        diagnostics: sanitizedDiag,
        attachments: [],
      });

      const serverReceipt = response.data;
      setReceipt(serverReceipt);
      setSubmissionState('submitted');

      persistDraft({
        ...draft,
        state: 'submitted',
        receipt: serverReceipt,
        updatedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || 'Submission failed. Draft is preserved on this device.');
      setSubmissionState('failed_retry');
      persistDraft({
        ...draft,
        state: 'failed_retry',
        lastError: msg,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleReset = async () => {
    await defaultSecureStorage.deleteItemAsync(storageKey).catch(() => {});
    const fresh = createFeedbackDraft(reportType);
    setDraft(fresh);
    setSubmissionState('draft');
    setReceipt(null);
    setErrorMessage(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]} testID="support-feedback-sheet">
      {/* Header Bar */}
      <View style={[styles.header, { borderBottomColor: palette.border.subtle }]}>
        <Pressable
          testID="btn-close-feedback"
          accessibilityLabel="Close Support and Feedback"
          onPress={onClose}
          style={styles.backButton}
        >
          <Icon name="arrow-left" />
          <Text style={[styles.backText, { color: palette.text.primary }]}>Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: palette.text.primary }]}>Support &amp; Feedback</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Type selector */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: palette.text.primary }]}>Report Type</Text>
          <View style={styles.typeSelectorRow}>
            {REPORT_TYPES.map((t) => (
              <Pressable
                key={t.value}
                testID={`btn-type-${t.value}`}
                onPress={() => handleTypeChange(t.value)}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor: reportType === t.value ? palette.action.primary : palette.surface,
                    borderColor: palette.border.subtle,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    { color: reportType === t.value ? palette.action.label : palette.text.primary },
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Receipt view when submitted */}
        {submissionState === 'submitted' && receipt ? (
          <MobileCard themeMode={themeMode}>
            <View testID="native-feedback-receipt-card" style={styles.receiptContainer}>
              <View style={styles.receiptHeader}>
                <Icon name="check" />
                <Text style={[styles.receiptSuccessText, { color: palette.status.success }]}>
                  Report Submitted Durably
                </Text>
              </View>
              <Text style={[styles.receiptBodyText, { color: palette.text.primary }]}>
                Your {receipt.reportType} report has been acknowledged by the server.
              </Text>

              <View style={styles.receiptMetaGrid}>
                <Text style={[styles.receiptMetaLabel, { color: palette.text.secondary }]}>Receipt ID:</Text>
                <Text style={[styles.receiptMetaValue, { color: palette.text.primary }]}>{receipt.id}</Text>
                <Text style={[styles.receiptMetaLabel, { color: palette.text.secondary }]}>Client ID:</Text>
                <Text style={[styles.receiptMetaValue, { color: palette.text.primary }]}>{receipt.clientReportId}</Text>
                <Text style={[styles.receiptMetaLabel, { color: palette.text.secondary }]}>Status:</Text>
                <Text style={[styles.receiptMetaValue, { color: palette.status.success, fontWeight: '700' }]}>
                  {receipt.status}
                </Text>
                <Text style={[styles.receiptMetaLabel, { color: palette.text.secondary }]}>Delivery:</Text>
                <Text style={[styles.receiptMetaValue, { color: palette.text.primary }]}>{receipt.deliveryNotice}</Text>
              </View>

              <View style={{ marginTop: spacing.md }}>
                <MobileButton
                  testID="btn-feedback-submit-another"
                  themeMode={themeMode}
                  variant="secondary"
                  onPress={handleReset}
                >
                  Submit another report
                </MobileButton>
              </View>
            </View>
          </MobileCard>
        ) : (
          /* Intake Form */
          <View style={{ gap: spacing.md }}>
            {errorMessage ? (
              <View
                style={[
                  styles.errorBanner,
                  { backgroundColor: palette.status.dangerBg, borderColor: palette.status.dangerBorder },
                ]}
              >
                <Text style={[styles.errorText, { color: palette.status.danger }]}>{errorMessage}</Text>
                {submissionState === 'failed_retry' && (
                  <View style={{ marginTop: spacing.xs }}>
                    <MobileButton
                      testID="btn-retry-feedback"
                      themeMode={themeMode}
                      variant="primary"
                      onPress={handleSubmit}
                    >
                      Retry submission
                    </MobileButton>
                  </View>
                )}
              </View>
            ) : null}

            {/* Summary */}
            <MobileTextField
              testID="native-feedback-summary"
              themeMode={themeMode}
              label="Summary"
              value={draft.summary}
              onChangeText={(val: string) => handleFieldChange('summary', val)}
              placeholder="Brief summary of issue or idea..."
              accessibilityLabel="Summary"
            />

            {/* Category selection */}
            <View style={styles.section}>
              <Text style={[styles.label, { color: palette.text.primary }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                {CATEGORIES_BY_TYPE[reportType].map((cat) => (
                  <Pressable
                    key={cat}
                    testID={`native-feedback-category-${cat}`}
                    onPress={() => handleFieldChange('category', cat)}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: (draft.category || 'general') === cat ? palette.action.primary : palette.surface,
                        borderColor: palette.border.subtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        {
                          color:
                            (draft.category || 'general') === cat ? palette.action.label : palette.text.primary,
                        },
                      ]}
                    >
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Description */}
            <MobileTextArea
              testID="native-feedback-description"
              themeMode={themeMode}
              label="Description"
              value={draft.description}
              onChangeText={(val: string) => handleFieldChange('description', val)}
              placeholder="Provide detailed description..."
              numberOfLines={4}
              accessibilityLabel="Description"
            />

            {/* Bug specifics */}
            {reportType === 'bug' && (
              <View style={styles.bugBox}>
                <MobileTextArea
                  testID="native-feedback-steps"
                  themeMode={themeMode}
                  label="Steps to Reproduce (optional)"
                  value={draft.stepsToReproduce || ''}
                  onChangeText={(val: string) => handleFieldChange('stepsToReproduce', val)}
                  placeholder="1. Open...\n2. Tap...\n3. Observe..."
                  numberOfLines={3}
                />
                <MobileTextField
                  testID="native-feedback-expected"
                  themeMode={themeMode}
                  label="Expected Behavior"
                  value={draft.expectedBehavior || ''}
                  onChangeText={(val: string) => handleFieldChange('expectedBehavior', val)}
                  placeholder="What should have happened?"
                />
                <MobileTextField
                  testID="native-feedback-actual"
                  themeMode={themeMode}
                  label="Actual Behavior"
                  value={draft.actualBehavior || ''}
                  onChangeText={(val: string) => handleFieldChange('actualBehavior', val)}
                  placeholder="What happened instead?"
                />
              </View>
            )}

            {/* Contact specifics */}
            {reportType === 'contact' && (
              <View style={styles.section}>
                <MobileTextField
                  testID="native-feedback-reply-email"
                  themeMode={themeMode}
                  label="Reply Email (optional)"
                  value={draft.replyEmail || ''}
                  onChangeText={(val: string) => handleFieldChange('replyEmail', val)}
                  placeholder="you@example.com"
                  accessibilityLabel="Reply Email"
                />
                <Text style={[styles.subtext, { color: palette.text.secondary }]}>
                  Optional. Only provide if you request a response. The login email is not assumed to be a monitored mailbox.
                </Text>
              </View>
            )}

            {/* Diagnostics Switch */}
            <MobileCard themeMode={themeMode}>
              <View style={styles.diagRow}>
                <MobileSwitch
                  label="Include technical diagnostics"
                  description="Platform, version, and route template."
                  checked={draft.includeDiagnostics}
                  onCheckedChange={(checked: boolean) => handleFieldChange('includeDiagnostics', checked)}
                  themeMode={themeMode}
                />
              </View>
              {draft.includeDiagnostics && (
                <View style={{ marginTop: spacing.sm }}>
                  <Pressable
                    testID="btn-toggle-native-diag-preview"
                    onPress={() => setShowDiagnosticsPreview((p) => !p)}
                  >
                    <Text style={[styles.linkText, { color: palette.action.primary }]}>
                      {showDiagnosticsPreview ? 'Hide diagnostics details' : 'Review diagnostics payload'}
                    </Text>
                  </Pressable>
                  {showDiagnosticsPreview && (
                    <View style={[styles.diagPre, { backgroundColor: palette.background }]}>
                      <Text style={[styles.diagPreText, { color: palette.text.secondary }]}>
                        {JSON.stringify(sanitizeDiagnostics(clientDiagnostics), null, 2)}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </MobileCard>

            {/* Attachments notice */}
            <View style={[styles.attachBox, { borderColor: palette.border.subtle }]}>
              <Icon name="attachment" />
              <Text style={[styles.attachText, { color: palette.text.secondary }]}>
                File attachments: Hosted file uploads are unavailable in this testing preview (Phase 75 capability gate).
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.actionsRow}>
              <MobileButton
                testID="btn-submit-feedback"
                themeMode={themeMode}
                variant="primary"
                disabled={submissionState === 'submitting'}
                onPress={handleSubmit}
                accessibilityLabel="Submit Report"
              >
                {submissionState === 'submitting'
                  ? 'Submitting...'
                  : `Submit ${reportType.charAt(0).toUpperCase() + reportType.slice(1)}`}
              </MobileButton>
              <MobileButton
                testID="btn-clear-feedback-draft"
                themeMode={themeMode}
                variant="secondary"
                onPress={handleReset}
                accessibilityLabel="Clear Draft"
              >
                Clear Draft
              </MobileButton>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  subtext: {
    fontSize: 12,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  typeButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  categoryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  bugBox: {
    gap: spacing.md,
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: '#ccc',
  },
  diagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkText: {
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  diagPre: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginTop: spacing.xs,
  },
  diagPreText: {
    fontFamily: 'monospace',
    fontSize: 11,
  },
  attachBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  attachText: {
    fontSize: 12,
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  receiptContainer: {
    gap: spacing.sm,
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  receiptSuccessText: {
    fontSize: 16,
    fontWeight: '700',
  },
  receiptBodyText: {
    fontSize: 14,
  },
  receiptMetaGrid: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  receiptMetaLabel: {
    fontSize: 12,
  },
  receiptMetaValue: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
  errorBanner: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.xs,
  },
  errorText: {
    fontSize: 13,
  },
});
