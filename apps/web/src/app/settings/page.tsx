'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import {
  Button,
  Card,
  Feedback,
  AccountDeletionDialog,
  type FeedbackSeverity,
} from '@daynori/ui-web';
import { useShell } from '../../components/ShellContext';
import { useAuth } from '../../components/AuthContext';
import { ReminderAgendaView } from '../../components/ReminderAgendaView';
import { DriveConnectionsPanel } from '../../components/DriveConnectionsPanel';
import { RoomsPanel } from '../../components/RoomsPanel';
import { AiConsentHarness } from '../../components/AiConsentHarness';
import { AssistantPanel } from '../../components/AssistantPanel';
import { createWebApiClient } from '../../data/webApiClient';

export default function SettingsPage() {
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
    openModal,
  } = useShell();

  const {
    isAuthenticated,
    user,
    workspaceId,
    csrfToken,
    preferences,
    loadPreferences,
    savePreferences,
    provisionPersonalWorkspace,
    openAuthModal,
    signOut,
  } = useAuth();

  const [isDeletionDialogOpen, setIsDeletionDialogOpen] = useState<boolean>(false);
  const [formTimeZone, setFormTimeZone] = useState<string>('UTC');
  const [formLocale, setFormLocale] = useState<string>('en');
  const [formWeekStart, setFormWeekStart] = useState<'monday' | 'sunday' | 'saturday'>('monday');
  const [formCompactMode, setFormCompactMode] = useState<boolean>(false);
  const [formExpensesEnabled, setFormExpensesEnabled] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isProvisioning, setIsProvisioning] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    severity: FeedbackSeverity;
    message: string;
  } | null>(null);

  // Sync form with loaded preferences
  useEffect(() => {
    if (preferences) {
      setFormTimeZone(preferences.timeZone);
      setFormLocale(preferences.preferredLocale);
      setFormWeekStart(preferences.weekStart);
      setFormCompactMode(preferences.compactMode);
      setFormExpensesEnabled(Boolean(preferences.expensesEnabled));
    }
  }, [preferences]);

  // Initial load of preferences if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadPreferences();
    }
  }, [isAuthenticated, loadPreferences]);

  const handleSavePreferences = useCallback(async () => {
    setIsSaving(true);
    setFeedback(null);

    const res = await savePreferences({
      timeZone: formTimeZone,
      preferredLocale: formLocale,
      weekStart: formWeekStart,
      compactMode: formCompactMode,
      expensesEnabled: formExpensesEnabled,
    });

    setIsSaving(false);
    if (res.conflict) {
      setFeedback({
        severity: 'warning',
        message:
          'Revision conflict: Preferences were modified in another session. Your unsaved edits are preserved above. Click Save again to overwrite, or reload to fetch latest.',
      });
    } else if (!res.success) {
      setFeedback({
        severity: 'danger',
        message: res.error || 'Failed to save preferences. Please check values.',
      });
    } else {
      setFeedback({
        severity: 'success',
        message: `Preferences saved successfully (Revision ${res.updated?.revision ?? 1}).`,
      });
    }
  }, [formTimeZone, formLocale, formWeekStart, formCompactMode, formExpensesEnabled, savePreferences]);

  const handleProvisionWorkspace = useCallback(async () => {
    setIsProvisioning(true);
    setFeedback(null);
    const wsId = await provisionPersonalWorkspace();
    setIsProvisioning(false);
    if (wsId) {
      setFeedback({
        severity: 'success',
        message: `Personal workspace provisioned successfully (ID: ${wsId}).`,
      });
    } else {
      setFeedback({
        severity: 'danger',
        message: 'Workspace provisioning failed. Please try again.',
      });
    }
  }, [provisionPersonalWorkspace]);

  const palette = colors[themeMode];

  return (
    <div
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        padding: `${spacing.lg}px ${spacing.base}px`,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ marginBottom: `${spacing.base}px` }}>
        <h1
          style={{
            margin: 0,
            fontSize: `${typography.webScale.welcomeTitle}px`,
            fontWeight: 800,
            color: palette.text.primary,
          }}
        >
          Settings
        </h1>
        <p style={{ margin: '4px 0 0 0', color: palette.text.secondary }}>
          Personalize appearance, accessibility preferences, typography, and workspace defaults.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
        {/* 1. Theme Mode */}
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
            style={{ display: 'flex', gap: `${spacing.sm}px` }}
          >
            <Button
              variant={themeMode === 'light' ? 'primary' : 'secondary'}
              size="compact"
              themeMode={themeMode}
              onClick={() => setTheme('light')}
              id="set-theme-light"
            >
              ☀️ Warm Paper (Light)
            </Button>
            <Button
              variant={themeMode === 'dark' ? 'primary' : 'secondary'}
              size="compact"
              themeMode={themeMode}
              onClick={() => setTheme('dark')}
              id="set-theme-dark"
            >
              🌙 Deep Ink (Dark)
            </Button>
          </div>
        </Card>

        {/* 2. Text Scaling & Reflow (WCAG 2.2 200% Zoom) */}
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Text Scaling & Reflow
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
            Adjust base font scaling to test reflow at up to 200% text size without horizontal
            clipping.
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

        {/* 3. Reading Direction (RTL / LTR) */}
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Reading Direction (RTL Readiness)
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
            Verify that navigation, drawers, list rows, and layout components mirror properly in
            Right-to-Left mode.
          </p>

          <div style={{ display: 'flex', gap: `${spacing.sm}px` }}>
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

        {/* 4. Language & Bangla Typography Readability */}
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Language & Bangla (বাংলা) Readability
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
            Daynori supports extended line-height (1.6) and conjunct rendering for clear Bangla
            script readability.
          </p>

          <div
            style={{ display: 'flex', gap: `${spacing.sm}px`, marginBottom: `${spacing.base}px` }}
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

          {/* Bangla Typography Verification Card */}
          <div
            style={{
              padding: `${spacing.base}px`,
              borderRadius: `${radii.sm}px`,
              backgroundColor: palette.surfaceRaised,
              border: `1px solid ${palette.border.subtle}`,
              lineHeight: typography.lineHeight.bangla,
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: palette.text.secondary,
                marginBottom: '6px',
              }}
            >
              Bangla Script Rendering Verification:
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: palette.text.primary,
                marginBottom: '4px',
              }}
            >
              আজকের দিনটি গুছিয়ে নিন — দিনপঞ্জি, রুটিন এবং দৈনন্দিন কাজ
            </div>
            <div style={{ fontSize: '14px', color: palette.text.secondary }}>
              যুক্তাক্ষর, স্বরচিহ্ন এবং মাত্রা সঠিকভাবে প্রদর্শিত হচ্ছে। লাইন-হাইট ১.৬ অক্ষরের
              ওভারল্যাপ প্রতিরোধ করে।
            </div>
          </div>
        </Card>

        {/* 5. Character Key Shortcuts (WCAG 2.1.4 Compliance) */}
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
            Global single-character navigation keys (such as &apos;t&apos; for Today, &apos;p&apos;
            for Plan, &apos;l&apos; for Library, &apos;j&apos; for Journal, and &apos;/&apos; for
            Search) can be disabled to prevent accidental activation by speech-to-text or
            single-switch assistive technology.
          </p>
          <div style={{ display: 'flex', gap: `${spacing.sm}px`, alignItems: 'center' }}>
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

        {/* Personal Workspace & Account Preferences (Phase 10) */}
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Personal Workspace & Preferences
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
            Manage your personal private workspace and synced profile preferences (time zone,
            locale, week start, and compact display).
          </p>

          {feedback && (
            <div style={{ marginBottom: `${spacing.base}px` }}>
              <Feedback
                severity={feedback.severity}
                message={feedback.message}
                themeMode={themeMode}
              />
            </div>
          )}

          {!isAuthenticated ? (
            <div>
              <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: palette.text.secondary }}>
                Sign in to activate your dedicated personal workspace and sync preferences across
                your devices.
              </p>
              <Button
                variant="primary"
                size="compact"
                themeMode={themeMode}
                onClick={() => openAuthModal()}
                id="settings-sign-in-btn"
              >
                Sign In to Access Workspace
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
              {/* Workspace Status */}
              <div
                style={{
                  padding: `${spacing.sm}px ${spacing.base}px`,
                  borderRadius: `${radii.sm}px`,
                  backgroundColor: palette.surfaceRaised,
                  border: `1px solid ${palette.border.subtle}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: `${spacing.xs}px`,
                }}
              >
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: palette.text.secondary }}>
                    Active Personal Workspace
                  </div>
                  <div
                    id="active-workspace-id"
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: workspaceId ? palette.status.success : palette.text.secondary,
                      fontFamily: 'monospace',
                    }}
                  >
                    {workspaceId ? workspaceId : 'Workspace not provisioned'}
                  </div>
                </div>
                {!workspaceId && (
                  <Button
                    variant="secondary"
                    size="compact"
                    themeMode={themeMode}
                    onClick={handleProvisionWorkspace}
                    disabled={isProvisioning}
                    id="provision-workspace-btn"
                  >
                    {isProvisioning ? 'Provisioning...' : 'Provision Workspace'}
                  </Button>
                )}
              </div>

              {/* Form Controls */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: `${spacing.base}px`,
                }}
              >
                {/* Time Zone */}
                <div>
                  <label
                    htmlFor="time-zone-select"
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: palette.text.primary,
                      marginBottom: '6px',
                    }}
                  >
                    IANA Time Zone
                  </label>
                  <select
                    id="time-zone-select"
                    value={formTimeZone}
                    onChange={(e) => setFormTimeZone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: `${radii.sm}px`,
                      border: `1px solid ${palette.border.subtle}`,
                      backgroundColor: palette.surface,
                      color: palette.text.primary,
                      fontSize: '14px',
                      minHeight: `${touchTargets.webMin}px`,
                    }}
                  >
                    <option value="UTC">UTC (Coordinated Universal Time)</option>
                    <option value="America/New_York">America/New_York (Eastern)</option>
                    <option value="America/Chicago">America/Chicago (Central)</option>
                    <option value="America/Denver">America/Denver (Mountain)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (Pacific)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Europe/Paris">Europe/Paris (CET)</option>
                    <option value="Asia/Dhaka">Asia/Dhaka (BST)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                    <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                  </select>
                </div>

                {/* Preferred Locale */}
                <div>
                  <label
                    htmlFor="locale-select"
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: palette.text.primary,
                      marginBottom: '6px',
                    }}
                  >
                    Preferred Locale
                  </label>
                  <select
                    id="locale-select"
                    value={formLocale}
                    onChange={(e) => setFormLocale(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: `${radii.sm}px`,
                      border: `1px solid ${palette.border.subtle}`,
                      backgroundColor: palette.surface,
                      color: palette.text.primary,
                      fontSize: '14px',
                      minHeight: `${touchTargets.webMin}px`,
                    }}
                  >
                    <option value="en">English (Default)</option>
                    <option value="en-US">English (United States)</option>
                    <option value="en-GB">English (United Kingdom)</option>
                    <option value="bn">বাংলা (Bangla)</option>
                    <option value="es">Español (Spanish)</option>
                    <option value="fr">Français (French)</option>
                    <option value="de">Deutsch (German)</option>
                    <option value="ja">日本語 (Japanese)</option>
                  </select>
                </div>
              </div>

              {/* Week Start */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: palette.text.primary,
                    marginBottom: '6px',
                  }}
                >
                  Week Starts On
                </label>
                <div
                  role="radiogroup"
                  aria-label="Week start day"
                  style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}
                >
                  {(['monday', 'sunday', 'saturday'] as const).map((day) => {
                    const isSelected = formWeekStart === day;
                    return (
                      <button
                        key={day}
                        type="button"
                        id={`weekstart-${day}-btn`}
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setFormWeekStart(day)}
                        style={{
                          padding: '6px 16px',
                          borderRadius: `${radii.sm}px`,
                          border: `1.5px solid ${isSelected ? palette.action.primary : palette.border.subtle}`,
                          backgroundColor: isSelected ? palette.surfaceRaised : palette.surface,
                          color: isSelected ? palette.action.primary : palette.text.primary,
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: '13px',
                          cursor: 'pointer',
                          minHeight: `${touchTargets.webMin}px`,
                          textTransform: 'capitalize',
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Display: Compact Mode */}
              <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
                <input
                  type="checkbox"
                  id="compact-mode-toggle"
                  checked={formCompactMode}
                  onChange={(e) => setFormCompactMode(e.target.checked)}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                  }}
                />
                <label
                  htmlFor="compact-mode-toggle"
                  style={{
                    fontSize: '14px',
                    color: palette.text.primary,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Enable Compact Mode (denser list items and reduced padding)
                </label>
              </div>

              {/* Module Opt-In: Expenses & Budgets */}
              <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
                <input
                  type="checkbox"
                  id="expenses-enabled-toggle"
                  checked={formExpensesEnabled}
                  onChange={(e) => setFormExpensesEnabled(e.target.checked)}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                  }}
                />
                <label
                  htmlFor="expenses-enabled-toggle"
                  style={{
                    fontSize: '14px',
                    color: palette.text.primary,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Enable Expenses & Budgets Module (opt-in personal finance tracking)
                </label>
              </div>

              {/* Actions */}
              <div
                style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: `${spacing.xs}px` }}
              >
                <Button
                  variant="primary"
                  size="compact"
                  themeMode={themeMode}
                  onClick={handleSavePreferences}
                  disabled={isSaving}
                  id="save-preferences-btn"
                >
                  {isSaving ? 'Saving Preferences...' : 'Save Preferences'}
                </Button>
                <Button
                  variant="secondary"
                  size="compact"
                  themeMode={themeMode}
                  onClick={loadPreferences}
                  disabled={isSaving}
                  id="reload-preferences-btn"
                >
                  Reload from Server
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* 6. First-Use Tutorial & Progressive Discovery (Phase 31) */}
        <Card themeMode={themeMode} id="onboarding">
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Tutorial & Getting Started
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
            Review the 3-step walkthrough introducing quick capture, task planning vs daily
            routines, and folder organization. Replaying never duplicates starter items or removes
            existing data.
          </p>

          <Button
            variant="secondary"
            size="compact"
            themeMode={themeMode}
            onClick={() => openModal('onboarding-replay')}
            id="replay-onboarding-btn"
          >
            ✨ Replay Onboarding Tutorial
          </Button>
        </Card>

        {/* 7. Browser Reminders & Web Push (Phase 29) */}
        <ReminderAgendaView
          workspaceId={workspaceId}
          isAuthenticated={isAuthenticated}
          userId={user?.id}
          apiClient={createWebApiClient({ csrfToken })}
          themeMode={themeMode}
        />

        {/* 7b. Google Drive selected-file connector (Phase 49 provisional) */}
        {isAuthenticated && workspaceId ? (
          <Card themeMode={themeMode} id="drive-connections">
            <DriveConnectionsPanel
              workspaceId={workspaceId}
              csrfToken={csrfToken}
              themeMode={themeMode}
            />
          </Card>
        ) : null}

        {/* 7c. Shared rooms (Phase 51 provisional local) */}
        {isAuthenticated ? (
          <Card themeMode={themeMode} id="shared-rooms">
            <RoomsPanel
              csrfToken={csrfToken}
              themeMode={themeMode}
              personalWorkspaceId={workspaceId}
            />
          </Card>
        ) : null}

        {/* 7d. AI consent harness (Phase 55 provisional local) */}
        {isAuthenticated ? (
          <Card themeMode={themeMode} id="ai-consent">
            <AiConsentHarness
              csrfToken={csrfToken}
              themeMode={themeMode}
              personalWorkspaceId={workspaceId}
            />
          </Card>
        ) : null}

        {/* 7e. Assistant + reviewable proposals (Phase 56 provisional local) */}
        {isAuthenticated ? (
          <Card themeMode={themeMode} id="ai-assistant">
            <AssistantPanel
              csrfToken={csrfToken}
              themeMode={themeMode}
              personalWorkspaceId={workspaceId}
            />
          </Card>
        ) : null}

        {/* 8. Sync & Offline Recovery (Phase 34) */}
        <Card themeMode={themeMode} id="sync-recovery">
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Sync & Offline Recovery
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
            Inspect sync queue health, active conflicts, and export uncommitted drafts or offline
            recovery data without exposing sensitive credentials or vault plaintexts.
          </p>

          <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={() => openModal('sync-diagnostics')}
              id="open-sync-diagnostics-btn"
            >
              🔄 View Sync Diagnostics
            </Button>
            <Button
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={() => openModal('recovery-export')}
              id="open-recovery-export-btn"
            >
              💾 Export Recovery Drafts
            </Button>
          </div>
        </Card>

        {/* 9. Workspace Portability (Export & Import) (Phase 35) */}
        <Card themeMode={themeMode} id="workspace-portability">
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Workspace Portability (Export & Import)
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
            Export your entire workspace into documented open formats (JSON, Markdown, CSV, and
            attachments) with cryptographic verification, or safely import an archive with duplicate
            resolution.
          </p>

          <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              size="compact"
              themeMode={themeMode}
              onClick={() => openModal('workspace-portability')}
              id="open-workspace-portability-btn"
            >
              📦 Export / Import Workspace
            </Button>
          </div>
        </Card>

        {/* Vault — production disabled; development harness only */}
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
            Production vault unlock is disabled until Phase 44/45 gates and independent review pass.
            Account password recovery cannot open vault ciphertext.
          </p>
          <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
            <Link href="/vault" style={{ textDecoration: 'none' }}>
              <Button variant="secondary" size="compact" themeMode={themeMode}>
                Vault status
              </Button>
            </Link>
            {process.env.NODE_ENV === 'development' ? (
              <Link href="/dev/vault-harness" style={{ textDecoration: 'none' }}>
                <Button
                  variant="subtle"
                  size="compact"
                  themeMode={themeMode}
                  id="open-web-vault-harness-btn"
                >
                  Open synthetic vault harness
                </Button>
              </Link>
            ) : null}
          </div>
        </Card>

        {/* 10. Storage & Privacy Architecture */}
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
            }}
          >
            Storage & Security Notice
          </h2>
          <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: palette.text.secondary }}>
            Daynori is designed offline-first. Your private reflections, tasks, and notes reside
            locally.
          </p>
          <Feedback
            severity="info"
            message="No credentials or remote sync are required for Phase 05 navigation shell. Persistent product storage will be delivered in later dedicated phases (Phase 10+), and encrypted vault records in Phase 44."
            themeMode={themeMode}
          />
        </Card>

        {/* 11. Account Deletion & Data Erasure (Phase 36) */}
        {isAuthenticated && (
          <Card themeMode={themeMode} id="account-deletion">
            <h2
              style={{
                margin: '0 0 4px 0',
                fontSize: `${typography.webScale.sectionHeading}px`,
                color: palette.status.danger,
              }}
            >
              Account Deletion & Data Erasure
            </h2>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: palette.text.secondary }}>
              Permanently delete your Daynori account and all associated personal data across notes,
              tasks, routines, journal entries, and private files. Requires password verification
              and explicit confirmation.
            </p>

            <div style={{ display: 'flex', gap: `${spacing.sm}px`, flexWrap: 'wrap' }}>
              <Button
                variant="danger"
                size="compact"
                themeMode={themeMode}
                onClick={() => setIsDeletionDialogOpen(true)}
                id="open-account-deletion-btn"
              >
                🗑️ Delete Account
              </Button>
            </div>
          </Card>
        )}

        <AccountDeletionDialog
          isOpen={isDeletionDialogOpen}
          onClose={() => setIsDeletionDialogOpen(false)}
          themeMode={themeMode}
          userEmail={user?.email}
          onRequestDeletion={async (password) => {
            const client = createWebApiClient({ csrfToken });
            return await client.requestAccountDeletion({ password });
          }}
          onConfirmDeletion={async (confirmationToken) => {
            const client = createWebApiClient({ csrfToken });
            return await client.confirmAccountDeletion({ confirmationToken });
          }}
          onSuccess={async () => {
            await signOut();
            window.location.href = '/';
          }}
        />
      </div>
    </div>
  );
}
