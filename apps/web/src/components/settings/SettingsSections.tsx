'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import {
  Button,
  Card,
  Feedback,
  AccountDeletionDialog,
  Icon,
} from '@daynori/ui-web';
import { corePreviewNotice, isCorePreview } from '../../config/preview';
import { ReminderAgendaView } from '../ReminderAgendaView';
import { createWebApiClient } from '../../data/webApiClient';
import { useShell } from '../ShellContext';
import { useAuth } from '../AuthContext';
import { useFeatureNavigation } from '../../navigation/useFeatureNavigation';
import { useSettingsPreferences } from './useSettingsPreferences';

type Prefs = ReturnType<typeof useSettingsPreferences>;

function PrefFeedback({ prefs }: { prefs: Prefs }) {
  const { themeMode } = useShell();
  if (prefs.isLoading) {
    return (
      <Feedback severity="info" message="Loading preferences…" themeMode={themeMode} />
    );
  }
  if (prefs.loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
        <Feedback severity="danger" message={prefs.loadError} themeMode={themeMode} />
        <Button
          variant="secondary"
          size="compact"
          themeMode={themeMode}
          onClick={() => void prefs.handleReload()}
          id="settings-retry-load-btn"
        >
          Retry
        </Button>
      </div>
    );
  }
  if (!prefs.feedback) return null;
  return (
    <Feedback
      severity={prefs.feedback.severity}
      message={prefs.feedback.message}
      themeMode={themeMode}
    />
  );
}

