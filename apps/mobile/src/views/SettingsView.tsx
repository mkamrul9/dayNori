import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton, MobileCard } from '@daynori/ui-mobile';
import type { NotificationCapabilityState } from '../notifications/adapter.js';

export interface SettingsViewProps {
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  textScale: number;
  onChangeTextScale: (scale: number) => void;
  isAuthenticated: boolean;
  onToggleAuth: () => void;
  onOpenGallery: () => void;
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
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  themeMode,
  onToggleTheme,
  textScale,
  onChangeTextScale,
  isAuthenticated,
  onToggleAuth,
  onOpenGallery,
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
          ✕ Done
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
              {themeMode === 'light' ? '🌙 Dark' : '☀️ Light'}
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
              {isReducedMotion
                ? '✓ Enabled (Animations disabled)'
                : 'Standard (Smooth slide animations)'}
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
              🛠️ Show Dev Review Tools
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
              {workspaceId ? `✓ Active (ID: ${workspaceId})` : 'Workspace not provisioned'}
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
              {notificationCapability?.status === 'granted'
                ? '✓ Enabled (Granted by OS)'
                : notificationCapability?.status === 'channel_disabled'
                  ? '⚠️ Channel Disabled in Android System Settings'
                  : notificationCapability?.status === 'denied'
                    ? '✗ Denied (Organizer functions remain fully usable)'
                    : 'Undetermined (Not Yet Requested)'}
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
              {notificationCapability?.details ??
                'Local reminders schedule directly on Android. Server push serves as secondary fallback when online.'}
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
              Standard best-effort delivery. Daynori does not claim medical or exact-alarm reliability, complying with Google Play policies for organizer applications.
            </Text>
          </View>

          {notificationCapability?.status !== 'granted' && onRequestNotificationPermission && (
            <View style={{ marginTop: spacing.xs }}>
              <MobileButton
                testID="btn-request-notification-permission"
                variant="primary"
                themeMode={themeMode}
                onPress={() => void onRequestNotificationPermission()}
                accessibilityLabel="Enable notifications for reminder alerts"
              >
                🔔 Enable Reminder Notifications
              </MobileButton>
            </View>
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
            Review the first-use guide, customize your preferred module shortcuts, or explore starter templates:
          </Text>
          <MobileButton
            testID="btn-replay-tutorial"
            variant="secondary"
            themeMode={themeMode}
            onPress={onOpenOnboarding}
            accessibilityLabel="Replay Onboarding Tutorial"
          >
            📖 Replay Onboarding Tutorial &rarr;
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
            Inspect sync queue health, active conflicts, and export uncommitted drafts or offline recovery data without exposing sensitive credentials or vault plaintexts.
          </Text>
          <View style={{ gap: spacing.xs }}>
            <MobileButton
              testID="btn-open-sync-diagnostics"
              variant="secondary"
              themeMode={themeMode}
              onPress={onOpenSyncDiagnostics}
              accessibilityLabel="View Sync Diagnostics"
            >
              🔄 View Sync Diagnostics &rarr;
            </MobileButton>
            <MobileButton
              testID="btn-open-recovery-export"
              variant="secondary"
              themeMode={themeMode}
              onPress={onOpenRecoveryExport}
              accessibilityLabel="Export Recovery Drafts"
            >
              💾 Export Recovery Drafts &rarr;
            </MobileButton>
          </View>
        </MobileCard>
      </View>

      {/* Section 8: Preserved Phase 04 Component Gallery Destination */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          Review & Architecture
        </Text>
        <MobileCard themeMode={themeMode}>
          <Text
            style={[
              styles.settingDescription,
              { color: palette.text.secondary, marginBottom: spacing.sm },
            ]}
          >
            View and test the accessible primitives and token verification matrix from Phase 04:
          </Text>
          <MobileButton
            variant="secondary"
            themeMode={themeMode}
            onPress={onOpenGallery}
            accessibilityLabel="Open Component Gallery"
          >
            🎨 Open Component Gallery &rarr;
          </MobileButton>
        </MobileCard>
      </View>
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
