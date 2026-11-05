'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  evaluateFeatureEligibility,
  getDefaultFeaturePersonalization,
  listPinnedFeatures,
  listPrimaryShellTabs,
  sanitizeAndMigrateFeaturePersonalization,
  searchFeatureDirectory,
  type FeatureAuthContext,
  type FeaturePersonalization,
  type FeatureReleaseContext,
} from '@daynori/domain';
import { isCorePreview } from '../config/preview';
import { useAuth } from '../components/AuthContext';

function buildReleaseContext(): FeatureReleaseContext {
  return {
    platform: 'web',
    corePreview: isCorePreview,
    production: process.env.NODE_ENV === 'production',
    moduleReleased: {
      // Gated modules stay closed unless a later phase flips true with real gates.
      vault: false,
      drive: false,
      rooms: false,
      billing: false,
      assistant: false,
    },
    capabilityKnown: true,
  };
}

export function useFeatureNavigation() {
  const {
    isAuthenticated,
    workspaceId,
    preferences,
    savePreferences,
    loadPreferences,
    csrfToken,
    user,
  } = useAuth();
  const scopeKey = `${user?.id}:${workspaceId}`;
  const liveScope = useRef(scopeKey);
  liveScope.current = scopeKey;
  const [isOperator, setIsOperator] = useState(false);
  const [operatorKnown, setOperatorKnown] = useState(false);
  const [localPersonalization, setLocalPersonalization] = useState<FeaturePersonalization>(() =>
    getDefaultFeaturePersonalization()
  );
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>(
    'idle'
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const migrated = sanitizeAndMigrateFeaturePersonalization(
      preferences?.featurePersonalization ?? null,
      null
    );
    setLocalPersonalization(migrated);
  }, [preferences?.featurePersonalization, preferences?.revision]);

  useEffect(() => {
    let cancelled = false;
    async function probe() {
      if (!isAuthenticated || !csrfToken) {
        if (!cancelled) {
          setIsOperator(false);
          setOperatorKnown(true);
        }
        return;
      }
      try {
        const res = await fetch('/api/v1/operator/session', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!cancelled) {
          setIsOperator(res.ok);
          setOperatorKnown(true);
        }
      } catch {
        if (!cancelled) {
          setIsOperator(false);
          setOperatorKnown(true);
        }
      }
    }
    void probe();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, csrfToken, user?.id]);

  const release = useMemo(() => buildReleaseContext(), []);
  const auth: FeatureAuthContext = useMemo(
    () => ({
      authenticated: isAuthenticated,
      hasWorkspaceMembership: Boolean(workspaceId),
      isPlatformOperator: isOperator,
      privilegeKnown: operatorKnown,
    }),
    [isAuthenticated, workspaceId, isOperator, operatorKnown]
  );

  const primaryTabs = useMemo(
    () => listPrimaryShellTabs(release, auth, localPersonalization),
    [release, auth, localPersonalization]
  );
  const pins = useMemo(
    () => listPinnedFeatures(release, auth, localPersonalization),
    [release, auth, localPersonalization]
  );

  const persistPersonalization = useCallback(
    async (transform: (current: FeaturePersonalization) => FeaturePersonalization) => {
      if (!isAuthenticated) {
        setLocalPersonalization(transform(localPersonalization));
        setSaveStatus('saved');
        setSaveMessage('Saved on this device. Sign in to sync across devices.');
        return { success: true as const };
      }
      setSaveStatus('saving');
      setSaveMessage(null);
      for (let attempt = 0; attempt < 3; attempt++) {
        const latest = await loadPreferences();
        if (liveScope.current !== scopeKey)
          return { success: false as const, error: 'Account changed' };
        if (!latest) break;
        const next = transform(
          sanitizeAndMigrateFeaturePersonalization(latest.featurePersonalization)
        );
        const res = await savePreferences({ featurePersonalization: next }, latest.revision);
        if (liveScope.current !== scopeKey)
          return { success: false as const, error: 'Account changed' };
        if (res.conflict) continue;
        if (!res.success) {
          setSaveStatus('error');
          setSaveMessage(res.error || 'Could not save personalization.');
          return res;
        }
        setLocalPersonalization(next);
        setSaveStatus('saved');
        setSaveMessage('Personalization saved.');
        return res;
      }
      setSaveStatus('conflict');
      setSaveMessage('Preferences changed or are unavailable. Reconnect and retry your choice.');
      return { success: false as const, conflict: true as const };
    },
    [isAuthenticated, savePreferences, loadPreferences, localPersonalization, scopeKey]
  );

  const hideFeature = useCallback(
    async (featureId: string) => {
      const elig = evaluateFeatureEligibility(featureId, release, auth, localPersonalization);
      if (!elig.canHide) return { success: false as const, error: 'Cannot hide this feature' };
      return persistPersonalization((current) =>
        sanitizeAndMigrateFeaturePersonalization({
          ...current,
          hiddenFeatureIds: [...new Set([...current.hiddenFeatureIds, featureId])],
        })
      );
    },
    [release, auth, localPersonalization, persistPersonalization]
  );

  const restoreFeature = useCallback(
    async (featureId: string) => {
      return persistPersonalization((current) =>
        sanitizeAndMigrateFeaturePersonalization({
          ...current,
          hiddenFeatureIds: current.hiddenFeatureIds.filter((id) => id !== featureId),
        })
      );
    },
    [localPersonalization, persistPersonalization]
  );

  const pinFeature = useCallback(
    async (featureId: string) => {
      const elig = evaluateFeatureEligibility(featureId, release, auth, localPersonalization);
      if (!elig.canPin) return { success: false as const, error: 'Cannot pin this feature' };
      return persistPersonalization((current) =>
        sanitizeAndMigrateFeaturePersonalization({
          ...current,
          pinnedFeatureIds: [
            ...current.pinnedFeatureIds.filter((id) => id !== featureId),
            featureId,
          ],
        })
      );
    },
    [release, auth, localPersonalization, persistPersonalization]
  );

  const unpinFeature = useCallback(
    async (featureId: string) => {
      return persistPersonalization((current) =>
        sanitizeAndMigrateFeaturePersonalization({
          ...current,
          pinnedFeatureIds: current.pinnedFeatureIds.filter((id) => id !== featureId),
        })
      );
    },
    [localPersonalization, persistPersonalization]
  );

  const searchDirectory = useCallback(
    (query: string) =>
      searchFeatureDirectory(query, release, auth, localPersonalization, {
        includeHiddenForRestore: true,
      }),
    [release, auth, localPersonalization]
  );

  return {
    release,
    auth,
    personalization: localPersonalization,
    primaryTabs,
    pins,
    isOperator,
    operatorKnown,
    saveStatus,
    saveMessage,
    hideFeature,
    restoreFeature,
    pinFeature,
    unpinFeature,
    searchDirectory,
    evaluate: (featureId: string) =>
      evaluateFeatureEligibility(featureId, release, auth, localPersonalization),
  };
}
