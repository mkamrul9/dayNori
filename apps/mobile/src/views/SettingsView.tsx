import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { Icon, IconText, MobileButton, MobileCard } from '@daynori/ui-mobile';
import type { NotificationCapabilityState } from '../notifications/adapter.js';
import { isCorePreview } from '../config/runtime.js';

export interface SettingsViewProps {
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  textScale: number;
  onChangeTextScale: (scale: number) => void;
  isAuthenticated: boolean;
  onToggleAuth: () => void;
  onOpenAccount?: () => void;
  onOpenGallery?: () => void;
  onOpenAllFeatures?: () => void;
  onOpenOnboarding?: () => void;
  onClose: () => void;
  testID?: string;
  devReviewMode?: boolean;
  workspaceId?: string | null;
  onProvisionWorkspace?: () => Promise<void>;
  weekStart?: 'monday' | 'sunday' | 'saturday';
  onChangeWeekStart?: (weekStart: 'monday' | 'sunday' | 'saturday') => void;
  timeZone?: string;
  notificationCapability?: NotificationCapabilityState | null;
  onRequestNotificationPermission?: () => Promise<void>;
  onOpenSyncDiagnostics?: () => void;
  onOpenRecoveryExport?: () => void;
  onOpenPortability?: () => void;
  onOpenAccountDeletion?: () => void;
  expensesEnabled?: boolean;
  onToggleExpensesEnabled?: (enabled: boolean) => void;
  onOpenExpenses?: () => void;
  onOpenCustomSections?: () => void;
  /** Opens isolated synthetic vault unlock harness (Phase 46). Not production vault. */
  onOpenVaultHarness?: () => void;
  /** Opens provisional Drive connections sheet (Phase 49). */
  onOpenDriveConnections?: () => void;
  /** Opens provisional shared rooms sheet (Phase 51). */
  onOpenRooms?: () => void;
  /** Opens provisional assistant sheet (Phase 56). */
  onOpenAssistant?: () => void;
  /** Opens provisional billing sheet (Phase 57). */
  onOpenBilling?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  themeMode,
  onToggleTheme,
  textScale,
  onChangeTextScale,
  isAuthenticated,
  onToggleAuth,
  onOpenAccount,
  onOpenGallery,
  onOpenAllFeatures,
  onOpenOnboarding,
  onClose,
  testID = 'settings-view',
  devReviewMode = false,
  workspaceId = null,
  onProvisionWorkspace,
  weekStart = 'monday',
  onChangeWeekStart,
  timeZone = 'UTC',
  notificationCapability = null,
  onRequestNotificationPermission,
  onOpenSyncDiagnostics,
  onOpenRecoveryExport,
  onOpenPortability,
  onOpenAccountDeletion,
  expensesEnabled = false,
  onToggleExpensesEnabled,
  onOpenExpenses,
  onOpenCustomSections,
  onOpenVaultHarness,
  onOpenDriveConnections,
  onOpenRooms,
  onOpenAssistant,
  onOpenBilling,
}) => {
  const palette = colors[themeMode];
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [showDevReview, setShowDevReview] = useState(devReviewMode);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) setIsReducedMotion(enabled);
    });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (isMounted) setIsReducedMotion(enabled);
    });

    return () => {
      isMounted = false;
      if (sub && typeof sub.remove === 'function') {
        sub.remove();
      }
    };
  }, []);

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <Text accessibilityRole="header" style={[styles.title, { color: palette.text.primary }]}>
          Settings & Help
        </Text>
        <MobileButton
          variant="subtle"
          themeMode={themeMode}
          onPress={onClose}
          accessibilityLabel="Close settings"
        >
          <Icon name="x" /> Done
        </MobileButton>
      </View>

      {/* Section 1: Appearance & Theme */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>Appearance</Text>
        <MobileCard themeMode={themeMode}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: palette.text.primary }]}>Theme Mode</Text>
              <Text style={[styles.settingDescription, { color: palette.text.secondary }]}>
                Current: {themeMode === 'light' ? 'Warm Paper (Light)' : 'Dark Ink (Dark)'}
              </Text>
            </View>
            <MobileButton
              variant="secondary"
              themeMode={themeMode}
              onPress={onToggleTheme}
              accessibilityLabel={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} theme`}
            >
              {themeMode === 'light' ? (
                <>
                  <Icon name="moon" /> {'Dark'}
                </>
              ) : (
                <>
                  <Icon name="sun" /> {'Light'}
                </>
              )}
            </MobileButton>
          </View>
        </MobileCard>
      </View>

      {/* Section 2: Text Scaling & Typography */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          Typography & Text Scaling
        </Text>
        <MobileCard themeMode={themeMode}>
          <Text
            style={[
              styles.settingDescription,
              { color: palette.text.secondary, marginBottom: spacing.sm },
            ]}
          >
            Scale interface font sizes (100% to 200%) without clipping or layout breaking:
          </Text>
          <View style={styles.scaleButtonGroup}>
            {[1.0, 1.25, 1.5, 2.0].map((scale) => {
              const isSelected = textScale === scale;
              return (
                <Pressable
                  key={scale}
                  testID={`scale-btn-${scale}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Text scale ${scale * 100}%`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => onChangeTextScale(scale)}
                  style={[
                    styles.scaleButton,
                    {
                      backgroundColor: isSelected ? palette.action.primary : palette.surfaceRaised,
                      borderColor: palette.border.subtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.scaleButtonText,
                      { color: isSelected ? palette.action.label : palette.text.primary },
                    ]}
                  >
                    {scale * 100}%
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </MobileCard>
      </View>

      {/* Section 3: Accessibility & Reduced Motion */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          System Accessibility Status
        </Text>
        <MobileCard themeMode={themeMode}>
          <View style={styles.statusRow}>
            <Text style={[styles.statusLabel, { color: palette.text.primary }]}>
              OS Reduced Motion:
            </Text>
            <Text
              style={[
                styles.statusValue,
                { color: isReducedMotion ? palette.status.success : palette.text.secondary },
              ]}
            >
              {isReducedMotion ? (
                <>
                  <Icon name="check" /> Enabled (Animations disabled)
                </>
              ) : (
                'Standard (Smooth slide animations)'
              )}
            </Text>
          </View>
        </MobileCard>
      </View>

      {/* Section 4: Multilingual & Bangla Preview */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          Bangla Readability Preview (বাংলা)
        </Text>
        <MobileCard themeMode={themeMode}>
          <Text style={[styles.banglaHeadline, { color: palette.text.primary }]}>
            দৈনন্দিন জীবনের সুন্দর ও সুশৃঙ্খল পরিচালনা
          </Text>
          <Text style={[styles.banglaBody, { color: palette.text.secondary }]}>
            Daynori বাংলা যুক্তবর্ণ ও স্বরচিহ্ন যথাযথভাবে প্রদর্শনের জন্য ১.৬ লাইন-হাইট ও স্পষ্ট
            ফন্ট রেন্ডারিং নিশ্চিত করে।
          </Text>
        </MobileCard>
      </View>

      {/* Section 5: Security & Authentication Lifecycle */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          Authentication & Access
        </Text>
        <MobileCard themeMode={themeMode}>
          <Text style={[styles.settingLabel, { color: palette.text.primary, marginBottom: 4 }]}>
            Current Session:{' '}
            {isAuthenticated
              ? 'Authenticated Account (OS Secure KeyStore)'
              : 'Unauthenticated (Local Offline)'}
          </Text>
          <Text
            style={[
              styles.settingDescription,
              { color: palette.text.secondary, marginBottom: spacing.sm },
            ]}
          >
            {isAuthenticated
              ? 'Your account session is active and stored in platform-protected secure storage. Quarantined drafts are isolated.'
              : 'Sign in or verify an email link to synchronize your personal items across devices.'}
          </Text>

          <MobileButton
            themeMode={themeMode}
            onPress={isAuthenticated ? onToggleAuth : onOpenAccount}
          >
            {isAuthenticated ? 'Sign out' : 'Sign in or create account'}
          </MobileButton>
          {showDevReview ? (
            <View
              style={{
                marginTop: spacing.xs,
                padding: spacing.sm,
                borderRadius: radii.sm,
                backgroundColor: palette.surfaceRaised,
                borderWidth: 1,
                borderColor: palette.border.subtle,
              }}
            >
              <Text
                style={[
                  styles.settingLabel,
                  { color: palette.text.primary, fontSize: 13, marginBottom: 2 },
                ]}
              >
                Development Review Mode Active
              </Text>
              <Text
                style={[
                  styles.settingDescription,
                  { color: palette.text.secondary, fontSize: 12, marginBottom: spacing.sm },
                ]}
              >
                Toggle synthetic authentication state to verify protected destination gating (e.g.
                Journal).
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <MobileButton
                  variant={isAuthenticated ? 'subtle' : 'primary'}
                  themeMode={themeMode}
                  onPress={onToggleAuth}
                  accessibilityLabel={
                    isAuthenticated ? 'Log out synthetic account' : 'Log in synthetic account'
                  }
                >
                  {isAuthenticated ? 'Sign Out Synthetic' : 'Sign In Synthetic'}
                </MobileButton>
                <MobileButton
                  variant="subtle"
                  themeMode={themeMode}
                  onPress={() => setShowDevReview(false)}
                  accessibilityLabel="Hide development review tools"
                >
                  Hide Dev Tools
                </MobileButton>
              </View>
            </View>
          ) : (
            <MobileButton
              variant="subtle"
              themeMode={themeMode}
              onPress={() => setShowDevReview(true)}
              accessibilityLabel="Show development review authentication tools"
            >
              <Icon name="tools" /> Show Dev Review Tools
            </MobileButton>
          )}
        </MobileCard>
      </View>

      {/* Section 5b: Personal Workspace & Preferences (Phase 10) */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          Personal Workspace & Preferences
        </Text>
        <MobileCard themeMode={themeMode}>
          <View style={{ marginBottom: spacing.sm }}>
            <Text style={[styles.settingLabel, { color: palette.text.primary, fontSize: 13 }]}>
              Personal Workspace Status:
            </Text>
            <Text
              testID="mobile-workspace-id"
              style={[
                styles.settingDescription,
                {
                  color: workspaceId ? palette.status.success : palette.text.secondary,
                  fontFamily: 'monospace',
                  marginTop: 2,
                },
              ]}
            >
              <IconText
                text={workspaceId ? `Active (ID:  ${workspaceId})` : 'Workspace not provisioned'}
              />
            </Text>
          </View>

          {isAuthenticated && !workspaceId && onProvisionWorkspace && (
            <View style={{ marginBottom: spacing.sm }}>
              <MobileButton
                variant="primary"
                themeMode={themeMode}
                onPress={() => void onProvisionWorkspace()}
                accessibilityLabel="Provision personal workspace"
              >
                Provision Personal Workspace
              </MobileButton>
            </View>
          )}

          <View style={{ marginBottom: spacing.sm }}>
            <Text
              style={[
                styles.settingLabel,
                { color: palette.text.primary, fontSize: 13, marginBottom: 4 },
              ]}
            >
              IANA Time Zone: {timeZone}
            </Text>
          </View>

          <View style={{ marginBottom: spacing.xs }}>
            <Text
              style={[
                styles.settingLabel,
                { color: palette.text.primary, fontSize: 13, marginBottom: spacing.xs },
              ]}
            >
              Week Starts On:
            </Text>
            <View style={styles.scaleButtonGroup}>
              {(['monday', 'sunday', 'saturday'] as const).map((day) => {
                const isSelected = weekStart === day;
                return (
                  <Pressable
                    key={day}
                    testID={`mobile-weekstart-${day}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Week start ${day}`}
                    onPress={() => onChangeWeekStart?.(day)}
                    style={[
                      styles.scaleButton,
                      {
                        backgroundColor: isSelected
                          ? palette.action.primary
                          : palette.surfaceRaised,
                        borderColor: palette.border.subtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.scaleButtonText,
                        {
                          color: isSelected ? palette.action.label : palette.text.primary,
                          textTransform: 'capitalize',
                        },
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </MobileCard>
      </View>

      {/* Section 5c: Android Notifications & Local Reminders (Phase 28) */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          Notifications & Reminders
        </Text>
        <MobileCard themeMode={themeMode}>
          <View style={{ marginBottom: spacing.sm }}>
            <Text style={[styles.settingLabel, { color: palette.text.primary, fontSize: 13 }]}>
              Permission Status:
            </Text>
            <Text
              testID="mobile-notification-permission-status"
              style={[
                styles.settingDescription,
                {
                  color:
                    notificationCapability?.status === 'granted'
                      ? palette.status.success
                      : notificationCapability?.status === 'channel_disabled'
                        ? palette.status.warning
                        : palette.text.secondary,
                  fontWeight: '600',
                  marginTop: 2,
                },
              ]}
            >
              {notificationCapability?.status === 'granted' ? (
                <>
                  <Icon name="check" /> Enabled (Granted by OS)
                </>
              ) : notificationCapability?.status === 'channel_disabled' ? (
                <>
                  <Icon name="warning" /> Channel Disabled in Android System Settings
                </>
              ) : notificationCapability?.status === 'denied' ? (
                <>
                  <Icon name="x" /> Denied (Organizer functions remain fully usable)
                </>
              ) : (
                'Undetermined (Not Yet Requested)'
              )}
            </Text>
          </View>

          <View style={{ marginBottom: spacing.sm }}>
            <Text style={[styles.settingLabel, { color: palette.text.primary, fontSize: 13 }]}>
              Delivery Capability:
            </Text>
            <Text
              testID="mobile-notification-capability-details"
              style={[
                styles.settingDescription,
                { color: palette.text.secondary, marginTop: 2, lineHeight: 18 },
              ]}
            >
              {isCorePreview
                ? 'Reminder delivery is unavailable in this free testing preview.'
                : (notificationCapability?.details ??
                  'Local reminders schedule directly on Android. Server push serves as secondary fallback when online.')}
            </Text>
          </View>

          <View style={{ marginBottom: spacing.sm }}>
            <Text style={[styles.settingLabel, { color: palette.text.primary, fontSize: 13 }]}>
              Timing & Reliability Policy:
            </Text>
            <Text
              style={[
                styles.settingDescription,
                { color: palette.text.secondary, marginTop: 2, lineHeight: 18 },
              ]}
            >
              Standard best-effort delivery. Daynori does not claim medical or exact-alarm
              reliability, complying with Google Play policies for organizer applications.
            </Text>
          </View>

          {!isCorePreview &&
            notificationCapability?.status !== 'granted' &&
            onRequestNotificationPermission && (
              <View style={{ marginTop: spacing.xs }}>
                <MobileButton
                  testID="btn-request-notification-permission"
                  variant="primary"
                  themeMode={themeMode}
                  onPress={() => void onRequestNotificationPermission()}
                  accessibilityLabel="Enable notifications for reminder alerts"
                >
                  <Icon name="bell" /> Enable Reminder Notifications
                </MobileButton>
              </View>
            )}
        </MobileCard>
      </View>

      {/* Section 5b9: Billing (Phase 57 provisional) */}
      {isAuthenticated && onOpenBilling ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>Plan & billing</Text>
          <MobileCard themeMode={themeMode}>
            <Text style={[styles.settingDescription, { color: palette.text.secondary }]}>
              Synthetic local catalog and server entitlements. Not Play Billing proof. Production
              charges stay disabled.
            </Text>
            <View style={{ marginTop: spacing.sm }}>
              <MobileButton
                variant="secondary"
                themeMode={themeMode}
                onPress={onOpenBilling}
                accessibilityLabel="Open plan and billing"
              >
                Open billing
              </MobileButton>
            </View>
          </MobileCard>
        </View>
      ) : null}

      {/* Section 5c0: Assistant (Phase 56 provisional) */}
      {isAuthenticated && onOpenAssistant ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>Assistant</Text>
          <MobileCard themeMode={themeMode}>
            <Text style={[styles.settingDescription, { color: palette.text.secondary }]}>
              Provisional local source-linked answers and reviewable task/note drafts. Fake/gated
              provider only. Vault never accessed. Confirm is required before any write.
            </Text>
            <View style={{ marginTop: spacing.sm }}>
              <MobileButton
                variant="secondary"
                themeMode={themeMode}
                onPress={onOpenAssistant}
                accessibilityLabel="Open assistant"
              >
                Open assistant
              </MobileButton>
            </View>
          </MobileCard>
        </View>
      ) : null}

      {/* Section 5c1a: Shared rooms (Phase 51 provisional) */}
      {isAuthenticated && onOpenRooms ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>Shared rooms</Text>
          <MobileCard themeMode={themeMode}>
            <Text style={[styles.settingDescription, { color: palette.text.secondary }]}>
              Provisional local rooms with invite links. Joining never opens another personal
              workspace. Public sharing stays disabled.
            </Text>
            <View style={{ marginTop: spacing.sm }}>
              <MobileButton
                variant="secondary"
                themeMode={themeMode}
                onPress={onOpenRooms}
                accessibilityLabel="Open shared rooms"
              >
                Manage rooms
              </MobileButton>
            </View>
          </MobileCard>
        </View>
      ) : null}

      {/* Section 5c1b: Drive selected-file connector (Phase 49 provisional) */}
      {isAuthenticated && onOpenDriveConnections ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            Google Drive (selected files)
          </Text>
          <MobileCard themeMode={themeMode}>
            <Text style={[styles.settingDescription, { color: palette.text.secondary }]}>
              Optional narrow drive.file connector. Development fixtures are labeled. Production
              Google OAuth stays fail-closed until configured. Vault content is excluded.
            </Text>
            <View style={{ marginTop: spacing.sm }}>
              <MobileButton
                variant="secondary"
                themeMode={themeMode}
                onPress={onOpenDriveConnections}
                accessibilityLabel="Open Google Drive connection settings"
              >
                Manage Drive connection
              </MobileButton>
            </View>
          </MobileCard>
        </View>
      ) : null}

      {/* Section 5c2: Vault synthetic harness (Phase 46) — production vault remains disabled */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          Vault (development harness)
        </Text>
        <MobileCard themeMode={themeMode}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1, paddingRight: spacing.sm }}>
              <Text style={[styles.settingLabel, { color: palette.text.primary }]}>
                Synthetic unlock lifecycle
              </Text>
              <Text style={[styles.settingDescription, { color: palette.text.secondary }]}>
                Local Phase 46 harness with fixture ciphertext only. Does not enable vault for real
                users. Production vault stays disabled until Phase 44/45 gates pass.
              </Text>
            </View>
          </View>
          {onOpenVaultHarness ? (
            <View style={{ marginTop: spacing.sm }}>
              <MobileButton
                testID="btn-open-vault-harness"
                variant="secondary"
                themeMode={themeMode}
                onPress={onOpenVaultHarness}
                accessibilityLabel="Open synthetic vault unlock harness"
              >
                Open synthetic vault harness
              </MobileButton>
            </View>
          ) : null}
        </MobileCard>
      </View>

      {/* Section 5d: Expenses & Financial Tracking (Phase 40 Opt-in) */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          Expenses & Financial Tracking
        </Text>
        <MobileCard themeMode={themeMode}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1, paddingRight: spacing.sm }}>
              <Text style={[styles.settingLabel, { color: palette.text.primary }]}>
                Expenses Feature
              </Text>
              <Text style={[styles.settingDescription, { color: palette.text.secondary }]}>
                {expensesEnabled
                  ? 'Active. Quick capture, spending reports, and monthly budget tracking are enabled.'
                  : 'Disabled by default. Opt in to manage expenses, incomes, and budgets.'}
              </Text>
            </View>
            {onToggleExpensesEnabled && (
              <MobileButton
                testID="mobile-toggle-expenses"
                variant={expensesEnabled ? 'secondary' : 'primary'}
                themeMode={themeMode}
                onPress={() => onToggleExpensesEnabled(!expensesEnabled)}
                accessibilityLabel={
                  expensesEnabled ? 'Disable expenses feature' : 'Enable expenses feature'
                }
              >
                {expensesEnabled ? 'Disable' : 'Enable'}
              </MobileButton>
            )}
          </View>
          {expensesEnabled && onOpenExpenses && (
            <View style={{ marginTop: spacing.sm }}>
              <MobileButton
                testID="btn-open-expenses"
                variant="primary"
                themeMode={themeMode}
                onPress={onOpenExpenses}
                accessibilityLabel="Open Expenses Tracker"
              >
                <Icon name="credit-card" /> Open Expense Tracker <Icon name="arrow-right" />
              </MobileButton>
            </View>
          )}
        </MobileCard>
      </View>

      {/* Section 5e: Custom Sections (Phase 43) */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>Custom Sections</Text>
        <MobileCard themeMode={themeMode}>
          <Text
            style={[
              styles.settingDescription,
              { color: palette.text.secondary, marginBottom: spacing.sm },
            ]}
          >
            Create flexible structured workspaces, reading lists, study hubs, and view blocks.
          </Text>
          {onOpenCustomSections && (
            <MobileButton
              testID="btn-open-custom-sections"
              variant="primary"
              themeMode={themeMode}
              onPress={onOpenCustomSections}
              accessibilityLabel="Open Custom Sections"
            >
              <Icon name="clipboard" /> Open Custom Sections <Icon name="arrow-right" />
            </MobileButton>
          )}
        </MobileCard>
      </View>

      {/* Section 6: Tutorial & Getting Started */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          Tutorial & Getting Started
        </Text>
        <MobileCard themeMode={themeMode}>
          <Text
            style={[
              styles.settingDescription,
              { color: palette.text.secondary, marginBottom: spacing.sm },
            ]}
          >
            Review the first-use guide, customize your preferred module shortcuts, or explore
            starter templates:
          </Text>
          <MobileButton
            testID="btn-replay-tutorial"
            variant="secondary"
            themeMode={themeMode}
            onPress={onOpenOnboarding}
            accessibilityLabel="Replay Onboarding Tutorial"
          >
            <Icon name="book" /> Replay Onboarding Tutorial <Icon name="arrow-right" />
          </MobileButton>
        </MobileCard>
      </View>

      {/* Section 7: Sync & Offline Recovery (Phase 34) */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          Sync & Offline Recovery
        </Text>
        <MobileCard themeMode={themeMode}>
          <Text
            style={[
              styles.settingDescription,
              { color: palette.text.secondary, marginBottom: spacing.sm },
            ]}
          >
            Inspect sync queue health, active conflicts, and export uncommitted drafts or offline
            recovery data without exposing sensitive credentials or vault plaintexts.
          </Text>
          <View style={{ gap: spacing.xs }}>
            <MobileButton
              testID="btn-open-sync-diagnostics"
              variant="secondary"
              themeMode={themeMode}
              onPress={onOpenSyncDiagnostics}
              accessibilityLabel="View Sync Diagnostics"
            >
              <Icon name="refresh" /> View Sync Diagnostics <Icon name="arrow-right" />
            </MobileButton>
            <MobileButton
              testID="btn-open-recovery-export"
              variant="secondary"
              themeMode={themeMode}
              onPress={onOpenRecoveryExport}
              accessibilityLabel="Export Recovery Drafts"
            >
              <Icon name="save" /> Export Recovery Drafts <Icon name="arrow-right" />
            </MobileButton>
          </View>
        </MobileCard>
      </View>

      {/* Section 8: Workspace Portability (Export & Import) (Phase 35) */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          Workspace Portability (Export & Import)
        </Text>
        <MobileCard themeMode={themeMode}>
          <Text
            style={[
              styles.settingDescription,
              { color: palette.text.secondary, marginBottom: spacing.sm },
            ]}
          >
            Export your workspace data into open formats (JSON, Markdown, CSV, attachments), or
            preview and import a verified archive.
          </Text>
          <MobileButton
            testID="btn-open-workspace-portability"
            variant="primary"
            themeMode={themeMode}
            onPress={onOpenPortability}
            accessibilityLabel="Export or Import Workspace"
          >
            <Icon name="archive" /> Export / Import Workspace <Icon name="arrow-right" />
          </MobileButton>
        </MobileCard>
      </View>

      {/* Section 9: Account Deletion & Data Erasure (Phase 36) */}
      {isAuthenticated && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.status.danger }]}>
            Account Deletion & Data Erasure
          </Text>
          <MobileCard themeMode={themeMode}>
            <Text
              style={[
                styles.settingDescription,
                { color: palette.text.secondary, marginBottom: spacing.sm },
              ]}
            >
              Permanently delete your Daynori account and erase all notes, tasks, routines, journal
              entries, and private files. Requires password verification and explicit confirmation.
            </Text>
            <MobileButton
              testID="btn-open-account-deletion"
              variant="danger"
              themeMode={themeMode}
              onPress={onOpenAccountDeletion}
              accessibilityLabel="Delete Account and Data"
            >
              <Icon name="trash" /> Delete Account <Icon name="arrow-right" />
            </MobileButton>
          </MobileCard>
        </View>
      )}

      {/* Phase 66: All features directory */}
      {onOpenAllFeatures ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            Workspace &amp; visible features
          </Text>
          <MobileCard themeMode={themeMode}>
            <Text
              style={[
                styles.settingDescription,
                { color: palette.text.secondary, marginBottom: spacing.sm },
              ]}
            >
              Find, pin, hide, and restore modules. Hiding keeps your content and reminders.
            </Text>
            <MobileButton
              variant="primary"
              themeMode={themeMode}
              onPress={onOpenAllFeatures}
              accessibilityLabel="Open All features"
              testID="btn-open-all-features"
            >
              <Icon name="sliders" /> All features
            </MobileButton>
          </MobileCard>
        </View>
      ) : null}

      {/* Operator-only component gallery (Phase 66) */}
      {onOpenGallery ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            Developer tools
          </Text>
          <MobileCard themeMode={themeMode}>
            <Text
              style={[
                styles.settingDescription,
                { color: palette.text.secondary, marginBottom: spacing.sm },
              ]}
            >
              Restricted operator surface for accessible primitives review.
            </Text>
            <MobileButton
              variant="secondary"
              themeMode={themeMode}
              onPress={onOpenGallery}
              accessibilityLabel="Open Component Gallery"
            >
              <Icon name="palette" /> Open Component Gallery <Icon name="arrow-right" />
            </MobileButton>
          </MobileCard>
        </View>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  settingDescription: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  scaleButtonGroup: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  scaleButton: {
    flex: 1,
    minHeight: touchTargets.mobileMin, // 48dp minimum
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusRow: {
    paddingVertical: spacing.xs,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusValue: {
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
  banglaHeadline: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 26,
    marginBottom: spacing.xs,
  },
  banglaBody: {
    fontSize: 13,
    lineHeight: 22, // 1.6 ratio for Bengali conjunct legibility
  },
});
