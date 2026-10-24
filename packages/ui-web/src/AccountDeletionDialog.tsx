import { Icon } from './Icon.js';
import React, { useState } from 'react';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import type {
  RequestAccountDeletionResponse,
  ConfirmAccountDeletionResponse,
} from '@daynori/contracts';
import { Button } from './Button.js';
import { Dialog } from './Dialog.js';
import { Feedback } from './Feedback.js';

export interface AccountDeletionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode?: ThemeMode;
  userEmail?: string;
  onRequestDeletion: (password: string) => Promise<RequestAccountDeletionResponse>;
  onConfirmDeletion: (confirmationToken: string) => Promise<ConfirmAccountDeletionResponse>;
  onSuccess?: () => void;
}

export const AccountDeletionDialog: React.FC<AccountDeletionDialogProps> = ({
  isOpen,
  onClose,
  themeMode = 'light',
  userEmail,
  onRequestDeletion,
  onConfirmDeletion,
  onSuccess,
}) => {
  const palette = colors[themeMode];

  const [step, setStep] = useState<'request' | 'confirm' | 'completed'>('request');
  const [password, setPassword] = useState('');
  const [confirmationToken, setConfirmationToken] = useState('');
  const [disclosure, setDisclosure] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletionResult, setDeletionResult] = useState<ConfirmAccountDeletionResponse | null>(null);
  const fullyDeleted = deletionResult?.status === 'completed';

  if (!isOpen) return null;

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMessage('Current password is required to verify your identity.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await onRequestDeletion(password);
      setDisclosure(res.retainedDataDisclosure);
      if (res.confirmationToken) {
        setConfirmationToken(res.confirmationToken);
      }
      setStep('confirm');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await onConfirmDeletion(confirmationToken);
      if (!result.success || !['completed', 'processing'].includes(result.status))
        throw new Error(
          'Deletion could not be confirmed. Please check its status before retrying.'
        );
      setDeletionResult(result);
      setStep('completed');
      if (onSuccess) {
        setTimeout(onSuccess, 1500);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={step === 'completed' ? () => {} : onClose}
      title={
        step === 'completed'
          ? fullyDeleted
            ? 'Account Deleted'
            : 'Cleanup Pending'
          : 'Delete Daynori Account'
      }
      themeMode={themeMode}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, maxWidth: 520 }}>
        {errorMessage && (
          <Feedback
            severity="danger"
            title="Deletion Request Error"
            message={errorMessage}
            themeMode={themeMode}
          />
        )}

        {step === 'request' && (
          <form
            onSubmit={handleRequest}
            style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}
          >
            <div
              style={{
                backgroundColor: palette.status.dangerBg,
                border: `1px solid ${palette.status.dangerBorder}`,
                borderRadius: radii.card,
                padding: spacing.md,
              }}
            >
              <h4
                style={{
                  color: palette.status.danger,
                  margin: `0 0 ${spacing.xs} 0`,
                  fontSize: '1rem',
                }}
              >
                <Icon name="warning" /> Irreversible Action
              </h4>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.9rem',
                  color: palette.text.primary,
                  lineHeight: 1.5,
                }}
              >
                Deleting your Daynori account permanently removes all your personal notes, tasks,
                routines, journal entries, uploaded files, and workspaces. This action cannot be
                undone.
              </p>
            </div>

            {userEmail && (
              <p style={{ margin: 0, fontSize: '0.9rem', color: palette.text.secondary }}>
                Account: <strong>{userEmail}</strong>
              </p>
            )}

            <div>
              <label
                htmlFor="account-delete-password"
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: palette.text.primary,
                  marginBottom: spacing.xs,
                }}
              >
                Enter your password to verify:
              </label>
              <input
                id="account-delete-password"
                data-testid="input-delete-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Current password"
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

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: spacing.sm,
                marginTop: spacing.sm,
              }}
            >
              <Button
                variant="secondary"
                themeMode={themeMode}
                onClick={onClose}
                disabled={isLoading}
                type="button"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                themeMode={themeMode}
                disabled={isLoading || !password}
                type="submit"
                data-testid="btn-request-account-deletion"
              >
                {isLoading ? 'Verifying...' : 'Continue to Confirmation'}
              </Button>
            </div>
          </form>
        )}

        {step === 'confirm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            <div
              style={{
                backgroundColor: palette.status.warningBg,
                border: `1px solid ${palette.status.warningBorder}`,
                borderRadius: radii.card,
                padding: spacing.md,
              }}
            >
              <h4
                style={{
                  color: palette.status.warning,
                  margin: `0 0 ${spacing.xs} 0`,
                  fontSize: '0.95rem',
                }}
              >
                <Icon name="clipboard" /> Data Retention & Recovery Disclosure
              </h4>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.85rem',
                  color: palette.text.primary,
                  lineHeight: 1.5,
                }}
              >
                {disclosure ||
                  'Confirmation removes your organizer records. Provider and file cleanup may remain pending. Full deletion is confirmed only after cleanup succeeds.'}
              </p>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: '0.9rem',
                color: palette.text.primary,
                fontWeight: 500,
              }}
            >
              Are you absolutely certain you want to erase your account and all associated data now?
            </p>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: spacing.sm,
                marginTop: spacing.sm,
              }}
            >
              <Button
                variant="secondary"
                themeMode={themeMode}
                onClick={() => setStep('request')}
                disabled={isLoading}
              >
                Back
              </Button>
              <Button
                variant="danger"
                themeMode={themeMode}
                onClick={handleConfirm}
                disabled={isLoading}
                data-testid="btn-confirm-account-deletion"
              >
                {isLoading ? 'Erasing Account...' : 'Permanently Delete Everything'}
              </Button>
            </div>
          </div>
        )}

        {step === 'completed' && (
          <div style={{ textAlign: 'center', padding: spacing.md }}>
            <Feedback
              severity={fullyDeleted ? 'success' : 'info'}
              title={fullyDeleted ? 'Account Permanently Deleted' : 'Cleanup Pending'}
              message={
                fullyDeleted
                  ? 'Your account, personal records, and files have been removed. Redirecting...'
                  : 'Your organizer records were removed. Account-provider or file cleanup is still pending; full deletion has not been confirmed.'
              }
              themeMode={themeMode}
            />
          </div>
        )}
      </div>
    </Dialog>
  );
};
