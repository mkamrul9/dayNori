'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { colors, radii, spacing, typography } from '@daynori/design-tokens';
import {
  Button,
  Card,
  Checkbox,
  Feedback,
  Icon,
  SegmentedControl,
  TextArea,
  TextField,
} from '@daynori/ui-web';
import {
  collectClientDiagnostics,
  createFeedbackDraft,
  getFeedbackStorageKey,
  sanitizeDiagnostics,
  type FeedbackClientSubmissionState,
  type FeedbackDiagnostics,
  type FeedbackDraft,
  type FeedbackFrequency,
  type FeedbackReportReceipt,
  type FeedbackReportType,
  type FeedbackSeverity,
} from '@daynori/domain';
import { useShell } from '../../components/ShellContext';
import { useAuth } from '../../components/AuthContext';
import { createWebApiClient } from '../../data/webApiClient';

const REPORT_TYPE_OPTIONS: Array<{ value: FeedbackReportType; label: string }> = [
  { value: 'bug', label: 'Bug Report' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'contact', label: 'Contact' },
];

const CATEGORIES_BY_TYPE: Record<FeedbackReportType, string[]> = {
  bug: ['ui', 'sync', 'performance', 'data', 'general', 'other'],
  suggestion: ['feature', 'improvement', 'ui', 'general', 'other'],
  contact: ['question', 'support', 'privacy', 'account', 'other'],
};

