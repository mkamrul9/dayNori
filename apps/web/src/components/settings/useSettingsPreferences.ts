'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedbackSeverity } from '@daynori/ui-web';
import { useAuth, type QuietHoursState } from '../AuthContext';

/**
 * Preference form state scoped to the authenticated user who loaded it.
 * Late responses or retained forms must not apply after an account/workspace switch.
 */
export function useSettingsPreferences() {
  const {
    isAuthenticated,
    user,
    workspaceId,
    preferences,
    loadPreferences,
    savePreferences,
    provisionPersonalWorkspace,
    openAuthModal,
    signOut,
  } = useAuth();

  const boundUserIdRef = useRef<string | null>(null);
  const [formTimeZone, setFormTimeZone] = useState('UTC');
  const [formLocale, setFormLocale] = useState('en');
  const [formWeekStart, setFormWeekStart] = useState<'monday' | 'sunday' | 'saturday'>('monday');
  const [formCompactMode, setFormCompactMode] = useState(false);
  const [formExpensesEnabled, setFormExpensesEnabled] = useState(false);
  const [formJournalPreviewHidden, setFormJournalPreviewHidden] = useState(true);
  const [formSuppressSnippets, setFormSuppressSnippets] = useState(true);
  const [formQuietHours, setFormQuietHours] = useState<QuietHoursState>({
    enabled: false,
    start: '22:00',
    end: '08:00',
    timezone: 'UTC',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [feedback, setFeedback] = useState<{
    severity: FeedbackSeverity;
    message: string;
  } | null>(null);

  const isBoundToCurrentUser = useCallback(() => {
    return Boolean(user?.id) && boundUserIdRef.current === user?.id;
  }, [user?.id]);

  const syncFormFromPreferences = useCallback(() => {
    if (!preferences || !user?.id) return;
    boundUserIdRef.current = user.id;
    setFormTimeZone(preferences.timeZone);
    setFormLocale(preferences.preferredLocale);
    setFormWeekStart(preferences.weekStart);
    setFormCompactMode(preferences.compactMode);
    setFormExpensesEnabled(Boolean(preferences.expensesEnabled));
    setFormJournalPreviewHidden(preferences.journalPreviewHidden ?? true);
    setFormSuppressSnippets(preferences.suppressBodySnippets ?? true);
    setFormQuietHours(
      preferences.quietHours ?? {
        enabled: false,
        start: '22:00',
        end: '08:00',
        timezone: preferences.timeZone || 'UTC',
      }
    );
  }, [preferences, user?.id]);

  useEffect(() => {
    syncFormFromPreferences();
  }, [syncFormFromPreferences]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      boundUserIdRef.current = null;
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    void loadPreferences().then((loaded) => {
      if (cancelled) return;
      setIsLoading(false);
      if (!loaded) {
        setLoadError('Could not load preferences. Check your connection and retry.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id, loadPreferences]);

  // Clear retained form when account changes
  useEffect(() => {
    if (!user?.id) {
      boundUserIdRef.current = null;
      setFeedback(null);
      return;
    }
    if (boundUserIdRef.current && boundUserIdRef.current !== user.id) {
      boundUserIdRef.current = null;
      setFeedback(null);
    }
  }, [user?.id]);

  const handleSavePreferences = useCallback(
    async (patch?: {
      timeZone?: string;
      preferredLocale?: string;
      weekStart?: 'monday' | 'sunday' | 'saturday';
      compactMode?: boolean;
      expensesEnabled?: boolean;
      journalPreviewHidden?: boolean;
      suppressBodySnippets?: boolean;
      quietHours?: QuietHoursState;
    }) => {
      if (!isBoundToCurrentUser()) {
        setFeedback({
          severity: 'warning',
          message: 'Account changed. Reload preferences before saving.',
        });
        return;
      }
      setIsSaving(true);
      setFeedback(null);

      const res = await savePreferences({
        timeZone: patch?.timeZone ?? formTimeZone,
        preferredLocale: patch?.preferredLocale ?? formLocale,
        weekStart: patch?.weekStart ?? formWeekStart,
        compactMode: patch?.compactMode ?? formCompactMode,
        expensesEnabled: patch?.expensesEnabled ?? formExpensesEnabled,
        journalPreviewHidden: patch?.journalPreviewHidden ?? formJournalPreviewHidden,
        suppressBodySnippets: patch?.suppressBodySnippets ?? formSuppressSnippets,
        quietHours: patch?.quietHours ?? formQuietHours,
      });

      if (!isBoundToCurrentUser()) {
        setIsSaving(false);
        return;
      }

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
    },
    [
      isBoundToCurrentUser,
      formTimeZone,
      formLocale,
      formWeekStart,
      formCompactMode,
      formExpensesEnabled,
      formJournalPreviewHidden,
      formSuppressSnippets,
      formQuietHours,
      savePreferences,
    ]
  );

  const handleReload = useCallback(async () => {
    setLoadError(null);
    setIsLoading(true);
    const loaded = await loadPreferences();
    setIsLoading(false);
    if (!loaded) {
      setLoadError('Could not reload preferences. Try again.');
    } else {
      setFeedback(null);
    }
  }, [loadPreferences]);

  const handleProvisionWorkspace = useCallback(async () => {
    if (!isBoundToCurrentUser() && user?.id) {
      boundUserIdRef.current = user.id;
    }
    setIsProvisioning(true);
    setFeedback(null);
    const wsId = await provisionPersonalWorkspace();
    setIsProvisioning(false);
    if (!user?.id || boundUserIdRef.current !== user.id) return;
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
  }, [isBoundToCurrentUser, provisionPersonalWorkspace, user?.id]);

  return {
    isAuthenticated,
    user,
    workspaceId,
    preferences,
    openAuthModal,
    signOut,
    formTimeZone,
    setFormTimeZone,
    formLocale,
    setFormLocale,
    formWeekStart,
    setFormWeekStart,
    formCompactMode,
    setFormCompactMode,
    formExpensesEnabled,
    setFormExpensesEnabled,
    formJournalPreviewHidden,
    setFormJournalPreviewHidden,
    formSuppressSnippets,
    setFormSuppressSnippets,
    formQuietHours,
    setFormQuietHours,
    isSaving,
    isLoading,
    loadError,
    isProvisioning,
    feedback,
    setFeedback,
    handleSavePreferences,
    handleReload,
    handleProvisionWorkspace,
    isBoundToCurrentUser,
  };
}
