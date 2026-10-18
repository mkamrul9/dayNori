'use client';

import React, { useState } from 'react';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Button, Card, Feedback } from '@daynori/ui-web';

export default function PublicAccountDeletionPage() {
  const palette = colors.light;

  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMessage('Please provide the email address associated with your Daynori account.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setResultMessage(null);

    try {
      const res = await fetch('/api/v1/public/account-deletion-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, reason: reason || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to submit deletion request.');
      }

      setResultMessage(
        data.message ||
          'If an account is associated with this email address, a confirmation email with deletion instructions has been dispatched.'
      );
      setEmail('');
      setReason('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: palette.background,
        padding: `${spacing.xl}px ${spacing.md}px`,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        fontFamily: typography.fontFamily.sans,
      }}
    >
      <div
        style={{
          maxWidth: 680,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.lg,
        }}
      >
        {/* Header */}
        <div>
          <h1
            style={{
              fontSize: '28px',
              fontWeight: 700,
              color: palette.text.primary,
              margin: '0 0 8px 0',
            }}
          >
            Daynori Account & Data Deletion
          </h1>
          <p
            style={{ fontSize: '15px', color: palette.text.secondary, margin: 0, lineHeight: 1.5 }}
          >
            You have full control over your personal data. This resource explains how to delete your
            Daynori account and request permanent erasure of your data in compliance with Google
            Play Developer policies.
          </p>
        </div>

        {/* Option 1: In-App Deletion */}
        <Card themeMode="light">
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 600,
              margin: '0 0 8px 0',
              color: palette.text.primary,
            }}
          >
            Option 1: In-App Account Deletion (Recommended)
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: palette.text.secondary,
              lineHeight: 1.6,
              margin: '0 0 12px 0',
            }}
          >
            If you have the Daynori app installed on your Android device or can log into the web
            application, you can immediately and securely erase your account:
          </p>
          <ol
            style={{
              fontSize: '14px',
              color: palette.text.primary,
              lineHeight: 1.8,
              paddingLeft: 20,
              margin: 0,
            }}
          >
            <li>
              Open the Daynori app or navigate to <strong>Settings</strong>.
            </li>
            <li>
              Scroll to the <strong>Account Deletion & Data Erasure</strong> section.
            </li>
            <li>
              Click <strong>Delete Account</strong>.
            </li>
            <li>Re-authenticate with your password to verify ownership.</li>
            <li>
              Review the retention disclosure and click{' '}
              <strong>Permanently Delete Everything</strong>.
            </li>
          </ol>
        </Card>

        {/* Option 2: Web Deletion Request (if uninstalled) */}
        <Card themeMode="light">
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 600,
              margin: '0 0 8px 0',
              color: palette.text.primary,
            }}
          >
            Option 2: Web Deletion Request Form
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: palette.text.secondary,
              lineHeight: 1.6,
              margin: '0 0 16px 0',
            }}
          >
            If you have uninstalled Daynori or cannot access your account, submit your account email
            below. If an account exists, a verification link with instructions will be sent to
            confirm your request.
          </p>

          {resultMessage && (
            <div style={{ marginBottom: spacing.md }}>
              <Feedback
                severity="success"
                title="Request Received"
                message={resultMessage}
                themeMode="light"
              />
            </div>
          )}

          {errorMessage && (
            <div style={{ marginBottom: spacing.md }}>
              <Feedback
                severity="danger"
                title="Submission Error"
                message={errorMessage}
                themeMode="light"
              />
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}
          >
            <div>
              <label
                htmlFor="deletion-email"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: palette.text.primary,
                  marginBottom: spacing.xs,
                }}
              >
                Account Email Address *
              </label>
              <input
                id="deletion-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                style={{
                  width: '100%',
                  minHeight: touchTargets.webMin,
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  borderRadius: radii.sm,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surface,
                  color: palette.text.primary,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="deletion-reason"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: palette.text.primary,
                  marginBottom: spacing.xs,
                }}
              >
                Optional Feedback / Reason
              </label>
              <textarea
                id="deletion-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Let us know why you are deleting your account (optional)"
                style={{
                  width: '100%',
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  borderRadius: radii.sm,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surface,
                  color: palette.text.primary,
                  boxSizing: 'border-box',
                  fontFamily: typography.fontFamily.sans,
                }}
              />
            </div>

            <Button
              variant="danger"
              themeMode="light"
              disabled={isSubmitting || !email}
              type="submit"
            >
              {isSubmitting ? 'Submitting Request...' : 'Submit Deletion Request'}
            </Button>
          </form>
        </Card>

        {/* Policy Disclosures */}
        <Card themeMode="light">
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 600,
              margin: '0 0 12px 0',
              color: palette.text.primary,
            }}
          >
            Data Deletion & Retention Disclosures
          </h2>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: spacing.md,
              fontSize: '14px',
              lineHeight: 1.6,
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  margin: '0 0 4px 0',
                  color: palette.text.primary,
                }}
              >
                What data is deleted?
              </h3>
              <p style={{ margin: 0, color: palette.text.secondary }}>
                Upon confirmed deletion, the following data is permanently purged:
              </p>
              <ul style={{ margin: '4px 0 0 0', paddingLeft: 20, color: palette.text.primary }}>
                <li>All notes, markdown files, and scratchpad content.</li>
                <li>All tasks, checklists, and priority records.</li>
                <li>All routines, frequency schedules, and completion histories.</li>
                <li>All journal entries and date reflections.</li>
                <li>All uploaded attachments, photos, documents, and private storage objects.</li>
                <li>All calendar events and reminder notification schedules.</li>
                <li>Your user profile, authentication sessions, and push notification tokens.</li>
              </ul>
            </div>

            <div>
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  margin: '0 0 4px 0',
                  color: palette.text.primary,
                }}
              >
                Are any records retained?
              </h3>
              <p style={{ margin: 0, color: palette.text.secondary }}>
                We believe in zero unverified claims. We do not retain your personal content. To
                protect disaster recovery integrity, a content-free cryptographic hash (tombstone)
                is kept in our deletion suppression ledger for 90 days solely to prevent accidental
                reactivation when restoring point-in-time database snapshots. Transient automated
                backup snapshots rotate and expire completely within 30 days.
              </p>
            </div>

            <div>
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  margin: '0 0 4px 0',
                  color: palette.text.primary,
                }}
              >
                Questions or Assistance
              </h3>
              <p style={{ margin: 0, color: palette.text.secondary }}>
                If you have questions about your data privacy or encounter difficulties deleting
                your account, contact our privacy team at{' '}
                <a href="mailto:privacy@daynori.com" style={{ color: palette.action.primary }}>
                  privacy@daynori.com
                </a>
                .
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