export function AppearanceSettingsSection() {
  const {
    themeMode,
    setTheme,
    textScale,
    setTextScale,
    direction,
    setDirection,
    language,
    setLanguage,
    shortcutsEnabled,
    setShortcutsEnabled,
  } = useShell();
  const palette = colors[themeMode];

  return (
    <>
      <Card themeMode={themeMode}>
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Color Theme
        </h2>
        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
          Select warm paper light mode or deep ink dark mode. Both meet WCAG 2.2 contrast
          standards.
        </p>
        <div
          role="radiogroup"
          aria-label="Color theme selection"
          style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}
        >
          <Button
            variant={themeMode === 'light' ? 'primary' : 'secondary'}
            size="compact"
            themeMode={themeMode}
            onClick={() => setTheme('light')}
            id="set-theme-light"
          >
            <Icon name="sun" /> Warm Paper (Light)
          </Button>
          <Button
            variant={themeMode === 'dark' ? 'primary' : 'secondary'}
            size="compact"
            themeMode={themeMode}
            onClick={() => setTheme('dark')}
            id="set-theme-dark"
          >
            <Icon name="moon" /> Deep Ink (Dark)
          </Button>
        </div>
      </Card>

      <Card themeMode={themeMode}>
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Text Scaling &amp; Reflow
        </h2>
        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
          Adjust base font scaling up to 200% without disabling browser zoom.
        </p>
        <div
          role="group"
          aria-label="Text scale options"
          style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}
        >
          {[100, 125, 150, 175, 200].map((scale) => (
            <button
              key={scale}
              type="button"
              id={`scale-${scale}`}
              aria-pressed={textScale === scale}
              onClick={() => setTextScale(scale)}
              style={{
                padding: '6px 14px',
                borderRadius: `${radii.sm}px`,
                border: `1.5px solid ${
                  textScale === scale ? palette.action.primary : palette.border.subtle
                }`,
                backgroundColor: textScale === scale ? palette.surfaceRaised : palette.surface,
                color: textScale === scale ? palette.action.primary : palette.text.primary,
                fontWeight: textScale === scale ? 700 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                minHeight: `${touchTargets.webMin}px`,
                minWidth: `${touchTargets.webMin}px`,
              }}
            >
              {scale}%
            </button>
          ))}
        </div>
      </Card>

      <Card themeMode={themeMode}>
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Reading Direction
        </h2>
        <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
          <Button
            variant={direction === 'ltr' ? 'primary' : 'secondary'}
            size="compact"
            themeMode={themeMode}
            onClick={() => setDirection('ltr')}
            id="direction-ltr-btn"
          >
            Left-to-Right (LTR)
          </Button>
          <Button
            variant={direction === 'rtl' ? 'primary' : 'secondary'}
            size="compact"
            themeMode={themeMode}
            onClick={() => setDirection('rtl')}
            id="direction-rtl-btn"
          >
            Right-to-Left (RTL)
          </Button>
        </div>
      </Card>

      <Card themeMode={themeMode}>
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Language &amp; Bangla (বাংলা) Readability
        </h2>
        <div
          style={{ display: 'flex', gap: `${spacing.sm}px`, marginBottom: `${spacing.base}px`, flexWrap: 'wrap' }}
        >
          <Button
            variant={language === 'en' ? 'primary' : 'secondary'}
            size="compact"
            themeMode={themeMode}
            onClick={() => setLanguage('en')}
            id="lang-en-btn"
          >
            English
          </Button>
          <Button
            variant={language === 'bn' ? 'primary' : 'secondary'}
            size="compact"
            themeMode={themeMode}
            onClick={() => setLanguage('bn')}
            id="lang-bn-btn"
          >
            বাংলা (Bangla)
          </Button>
        </div>
        <div
          style={{
            padding: `${spacing.base}px`,
            borderRadius: `${radii.sm}px`,
            backgroundColor: palette.surfaceRaised,
            border: `1px solid ${palette.border.subtle}`,
            lineHeight: typography.lineHeight.bangla,
          }}
        >
          <div style={{ fontSize: '18px', fontWeight: 700, color: palette.text.primary }}>
            আজকের দিনটি গুছিয়ে নিন — দিনপঞ্জি, রুটিন এবং দৈনন্দিন কাজ
          </div>
        </div>
      </Card>

      <Card themeMode={themeMode}>
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Character Key Shortcuts (WCAG 2.1.4)
        </h2>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: palette.text.secondary }}>
          Single-character navigation keys can be disabled for speech-to-text or single-switch
          assistive technology.
        </p>
        <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
          <Button
            variant={shortcutsEnabled ? 'primary' : 'secondary'}
            size="compact"
            themeMode={themeMode}
            onClick={() => setShortcutsEnabled(true)}
            id="shortcuts-enable-btn"
          >
            Shortcuts Enabled
          </Button>
          <Button
            variant={!shortcutsEnabled ? 'primary' : 'secondary'}
            size="compact"
            themeMode={themeMode}
            onClick={() => setShortcutsEnabled(false)}
            id="shortcuts-disable-btn"
          >
            Shortcuts Disabled
          </Button>
        </div>
      </Card>
    </>
  );
}

