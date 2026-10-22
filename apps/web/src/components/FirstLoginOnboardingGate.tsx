'use client';

import { useEffect, useRef } from 'react';
import { shouldShowOnboarding, type OnboardingState } from '@daynori/domain';
import { useAuth } from './AuthContext';
import { useShell } from './ShellContext';
import { createWebApiClient } from '../data/webApiClient';

/**
 * Offers the first-login tour once per account session from any route
 * (not only Today), without re-forcing after complete/skip/dismiss.
 */
export function FirstLoginOnboardingGate() {
  const { isAuthenticated, isLoading, user, csrfToken } = useAuth();
  const { openModal, activeModal } = useShell();
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user?.id || !csrfToken) return;
    if (activeModal === 'onboarding' || activeModal === 'onboarding-replay') return;

    const promptKey = `daynori:onboarding-prompted:${user.id}`;
    if (typeof window !== 'undefined' && sessionStorage.getItem(promptKey) === '1') {
      return;
    }
    if (attemptedRef.current === user.id) return;
    attemptedRef.current = user.id;

    let cancelled = false;

    void (async () => {
      try {
        let localDraftCompletedOrSkipped = false;
        const rawDraft = window.localStorage.getItem(`daynori:onboarding:${user.id}`);
        if (rawDraft) {
          try {
            const parsed = JSON.parse(rawDraft) as { step?: string; skipped?: boolean };
            if (parsed.step === 'completed' || parsed.skipped) {
              localDraftCompletedOrSkipped = true;
            }
          } catch {
            /* ignore */
          }
        }

        const client = createWebApiClient({ csrfToken });
        const prefRes = await client.getUserPreferences().catch(() => null);
        const onboarding = prefRes?.data?.preferences?.onboarding as OnboardingState | undefined;

        if (cancelled) return;
        if (!localDraftCompletedOrSkipped && shouldShowOnboarding(onboarding)) {
          sessionStorage.setItem(promptKey, '1');
          openModal('onboarding');
        } else {
          sessionStorage.setItem(promptKey, '1');
        }
      } catch {
        attemptedRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoading, isAuthenticated, user?.id, csrfToken, openModal, activeModal]);

  return null;
}