export default function SupportPage() {
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const { user, workspaceId, isAuthenticated, csrfToken, openAuthModal } = useAuth();

  const effectiveUserId =
    user?.id || (typeof window !== 'undefined' ? localStorage.getItem('daynori_user_id') : null);
  const effectiveWorkspaceId =
    workspaceId ||
    (typeof window !== 'undefined' ? localStorage.getItem('daynori_workspace_id') : null);

  const apiClient = useMemo(() => createWebApiClient({ csrfToken }), [csrfToken]);

  const [reportType, setReportType] = useState<FeedbackReportType>('bug');
  const [draft, setDraft] = useState<FeedbackDraft>(() => createFeedbackDraft('bug'));
  const [submissionState, setSubmissionState] =
    useState<FeedbackClientSubmissionState>('draft');
  const [receipt, setReceipt] = useState<FeedbackReportReceipt | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDiagnosticsPreview, setShowDiagnosticsPreview] = useState(false);

  // Compute storage key scoped strictly by user, workspace, and reportType
  const storageKey = useMemo(() => {
    if (!effectiveUserId || !effectiveWorkspaceId) return null;
    return getFeedbackStorageKey(effectiveUserId, effectiveWorkspaceId, reportType);
  }, [effectiveUserId, effectiveWorkspaceId, reportType]);

  // Load saved draft on mount or when storage key changes
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
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
      // Ignore corrupt local storage
    }
    // Fresh draft if none exists
    const fresh = createFeedbackDraft(reportType);
    setDraft(fresh);
    setSubmissionState('draft');
    setReceipt(null);
    setErrorMessage(null);
  }, [storageKey, reportType]);

  // Autosave draft to scoped storage whenever draft changes
  const persistDraft = useCallback(
    (nextDraft: FeedbackDraft) => {
      setDraft(nextDraft);
      if (storageKey && typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, JSON.stringify(nextDraft));
        } catch {
          // Ignore quota errors
        }
      }
    },
    [storageKey]
  );

  const handleTypeChange = (nextType: string) => {
    const t = nextType as FeedbackReportType;
    setReportType(t);
    setReceipt(null);
    setErrorMessage(null);
    setSubmissionState('draft');
    setDraft((prev) => ({
      ...prev,
      reportType: t,
      category: CATEGORIES_BY_TYPE[t][0] || 'general',
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleFieldChange = (
    field: keyof FeedbackDraft,
    value: unknown
  ) => {
    let resolvedValue = value;
    if (
      value !== null &&
      typeof value === 'object' &&
      'target' in value &&
      (value as { target?: unknown }).target !== null &&
      typeof (value as { target?: unknown }).target === 'object'
    ) {
      const target = (value as { target: { type?: string; value?: unknown; checked?: boolean } }).target;
      resolvedValue = target.type === 'checkbox' ? target.checked : target.value;
    }
    const next = {
      ...draft,
      [field]: resolvedValue,
      updatedAt: new Date().toISOString(),
    };
    persistDraft(next);
  };

  // Prepare technical diagnostics object when requested
  const clientDiagnostics = useMemo<FeedbackDiagnostics>(() => {
    return collectClientDiagnostics({
      appVersion: '0.1.0',
      platform: 'web',
      route: '/support',
    });
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!effectiveWorkspaceId) {
      openAuthModal('/support');
      return;
    }

    // Validation
    const trimmedSummary = String(draft.summary || '').trim();
    const trimmedDesc = String(draft.description || '').trim();

    if (trimmedSummary.length < 3) {
      setErrorMessage('Summary must be at least 3 characters long.');
      return;
    }
    if (trimmedDesc.length < 10) {
      setErrorMessage('Description must be at least 10 characters long.');
      return;
    }

    setSubmissionState('submitting');
    setErrorMessage(null);

    const client = createWebApiClient({
      csrfToken:
        csrfToken ||
        (typeof window !== 'undefined'
          ? document.cookie.match(/(?:^|;\s*)daynori_csrf_token=([^;]+)/)?.[1] || null
          : null),
    });

    const sanitizedDiag = draft.includeDiagnostics
      ? sanitizeDiagnostics(clientDiagnostics)
      : undefined;

    try {
      const response = await client.createFeedbackReport(effectiveWorkspaceId, {
        clientReportId: draft.clientReportId,
        reportType: draft.reportType,
        category: draft.category || 'general',
        summary: trimmedSummary,
        description: trimmedDesc,
        stepsToReproduce: draft.stepsToReproduce ? String(draft.stepsToReproduce).trim() : undefined,
        expectedBehavior: draft.expectedBehavior ? String(draft.expectedBehavior).trim() : undefined,
        actualBehavior: draft.actualBehavior ? String(draft.actualBehavior).trim() : undefined,
        frequency: draft.frequency || undefined,
        severity: draft.severity || undefined,
        replyEmail: draft.replyEmail ? String(draft.replyEmail).trim() : undefined,
        includeDiagnostics: draft.includeDiagnostics,
        diagnostics: sanitizedDiag,
        attachments: [],
      });

      const serverReceipt = response.data;
      setReceipt(serverReceipt);
      setSubmissionState('submitted');

      // Update draft in storage with acknowledged receipt
      const acknowledgedDraft: FeedbackDraft = {
        ...draft,
        state: 'submitted',
        receipt: serverReceipt,
        updatedAt: new Date().toISOString(),
      };
      persistDraft(acknowledgedDraft);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || 'Submission failed. Your draft has been preserved locally.');
      setSubmissionState('failed_retry');
      persistDraft({
        ...draft,
        state: 'failed_retry',
        lastError: msg,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleReset = () => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
    const fresh = createFeedbackDraft(reportType);
    setDraft(fresh);
    setSubmissionState('draft');
    setReceipt(null);
    setErrorMessage(null);
  };

  return (
    <main id="main" className="daynori-page">
      <h1
        className="daynori-break"
        style={{
          margin: 0,
          fontSize: typography.webScale.welcomeTitle,
          fontWeight: 800,
          color: palette.text.primary,
        }}
      >
        Support &amp; Feedback
      </h1>
      <p className="daynori-break" style={{ color: palette.text.secondary, fontSize: 14 }}>
        Submit durable bug reports, suggestions, or contact requests. Reports are saved
        privately to your workspace with idempotent server receipts.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.base }}>
        {/* Active Feedback Intake Section */}
        <Card themeMode={themeMode}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm }}>
              <h2 style={{ margin: 0, color: palette.text.primary, fontSize: 18 }}>
                Submit a Report
              </h2>
              <SegmentedControl
                themeMode={themeMode}
                label="Report Type"
                options={REPORT_TYPE_OPTIONS}
                value={reportType}
                onChange={handleTypeChange}
              />
            </div>

            {!isAuthenticated && !effectiveUserId ? (
              <div
                style={{
                  padding: spacing.md,
                  borderRadius: radii.sm,
                  backgroundColor: palette.surface,
                  border: `1px solid ${palette.border}`,
                }}
              >
                <p style={{ color: palette.text.primary, margin: 0, marginBottom: spacing.sm }}>
                  Sign in to submit reports linked to your workspace, or browse self-serve help below.
                </p>
                <Button
                  themeMode={themeMode}
                  variant="primary"
                  onClick={() => openAuthModal('/support')}
                >
                  Sign in
                </Button>
              </div>
            ) : submissionState === 'submitted' && receipt ? (
              /* Durable Server Receipt Card */
              <div
                data-testid="feedback-receipt-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: spacing.sm,
                  padding: spacing.md,
                  backgroundColor: palette.status.successBg,
                  border: `1px solid ${palette.status.successBorder}`,
                  borderRadius: radii.sm,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                  <Icon name="check" />
                  <strong style={{ color: palette.status.success, fontSize: 16 }}>
                    Report Submitted Successfully
                  </strong>
                </div>
                <p style={{ margin: 0, color: palette.text.primary, fontSize: 14 }}>
                  Your {receipt.reportType} report has been durably acknowledged by the server.
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: `${spacing.xs}px ${spacing.md}px`,
                    fontSize: 13,
                    marginTop: spacing.xs,
                  }}
                >
                  <span style={{ color: palette.text.secondary }}>Receipt ID:</span>
                  <code data-testid="receipt-id" style={{ color: palette.text.primary }}>{receipt.id}</code>
                  <span style={{ color: palette.text.secondary }}>Client ID:</span>
                  <code data-testid="receipt-client-id" style={{ color: palette.text.primary }}>{receipt.clientReportId}</code>
                  <span style={{ color: palette.text.secondary }}>Status:</span>
                  <span data-testid="receipt-status" style={{ color: palette.status.success, fontWeight: 600 }}>
                    {receipt.status}
                  </span>
                  <span style={{ color: palette.text.secondary }}>Delivery:</span>
                  <span style={{ color: palette.text.primary }}>{receipt.deliveryNotice}</span>
                </div>

                {receipt.responseText && (
                  <div
                    data-testid="feedback-operator-response"
                    style={{
                      marginTop: spacing.md,
                      padding: spacing.md,
                      backgroundColor: palette.surfaceRaised,
                      border: `1px solid ${palette.border.subtle}`,
                      borderRadius: radii.sm,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
                      <Icon name="help" />
                      <strong style={{ color: palette.text.primary, fontSize: 14 }}>
                        Developer Response (Verified Support Route)
                      </strong>
                    </div>
                    <p style={{ margin: `0 0 ${spacing.xs}px`, color: palette.text.primary, fontSize: 14, whiteSpace: 'pre-wrap' }}>
                      {receipt.responseText}
                    </p>
                    {receipt.respondedAt && (
                      <span style={{ fontSize: 12, color: palette.text.secondary }}>
                        Responded on {new Date(receipt.respondedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}

                <div style={{ marginTop: spacing.md, display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
                  <Button
                    themeMode={themeMode}
                    variant="secondary"
                    data-testid="btn-check-status"
                    onClick={async () => {
                      if (!workspaceId || !receipt) return;
                      try {
                        const refreshed = await apiClient.getFeedbackReport(workspaceId, receipt.id);
                        setReceipt(refreshed.data);
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    Check status / refresh
                  </Button>
                  <Button
                    themeMode={themeMode}
                    variant="secondary"
                    data-testid="btn-submit-another"
                    onClick={handleReset}
                  >
                    Submit another report
                  </Button>
                </div>
              </div>
            ) : (
              /* Report Intake Form */
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                {errorMessage && (
                  <Feedback
                    severity="danger"
                    message={errorMessage}
                    themeMode={themeMode}
                    onDismiss={() => setErrorMessage(null)}
                  />
                )}

                {submissionState === 'failed_retry' && (
                  <div
                    style={{
                      padding: spacing.sm,
                      borderRadius: radii.sm,
                      backgroundColor: palette.status.dangerBg,
                      border: `1px solid ${palette.status.dangerBorder}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: spacing.sm,
                    }}
                  >
                    <span style={{ fontSize: 13, color: palette.status.danger }}>
                      Submission failed. Your draft is preserved with stable ID.
                    </span>
                    <Button
                      themeMode={themeMode}
                      variant="primary"
                      onClick={() => handleSubmit()}
                    >
                      Retry submission
                    </Button>
                  </div>
                )}

                {/* Summary */}
                <TextField
                  themeMode={themeMode}
                  id="feedback-summary"
                  data-testid="input-summary"
                  label="Summary"
                  value={draft.summary}
                  onChange={(val) => handleFieldChange('summary', val)}
                  placeholder={
                    reportType === 'bug'
                      ? 'Brief description of what went wrong'
                      : reportType === 'suggestion'
                      ? 'What feature or improvement would help you?'
                      : 'Subject of your inquiry'
                  }
                  required
                />

                {/* Category */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  <label
                    htmlFor="feedback-category"
                    style={{ fontSize: 14, fontWeight: 600, color: palette.text.primary }}
                  >
                    Category
                  </label>
                  <select
                    id="feedback-category"
                    value={draft.category}
                    onChange={(e) => handleFieldChange('category', e.target.value)}
                    style={{
                      padding: `${spacing.sm}px ${spacing.md}px`,
                      borderRadius: radii.sm,
                      border: `1px solid ${palette.border}`,
                      backgroundColor: palette.surface,
                      color: palette.text.primary,
                      fontSize: 14,
                    }}
                  >
                    {CATEGORIES_BY_TYPE[reportType].map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <TextArea
                  themeMode={themeMode}
                  id="feedback-description"
                  data-testid="input-description"
                  label="Description"
                  value={draft.description}
                  onChange={(val) => handleFieldChange('description', val)}
                  placeholder="Provide detailed explanation so we can understand and reproduce..."
                  rows={4}
                  required
                />

                {/* Bug Specific Fields */}
                {reportType === 'bug' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, borderLeft: `3px solid ${palette.border}`, paddingLeft: spacing.md }}>
                    <TextArea
                      themeMode={themeMode}
                      id="feedback-steps"
                      data-testid="input-steps"
                      label="Steps to Reproduce (optional)"
                      value={draft.stepsToReproduce || ''}
                      onChange={(val) => handleFieldChange('stepsToReproduce', val)}
                      placeholder="1. Open...\n2. Click...\n3. Observe..."
                      rows={3}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
                      <TextField
                        themeMode={themeMode}
                        id="feedback-expected"
                        data-testid="input-expected"
                        label="Expected Behavior"
                        value={draft.expectedBehavior || ''}
                        onChange={(val) => handleFieldChange('expectedBehavior', val)}
                        placeholder="What should have happened?"
                      />
                      <TextField
                        themeMode={themeMode}
                        id="feedback-actual"
                        data-testid="input-actual"
                        label="Actual Behavior"
                        value={draft.actualBehavior || ''}
                        onChange={(val) => handleFieldChange('actualBehavior', val)}
                        placeholder="What happened instead?"
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                        <label htmlFor="feedback-frequency" style={{ fontSize: 14, fontWeight: 600, color: palette.text.primary }}>
                          Frequency
                        </label>
                        <select
                          id="feedback-frequency"
                          value={draft.frequency || 'sometimes'}
                          onChange={(e) => handleFieldChange('frequency', e.target.value as FeedbackFrequency)}
                          style={{
                            padding: `${spacing.sm}px ${spacing.md}px`,
                            borderRadius: radii.sm,
                            border: `1px solid ${palette.border}`,
                            backgroundColor: palette.surface,
                            color: palette.text.primary,
                            fontSize: 14,
                          }}
                        >
                          <option value="always">Always</option>
                          <option value="often">Often</option>
                          <option value="sometimes">Sometimes</option>
                          <option value="once">Once</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                        <label htmlFor="feedback-severity" style={{ fontSize: 14, fontWeight: 600, color: palette.text.primary }}>
                          Severity
                        </label>
                        <select
                          id="feedback-severity"
                          value={draft.severity || 'medium'}
                          onChange={(e) => handleFieldChange('severity', e.target.value as FeedbackSeverity)}
                          style={{
                            padding: `${spacing.sm}px ${spacing.md}px`,
                            borderRadius: radii.sm,
                            border: `1px solid ${palette.border}`,
                            backgroundColor: palette.surface,
                            color: palette.text.primary,
                            fontSize: 14,
                          }}
                        >
                          <option value="low">Low (minor inconvenience)</option>
                          <option value="medium">Medium (standard bug)</option>
                          <option value="high">High (feature broken)</option>
                          <option value="critical">Critical (data loss / blocker)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Contact Specific Fields */}
                {reportType === 'contact' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                    <TextField
                      themeMode={themeMode}
                      id="feedback-reply-email"
                      data-testid="input-reply-email"
                      label="Reply Email (optional)"
                      value={draft.replyEmail || ''}
                      onChange={(val) => handleFieldChange('replyEmail', val)}
                      placeholder="you@example.com"
                    />
                    <span style={{ fontSize: 12, color: palette.text.secondary }}>
                      Optional. Only provide if you request a response. The login email is not assumed to be a monitored mailbox.
                    </span>
                  </div>
                )}

                {/* Diagnostics Section */}
                <div
                  style={{
                    padding: spacing.md,
                    borderRadius: radii.sm,
                    backgroundColor: palette.surface,
                    border: `1px solid ${palette.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: spacing.sm,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Checkbox
                      themeMode={themeMode}
                      id="feedback-diagnostics-optin"
                      data-testid="checkbox-include-diagnostics"
                      label="Include technical diagnostics (version, browser, route template)"
                      checked={draft.includeDiagnostics}
                      onChange={(checked) => handleFieldChange('includeDiagnostics', checked)}
                    />
                    {draft.includeDiagnostics && (
                      <button
                        type="button"
                        onClick={() => setShowDiagnosticsPreview((prev) => !prev)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: palette.action.primary,
                          cursor: 'pointer',
                          fontSize: 13,
                          textDecoration: 'underline',
                        }}
                      >
                        {showDiagnosticsPreview ? 'Hide details' : 'Review diagnostics'}
                      </button>
                    )}
                  </div>

                  {draft.includeDiagnostics && showDiagnosticsPreview && (
                    <div
                      style={{
                        padding: spacing.sm,
                        backgroundColor: palette.background,
                        borderRadius: radii.sm,
                        fontSize: 12,
                        fontFamily: 'monospace',
                        color: palette.text.secondary,
                        overflowX: 'auto',
                      }}
                    >
                      <pre style={{ margin: 0 }}>
                        {JSON.stringify(sanitizeDiagnostics(clientDiagnostics), null, 2)}
                      </pre>
                      <span style={{ display: 'block', marginTop: spacing.xs, color: palette.status.info }}>
                        Tokens, credentials, journal text, passwords, and private data are excluded.
                      </span>
                    </div>
                  )}
                </div>

                {/* Attachments Section - Phase 75 Capability Notice */}
                <div
                  style={{
                    padding: spacing.sm,
                    borderRadius: radii.sm,
                    backgroundColor: palette.background,
                    border: `1px dashed ${palette.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                  }}
                >
                  <Icon name="attachment" />
                  <span style={{ fontSize: 13, color: palette.text.secondary }}>
                    File attachments: Hosted file uploads are unavailable in this testing preview (Phase 75 capability gate). Reports can be submitted with text and diagnostics.
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: spacing.md, alignItems: 'center', marginTop: spacing.sm }}>
                  <Button
                    themeMode={themeMode}
                    variant="primary"
                    data-testid="btn-submit-report"
                    disabled={submissionState === 'submitting'}
                    onClick={() => handleSubmit()}
                  >
                    {submissionState === 'submitting'
                      ? 'Submitting...'
                      : `Submit ${reportType.charAt(0).toUpperCase() + reportType.slice(1)}`}
                  </Button>
                  <Button
                    themeMode={themeMode}
                    variant="secondary"
                    type="button"
                    onClick={handleReset}
                  >
                    Clear draft
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Card>

        {/* Self-serve resources */}
        <Card themeMode={themeMode}>
          <h2 style={{ marginTop: 0, color: palette.text.primary, fontSize: 18 }}>Help yourself</h2>
          <ul className="daynori-break" style={{ color: palette.text.secondary, lineHeight: 1.5 }}>
            <li>
              <Link href="/help">Help &amp; tutorial</Link> — how-tos and replay the beginner guide
            </li>
            <li>
              <Link href="/privacy">Privacy</Link>
            </li>
            <li>
              <Link href="/terms">Terms</Link>
            </li>
            <li>
              <Link href="/account-deletion">Account deletion</Link>
            </li>
          </ul>
        </Card>

        {/* Troubleshooting */}
        <Card themeMode={themeMode}>
          <h2 style={{ marginTop: 0, color: palette.text.primary, fontSize: 18 }}>
            Troubleshooting
          </h2>
          <ul className="daynori-break" style={{ color: palette.text.secondary, lineHeight: 1.5 }}>
            <li>
              <strong>Slow first load:</strong> the free server may sleep; wait about a minute and
              retry.
            </li>
            <li>
              <strong>Signed out unexpectedly:</strong> try refreshing once after the server wakes.
              Choose Log out only when you mean to.
            </li>
            <li>
              <strong>Offline:</strong> keep the app open to edit local drafts; cold reopen without
              network shows an offline page until you reconnect.
            </li>
            <li>
              <strong>Dummy login emails</strong> (for example testing identifiers) are not real
              inboxes — password recovery by email may not work for them.
            </li>
          </ul>
        </Card>

        {/* Contact Status */}
        <Card themeMode={themeMode}>
          <h2 style={{ marginTop: 0, color: palette.text.primary, fontSize: 18 }}>Contact Status</h2>
          <p className="daynori-break" style={{ color: palette.text.secondary, margin: 0 }}>
            Reports submitted above are durably recorded with server receipts. A monitored external
            developer inbox is not configured for this free testing preview. This service does not
            promise immediate human response times or live chat.
          </p>
        </Card>
      </div>
    </main>
  );
}