export function AccountSettingsSection() {
  const { themeMode } = useShell();
  const { csrfToken } = useAuth();
  const prefs = useSettingsPreferences();
  const palette = colors[themeMode];
  const [isDeletionDialogOpen, setIsDeletionDialogOpen] = useState(false);

  return (
    <>
      <PrefFeedback prefs={prefs} />
      <Card themeMode={themeMode}>
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Personal Workspace &amp; Account
        </h2>
        {!prefs.isAuthenticated ? (
          <div>
            <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: palette.text.secondary }}>
              Sign in to activate your dedicated personal workspace and sync preferences.
            </p>
            <Button
              variant="primary"
              size="compact"
              themeMode={themeMode}
              onClick={() => prefs.openAuthModal()}
              id="settings-sign-in-btn"
            >
              Sign In to Access Workspace
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
            <div
              style={{
                padding: `${spacing.sm}px ${spacing.base}px`,
                borderRadius: `${radii.sm}px`,
                backgroundColor: palette.surfaceRaised,
                border: `1px solid ${palette.border.subtle}`,
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 700, color: palette.text.secondary }}>
                Signed in as
              </div>
              <div className="daynori-break" style={{ fontSize: '14px', fontWeight: 600 }}>
                {prefs.user?.email ?? prefs.user?.id}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: palette.text.secondary, marginTop: 8 }}>
                Active Personal Workspace
              </div>
              <div
                id="active-workspace-id"
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: prefs.workspaceId ? palette.status.success : palette.text.secondary,
                  fontFamily: 'monospace',
                }}
              >
                {prefs.workspaceId ? prefs.workspaceId : 'Workspace not provisioned'}
              </div>
              {!prefs.workspaceId ? (
                <Button
                  variant="secondary"
                  size="compact"
                  themeMode={themeMode}
                  onClick={() => void prefs.handleProvisionWorkspace()}
                  disabled={prefs.isProvisioning}
                  id="provision-workspace-btn"
                  style={{ marginTop: 8 }}
                >
                  {prefs.isProvisioning ? 'Provisioning...' : 'Provision Workspace'}
                </Button>
              ) : null}
            </div>
            <Button
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={() => void prefs.signOut()}
              id="settings-sign-out-btn"
            >
              Sign out
            </Button>
          </div>
        )}
      </Card>

      {prefs.isAuthenticated ? (
        <Card themeMode={themeMode} id="account-deletion">
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.status.danger,
            }}
          >
            Account Deletion &amp; Data Erasure
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
            Permanently delete your Daynori account and associated personal data. Requires password
            verification and explicit confirmation.
          </p>
          <Button
            variant="danger"
            size="compact"
            themeMode={themeMode}
            onClick={() => setIsDeletionDialogOpen(true)}
            id="open-account-deletion-btn"
          >
            <Icon name="trash" /> Delete Account
          </Button>
        </Card>
      ) : null}

      <AccountDeletionDialog
        isOpen={isDeletionDialogOpen}
        onClose={() => setIsDeletionDialogOpen(false)}
        themeMode={themeMode}
        userEmail={prefs.user?.email}
        onRequestDeletion={async (password) => {
          const client = createWebApiClient({ csrfToken });
          return await client.requestAccountDeletion({ password });
        }}
        onConfirmDeletion={async (confirmationToken) => {
          const client = createWebApiClient({ csrfToken });
          return await client.confirmAccountDeletion({ confirmationToken });
        }}
        onSuccess={async () => {
          await prefs.signOut();
          window.location.href = '/';
        }}
      />
    </>
  );
}

