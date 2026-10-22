import { Icon } from './Icon.js';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import type {
  RequestAccountDeletionResponse,
  ConfirmAccountDeletionResponse,
} from '@daynori/contracts';
import { MobileButton } from './MobileButton.js';
import { MobileFeedback } from './MobileFeedback.js';
import { MobileModalSheet } from './MobileModalSheet.js';

export interface MobileAccountDeletionSheetProps {
  visible: boolean;
  onClose: () => void;
  themeMode?: ThemeMode;
  userEmail?: string;
  testID?: string;
  onRequestDeletion: (password: string) => Promise<RequestAccountDeletionResponse>;
  onConfirmDeletion: (confirmationToken: string) => Promise<ConfirmAccountDeletionResponse>;
  onSuccess?: () => void;
}

export const MobileAccountDeletionSheet: React.FC<MobileAccountDeletionSheetProps> = ({
  visible,
  onClose,
  themeMode = 'light',
  userEmail,
  testID = 'mobile-account-deletion-sheet',
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

  if (!visible) return null;

  const handleRequest = async () => {
    if (!password) {
      setErrorMessage('Current password is required to verify identity.');
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
    <MobileModalSheet
      visible={visible}
      onClose={step === 'completed' ? () => {} : onClose}
      title={
        step === 'completed'
          ? fullyDeleted
            ? 'Account Deleted'
            : 'Cleanup Pending'
          : 'Delete Account'
      }
      themeMode={themeMode}
      testID={testID}
    >
      <View style={styles.container}>
        {errorMessage && (
          <MobileFeedback
            severity="danger"
            title="Deletion Error"
            message={errorMessage}
            themeMode={themeMode}
          />
        )}

        {step === 'request' && (
          <View style={styles.section}>
            <View
              style={[
                styles.warningBox,
                {
                  backgroundColor: palette.status.dangerBg,
                  borderColor: palette.status.dangerBorder,
                },
              ]}
            >
              <Text style={[styles.warningTitle, { color: palette.status.danger }]}>
                <Icon name="warning" color={palette.status.danger} /> Permanent Action
              </Text>
              <Text style={[styles.bodyText, { color: palette.text.primary }]}>
                Deleting your Daynori account permanently erases your personal notes, tasks,
                routines, journal entries, uploaded files, and workspaces.
              </Text>
            </View>

            {userEmail && (
              <Text style={[styles.accountText, { color: palette.text.secondary }]}>
                Account: {userEmail}
              </Text>
            )}

            <View style={{ gap: spacing.xs }}>
              <Text style={[styles.label, { color: palette.text.primary }]}>
                Enter your password to verify:
              </Text>
              <TextInput
                testID="mobile-input-delete-password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="Current password"
                placeholderTextColor={palette.text.secondary}
                style={[
                  styles.input,
                  {
                    color: palette.text.primary,
                    borderColor: palette.border.subtle,
                    backgroundColor: palette.surface,
                  },
                ]}
              />
            </View>

            <View style={styles.actionsRow}>
              <MobileButton
                testID="mobile-btn-cancel-deletion"
                variant="secondary"
                themeMode={themeMode}
                onPress={onClose}
                disabled={isLoading}
              >
                Cancel
              </MobileButton>
              <MobileButton
                testID="mobile-btn-request-deletion"
                variant="danger"
                themeMode={themeMode}
                onPress={handleRequest}
                disabled={isLoading || !password}
              >
                {isLoading ? 'Verifying...' : 'Continue'}
              </MobileButton>
            </View>
          </View>
        )}

        {step === 'confirm' && (
          <View style={styles.section}>
            <View
              style={[
                styles.warningBox,
                {
                  backgroundColor: palette.status.warningBg,
                  borderColor: palette.status.warningBorder,
                },
              ]}
            >
              <Text style={[styles.warningTitle, { color: palette.status.warning }]}>
                <Icon name="clipboard" color={palette.status.warning} /> Retention & Recovery
                Disclosure
              </Text>
              <Text style={[styles.bodyText, { color: palette.text.primary }]}>
                {disclosure ||
                  'Confirmation removes your organizer records. Provider and file cleanup may remain pending. Full deletion is confirmed only after cleanup succeeds.'}
              </Text>
            </View>

            <Text style={[styles.promptText, { color: palette.text.primary }]}>
              Confirm permanent erasure of your account and all associated data?
            </Text>

            <View style={styles.actionsRow}>
              <MobileButton
                testID="mobile-btn-back-deletion"
                variant="secondary"
                themeMode={themeMode}
                onPress={() => setStep('request')}
                disabled={isLoading}
              >
                Back
              </MobileButton>
              <MobileButton
                testID="mobile-btn-confirm-deletion"
                variant="danger"
                themeMode={themeMode}
                onPress={handleConfirm}
                disabled={isLoading}
              >
                {isLoading ? 'Erasing...' : 'Delete Everything'}
              </MobileButton>
            </View>
          </View>
        )}

        {step === 'completed' && (
          <View style={styles.completedContainer}>
            <MobileFeedback
              severity={fullyDeleted ? 'success' : 'info'}
              title={fullyDeleted ? 'Account Deleted' : 'Cleanup Pending'}
              message={
                fullyDeleted
                  ? 'Your account and data have been removed. Redirecting...'
                  : 'Your organizer records were removed. Account-provider or file cleanup is still pending; full deletion has not been confirmed.'
              }
              themeMode={themeMode}
            />
          </View>
        )}
      </View>
    </MobileModalSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    gap: spacing.md,
  },
  section: {
    gap: spacing.md,
  },
  warningBox: {
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.xs,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  accountText: {
    fontSize: 13,
    fontWeight: '500',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    fontSize: 15,
  },
  promptText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  completedContainer: {
    paddingVertical: spacing.lg,
  },
});