export function NotificationsSettingsSection() {
  const { themeMode } = useShell();
  const { csrfToken } = useAuth();
  const prefs = useSettingsPreferences();
  const palette = colors[themeMode];

  return (
    <>
      <PrefFeedback prefs={prefs} />
      {isCorePreview ? (
        <Feedback severity="info" message={corePreviewNotice} themeMode={themeMode} />
      ) : (
        <ReminderAgendaView
          workspaceId={prefs.workspaceId}
          isAuthenticated={prefs.isAuthenticated}
          userId={prefs.user?.id}
          apiClient={createWebApiClient({ csrfToken })}
          themeMode={themeMode}
        />
      )}

      <Card themeMode={themeMode}>
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Quiet hours
        </h2>
        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
          When enabled, reminder delivery defers into the quiet window end. Push delivery phases
          own platform notification channels.
        </p>
        {!prefs.isAuthenticated ? (
          <Button
            variant="primary"
            size="compact"
            themeMode={themeMode}
            onClick={() => prefs.openAuthModal()}
            id="quiet-hours-sign-in-btn"
          >
            Sign in to manage quiet hours
          </Button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
              <input
                type="checkbox"
                id="quiet-hours-enabled"
                checked={prefs.formQuietHours.enabled}
                onChange={(e) =>
                  prefs.setFormQuietHours({ ...prefs.formQuietHours, enabled: e.target.checked })
                }
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 14, fontWeight: 500 }}>Enable quiet hours</span>
            </label>
            <div
              className="daynori-responsive-grid"
              style={{ opacity: prefs.formQuietHours.enabled ? 1 : 0.55 }}
            >
              <div>
                <label htmlFor="quiet-hours-start" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Start (HH:MM)
                </label>
                <input
                  id="quiet-hours-start"
                  type="time"
                  disabled={!prefs.formQuietHours.enabled}
                  value={prefs.formQuietHours.start}
                  onChange={(e) =>
                    prefs.setFormQuietHours({ ...prefs.formQuietHours, start: e.target.value })
                  }
                  style={{
                    width: '100%',
                    minHeight: touchTargets.webMin,
                    padding: '8px 12px',
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.border.subtle}`,
                    backgroundColor: palette.surface,
                    color: palette.text.primary,
                  }}
                />
              </div>
              <div>
                <label htmlFor="quiet-hours-end" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  End (HH:MM)
                </label>
                <input
                  id="quiet-hours-end"
                  type="time"
                  disabled={!prefs.formQuietHours.enabled}
                  value={prefs.formQuietHours.end}
                  onChange={(e) =>
                    prefs.setFormQuietHours({ ...prefs.formQuietHours, end: e.target.value })
                  }
                  style={{
                    width: '100%',
                    minHeight: touchTargets.webMin,
                    padding: '8px 12px',
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.border.subtle}`,
                    backgroundColor: palette.surface,
                    color: palette.text.primary,
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                size="compact"
                themeMode={themeMode}
                disabled={prefs.isSaving}
                id="save-quiet-hours-btn"
                onClick={() =>
                  void prefs.handleSavePreferences({ quietHours: prefs.formQuietHours })
                }
              >
                {prefs.isSaving ? 'Saving…' : 'Save quiet hours'}
              </Button>
              <Button
                variant="secondary"
                size="compact"
                themeMode={themeMode}
                disabled={prefs.isSaving}
                onClick={() => void prefs.handleReload()}
              >
                Reload
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

export function WorkspaceSettingsSection() {
  const { themeMode } = useShell();
  const prefs = useSettingsPreferences();
  const { isOperator } = useFeatureNavigation();
  const palette = colors[themeMode];

  return (
    <>
      <PrefFeedback prefs={prefs} />
      <Card themeMode={themeMode}>
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Workspace defaults
        </h2>
        {!prefs.isAuthenticated ? (
          <Button
            variant="primary"
            size="compact"
            themeMode={themeMode}
            onClick={() => prefs.openAuthModal()}
            id="workspace-sign-in-btn"
          >
            Sign In to Access Workspace
          </Button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
            <div className="daynori-responsive-grid">
              <div>
                <label
                  htmlFor="time-zone-select"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
                >
                  IANA Time Zone
                </label>
                <select
                  id="time-zone-select"
                  value={prefs.formTimeZone}
                  onChange={(e) => prefs.setFormTimeZone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.border.subtle}`,
                    backgroundColor: palette.surface,
                    color: palette.text.primary,
                    minHeight: touchTargets.webMin,
                  }}
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="America/Chicago">America/Chicago</option>
                  <option value="America/Denver">America/Denver</option>
                  <option value="America/Los_Angeles">America/Los_Angeles</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Europe/Paris">Europe/Paris</option>
                  <option value="Asia/Dhaka">Asia/Dhaka</option>
                  <option value="Asia/Tokyo">Asia/Tokyo</option>
                  <option value="Australia/Sydney">Australia/Sydney</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="locale-select"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
                >
                  Preferred Locale
                </label>
                <select
                  id="locale-select"
                  value={prefs.formLocale}
                  onChange={(e) => prefs.setFormLocale(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.border.subtle}`,
                    backgroundColor: palette.surface,
                    color: palette.text.primary,
                    minHeight: touchTargets.webMin,
                  }}
                >
                  <option value="en">English</option>
                  <option value="en-US">English (United States)</option>
                  <option value="en-GB">English (United Kingdom)</option>
                  <option value="bn">বাংলা (Bangla)</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                  <option value="ja">日本語</option>
                </select>
              </div>
            </div>

            <div>
              <label
                style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
              >
                Week Starts On
              </label>
              <div role="radiogroup" aria-label="Week start day" style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                {(['monday', 'sunday', 'saturday'] as const).map((day) => {
                  const isSelected = prefs.formWeekStart === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      id={`weekstart-${day}-btn`}
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => prefs.setFormWeekStart(day)}
                      style={{
                        padding: '6px 16px',
                        borderRadius: radii.sm,
                        border: `1.5px solid ${isSelected ? palette.action.primary : palette.border.subtle}`,
                        backgroundColor: isSelected ? palette.surfaceRaised : palette.surface,
                        color: isSelected ? palette.action.primary : palette.text.primary,
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: 13,
                        cursor: 'pointer',
                        minHeight: touchTargets.webMin,
                        textTransform: 'capitalize',
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <input
                type="checkbox"
                id="compact-mode-toggle"
                checked={prefs.formCompactMode}
                onChange={(e) => prefs.setFormCompactMode(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                Enable Compact Mode (denser list items)
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <input
                type="checkbox"
                id="expenses-enabled-toggle"
                checked={prefs.formExpensesEnabled}
                onChange={(e) => prefs.setFormExpensesEnabled(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                Enable Expenses &amp; Budgets Module (opt-in)
              </span>
            </label>

            <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                size="compact"
                themeMode={themeMode}
                onClick={() => void prefs.handleSavePreferences()}
                disabled={prefs.isSaving}
                id="save-preferences-btn"
              >
                {prefs.isSaving ? 'Saving Preferences...' : 'Save Preferences'}
              </Button>
              <Button
                variant="secondary"
                size="compact"
                themeMode={themeMode}
                onClick={() => void prefs.handleReload()}
                disabled={prefs.isSaving}
                id="reload-preferences-btn"
              >
                Reload from Server
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card themeMode={themeMode} id="visible-features">
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Visible features
        </h2>
        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
          Pin, hide, and restore modules from All features. Hiding never deletes content or cancels
          reminders.
        </p>
        <Link href="/features" style={{ textDecoration: 'none' }}>
          <Button variant="primary" size="compact" themeMode={themeMode} id="open-all-features-btn">
            <Icon name="sliders" /> Open All features
          </Button>
        </Link>
      </Card>

      {prefs.isAuthenticated ? (
        <Card themeMode={themeMode} id="optional-modules-status">
          <h2
            style={{
              margin: `0 0 ${spacing.sm}px`,
              fontSize: typography.webScale.sectionHeading,
              color: palette.text.primary,
            }}
          >
            Optional modules
          </h2>
          <p className="daynori-break" style={{ margin: 0, color: palette.text.secondary, fontSize: 14 }}>
            Vault, Drive, rooms/chat, live AI, and billing stay behind separate release gates.
            {isOperator ? (
              <>
                {' '}
                Open{' '}
                <Link href="/developer" style={{ color: palette.action.primary }}>
                  Developer tools
                </Link>{' '}
                if you are an authorized operator.
              </>
            ) : (
              ' Provisional harnesses are not ordinary Settings.'
            )}
          </p>
        </Card>
      ) : null}
    </>
  );
}

export function PrivacySettingsSection() {
  const { themeMode, openModal } = useShell();
  const prefs = useSettingsPreferences();
  const palette = colors[themeMode];

  return (
    <>
      <PrefFeedback prefs={prefs} />
      <Card themeMode={themeMode}>
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Journal preview privacy
        </h2>
        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
          Suppress body snippets in Journal lists and search. The Journal page toggle stays in sync
          with the same preference.
        </p>
        {!prefs.isAuthenticated ? (
          <Button
            variant="primary"
            size="compact"
            themeMode={themeMode}
            onClick={() => prefs.openAuthModal()}
          >
            Sign in to manage privacy
          </Button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.base }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <input
                type="checkbox"
                id="suppress-snippets-toggle"
                checked={prefs.formSuppressSnippets}
                onChange={(e) => prefs.setFormSuppressSnippets(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 14, fontWeight: 500 }}>Hide reflection text snippets</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <input
                type="checkbox"
                id="journal-preview-hidden-toggle"
                checked={prefs.formJournalPreviewHidden}
                onChange={(e) => prefs.setFormJournalPreviewHidden(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 14, fontWeight: 500 }}>Hide journal previews in search</span>
            </label>
            <Button
              variant="primary"
              size="compact"
              themeMode={themeMode}
              disabled={prefs.isSaving}
              id="save-privacy-btn"
              onClick={() =>
                void prefs.handleSavePreferences({
                  suppressBodySnippets: prefs.formSuppressSnippets,
                  journalPreviewHidden: prefs.formJournalPreviewHidden,
                })
              }
            >
              {prefs.isSaving ? 'Saving…' : 'Save privacy preferences'}
            </Button>
          </div>
        )}
      </Card>

      <Card themeMode={themeMode} id="sync-recovery">
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Sync &amp; Offline Recovery
        </h2>
        <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            size="compact"
            themeMode={themeMode}
            onClick={() => openModal('sync-diagnostics')}
            id="open-sync-diagnostics-btn"
          >
            <Icon name="refresh" /> View Sync Diagnostics
          </Button>
          <Button
            variant="secondary"
            size="compact"
            themeMode={themeMode}
            onClick={() => openModal('recovery-export')}
            id="open-recovery-export-btn"
          >
            <Icon name="save" /> Export Recovery Drafts
          </Button>
        </div>
      </Card>

      <Card themeMode={themeMode} id="workspace-portability">
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Workspace Portability
        </h2>
        <Button
          variant="primary"
          size="compact"
          themeMode={themeMode}
          onClick={() => openModal('workspace-portability')}
          id="open-workspace-portability-btn"
        >
          <Icon name="archive" /> Export / Import Workspace
        </Button>
      </Card>

      <Card themeMode={themeMode}>
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Vault
        </h2>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: palette.text.secondary }}>
          Production vault unlock remains gated. Account password recovery cannot open vault
          ciphertext.
        </p>
        <Link href="/vault" style={{ textDecoration: 'none' }}>
          <Button variant="secondary" size="compact" themeMode={themeMode}>
            Vault status
          </Button>
        </Link>
      </Card>

      <Card themeMode={themeMode}>
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Storage &amp; Security Notice
        </h2>
        <Feedback
          severity="info"
          message="Daynori is offline-first. Private reflections, tasks, and notes reside locally with authorized sync."
          themeMode={themeMode}
        />
      </Card>
    </>
  );
}

export function HelpSettingsSection() {
  const { themeMode, openModal } = useShell();
  const palette = colors[themeMode];

  return (
    <>
      <Card themeMode={themeMode} id="onboarding">
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Beginner guide
        </h2>
        <p className="daynori-break" style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
          Replay the short tour of Today, Plan, Library, and Journal. Replay does not reset
          preferences or create duplicate samples.
        </p>
        <Button
          variant="secondary"
          size="compact"
          themeMode={themeMode}
          onClick={() => openModal('onboarding-replay')}
          id="replay-onboarding-btn"
        >
          <Icon name="sparkle" /> Replay beginner guide
        </Button>
      </Card>

      <Card themeMode={themeMode}>
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Help and support
        </h2>
        <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Link href="/help" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="compact" themeMode={themeMode} id="settings-open-help">
              <Icon name="help" /> Open Help
            </Button>
          </Link>
          <Link href="/support" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" size="compact" themeMode={themeMode} id="settings-open-support">
              Feedback and contact
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="compact"
            themeMode={themeMode}
            onClick={() => openModal('help')}
            id="settings-shortcuts-btn"
          >
            Keyboard shortcuts
          </Button>
        </div>
      </Card>
    </>
  );
}
