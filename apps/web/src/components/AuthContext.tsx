'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { AuthSession, SignInResponse, SignUpResponse } from '@daynori/contracts';
import { createWebApiClient } from '../data/webApiClient';
import { OfflineFileCache } from '../data/offlineFileCache.js';
import { cleanupWebPushOnSignOutAsync } from '../notifications/webPushManager';

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  workspaceId?: string | null;
}

export interface FeaturePersonalizationState {
  version: 1;
  hiddenFeatureIds: string[];
  pinnedFeatureIds: string[];
}

export interface QuietHoursState {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
}

export interface UserPreferencesState {
  timeZone: string;
  preferredLocale: string;
  weekStart: 'monday' | 'sunday' | 'saturday';
  theme: 'system' | 'light' | 'dark';
  compactMode: boolean;
  expensesEnabled: boolean;
  journalPreviewHidden: boolean;
  suppressBodySnippets: boolean;
  quietHours?: QuietHoursState;
  featurePersonalization?: FeaturePersonalizationState;
  revision: number;
}

export interface QuarantinedWebDraft {
  id: string;
  userId: string;
  quarantinedAt: string;
  draftType: string;
  payload: Record<string, unknown>;
}

export interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  csrfToken: string | null;
  workspaceId: string | null;
  preferences: UserPreferencesState | null;
  isAuthModalOpen: boolean;
  pendingDestination: string | null;
  quarantinedDrafts: QuarantinedWebDraft[];
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<{
    success: boolean;
    requiresVerification?: boolean;
    message?: string;
    error?: string;
  }>;
  signOut: () => Promise<void>;
  recoverPassword: (
    email: string
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  provisionPersonalWorkspace: () => Promise<string | null>;
  loadPreferences: () => Promise<UserPreferencesState | null>;
  savePreferences: (
    updates: Partial<Omit<UserPreferencesState, 'revision'>>,
    expectedRevision?: number
  ) => Promise<{
    success: boolean;
    conflict?: boolean;
    error?: string;
    updated?: UserPreferencesState;
  }>;
  openAuthModal: (pendingDestination?: string) => void;
  closeAuthModal: () => void;
  quarantineDraft: (draftType: string, payload: Record<string, unknown>) => void;
  restoreDraft: (draftId: string) => Record<string, unknown> | null;
  dismissDraft: (draftId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_CHANNEL_NAME = 'daynori_auth_channel';
const AUTH_SYNC_STORAGE_KEY = 'daynori_auth_sync_event';

function mapProfileToPreferences(prof: {
  timeZone: string;
  preferredLocale: string;
  weekStart: 'monday' | 'sunday' | 'saturday';
  revision: number;
  preferences?: {
    theme?: 'system' | 'light' | 'dark';
    compactMode?: boolean;
    expensesEnabled?: boolean;
    journalPreviewHidden?: boolean;
    suppressBodySnippets?: boolean;
    quietHours?: QuietHoursState;
    featurePersonalization?: FeaturePersonalizationState;
  };
}): UserPreferencesState {
  const fp = prof.preferences?.featurePersonalization;
  const qh = prof.preferences?.quietHours;
  return {
    timeZone: prof.timeZone,
    preferredLocale: prof.preferredLocale,
    weekStart: prof.weekStart,
    theme: prof.preferences?.theme || 'system',
    compactMode: Boolean(prof.preferences?.compactMode),
    expensesEnabled: Boolean(prof.preferences?.expensesEnabled),
    journalPreviewHidden:
      prof.preferences?.journalPreviewHidden !== undefined
        ? Boolean(prof.preferences.journalPreviewHidden)
        : true,
    suppressBodySnippets:
      prof.preferences?.suppressBodySnippets !== undefined
        ? Boolean(prof.preferences.suppressBodySnippets)
        : true,
    quietHours: qh
      ? {
          enabled: Boolean(qh.enabled),
          start: typeof qh.start === 'string' ? qh.start : '22:00',
          end: typeof qh.end === 'string' ? qh.end : '08:00',
          timezone: typeof qh.timezone === 'string' ? qh.timezone : 'UTC',
        }
      : undefined,
    featurePersonalization: fp
      ? {
          version: 1,
          hiddenFeatureIds: Array.isArray(fp.hiddenFeatureIds) ? fp.hiddenFeatureIds.map(String) : [],
          pinnedFeatureIds: Array.isArray(fp.pinnedFeatureIds) ? fp.pinnedFeatureIds.map(String) : [],
        }
      : undefined,
    revision: prof.revision,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferencesState | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);

  // In-memory quarantined drafts (isolated per user ID)
  const [quarantinedDrafts, setQuarantinedDrafts] = useState<QuarantinedWebDraft[]>([]);

  // AbortController ref to cancel stale in-flight requests on logout/session change
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  const getOrCreateAbortSignal = useCallback(() => {
    if (!activeAbortControllerRef.current || activeAbortControllerRef.current.signal.aborted) {
      activeAbortControllerRef.current = new AbortController();
    }
    return activeAbortControllerRef.current.signal;
  }, []);

  const cancelInFlightRequests = useCallback(() => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort('Session replaced or logged out');
      activeAbortControllerRef.current = new AbortController();
    }
  }, []);

  const provisionPersonalWorkspace = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/workspaces/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
      });
      if (res.ok) {
        const payload = await res.json();
        const wsId = payload.data?.workspace?.id || null;
        if (wsId) {
          setWorkspaceId(wsId);
          setUser((prev) => (prev ? { ...prev, workspaceId: wsId } : null));
        }
        if (payload.data?.profile) {
          const prof = payload.data.profile;
          setPreferences(mapProfileToPreferences(prof));
        }
        return wsId;
      }
    } catch {
      // Ignored: can be retried
    }
    return null;
  }, [csrfToken]);

  const loadPreferences = useCallback(async (): Promise<UserPreferencesState | null> => {
    try {
      const res = await fetch('/api/users/preferences', {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const payload = await res.json();
        const loaded = mapProfileToPreferences(payload.data);
        setPreferences(loaded);
        return loaded;
      }
    } catch {
      // Ignore
    }
    return null;
  }, []);

  const savePreferences = useCallback(
    async (
      updates: Partial<Omit<UserPreferencesState, 'revision'>>,
      expectedRevision?: number
    ): Promise<{
      success: boolean;
      conflict?: boolean;
      error?: string;
      updated?: UserPreferencesState;
    }> => {
      try {
        const prefsPatch: Record<string, unknown> = {};
        if (updates.theme !== undefined) prefsPatch.theme = updates.theme;
        if (updates.compactMode !== undefined) prefsPatch.compactMode = updates.compactMode;
        if (updates.expensesEnabled !== undefined)
          prefsPatch.expensesEnabled = updates.expensesEnabled;
        if (updates.journalPreviewHidden !== undefined)
          prefsPatch.journalPreviewHidden = updates.journalPreviewHidden;
        if (updates.suppressBodySnippets !== undefined)
          prefsPatch.suppressBodySnippets = updates.suppressBodySnippets;
        if (updates.quietHours !== undefined) prefsPatch.quietHours = updates.quietHours;
        if (updates.featurePersonalization !== undefined)
          prefsPatch.featurePersonalization = updates.featurePersonalization;

        const payload: Record<string, unknown> = {
          ...(updates.timeZone ? { timeZone: updates.timeZone } : {}),
          ...(updates.preferredLocale ? { preferredLocale: updates.preferredLocale } : {}),
          ...(updates.weekStart ? { weekStart: updates.weekStart } : {}),
          ...(Object.keys(prefsPatch).length
            ? {
                preferences: {
                  theme: (prefsPatch.theme as string) ?? preferences?.theme ?? 'system',
                  compactMode:
                    (prefsPatch.compactMode as boolean) ?? preferences?.compactMode ?? false,
                  expensesEnabled:
                    (prefsPatch.expensesEnabled as boolean) ??
                    preferences?.expensesEnabled ??
                    false,
                  journalPreviewHidden:
                    (prefsPatch.journalPreviewHidden as boolean | undefined) ??
                    preferences?.journalPreviewHidden ??
                    true,
                  suppressBodySnippets:
                    (prefsPatch.suppressBodySnippets as boolean | undefined) ??
                    preferences?.suppressBodySnippets ??
                    true,
                  ...(prefsPatch.quietHours !== undefined
                    ? { quietHours: prefsPatch.quietHours }
                    : preferences?.quietHours
                      ? { quietHours: preferences.quietHours }
                      : {}),
                  ...(prefsPatch.featurePersonalization !== undefined
                    ? { featurePersonalization: prefsPatch.featurePersonalization }
                    : preferences?.featurePersonalization
                      ? { featurePersonalization: preferences.featurePersonalization }
                      : {}),
                },
              }
            : {}),
          expectedRevision: expectedRevision ?? preferences?.revision,
        };

        const res = await fetch('/api/users/preferences', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (res.status === 409) {
          return {
            success: false,
            conflict: true,
            error: data.error?.message || 'Revision conflict',
          };
        }
        if (!res.ok) {
          return { success: false, error: data.error?.message || 'Failed to save preferences' };
        }

        const updated = mapProfileToPreferences(data.data);
        setPreferences(updated);
        return { success: true, updated };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Network error' };
      }
    },
    [csrfToken, preferences]
  );

  // Broadcast auth event to other browser tabs (contains ZERO credentials or private data)
  const broadcastAuthEvent = useCallback((type: 'LOGIN' | 'LOGOUT' | 'REFRESH') => {
    if (typeof window === 'undefined') return;

    const payload = { type, timestamp: Date.now() };

    // 1. BroadcastChannel API
    if ('BroadcastChannel' in window) {
      try {
        const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
        channel.postMessage(payload);
        channel.close();
      } catch {
        // Fall back to storage event
      }
    }

    // 2. Storage event fallback for older browsers (only non-sensitive timestamps!)
    try {
      window.localStorage.setItem(AUTH_SYNC_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage might be restricted
    }
  }, []);

  // Fetch current session from same-origin Route Handler
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        signal: getOrCreateAbortSignal(),
      });

      if (res.ok) {
        const session: AuthSession = await res.json();
        if (session.authenticated && session.user) {
          setUser(session.user);
          setIsAuthenticated(true);
          void provisionPersonalWorkspace();
        } else {
          // Explicit unauthenticated response — clear local auth UI state
          setUser(null);
          setIsAuthenticated(false);
          setWorkspaceId(null);
          setPreferences(null);
        }
        if (session.csrfToken) {
          setCsrfToken(session.csrfToken);
        }
      } else if (res.status === 401 || res.status === 403) {
        setUser(null);
        setIsAuthenticated(false);
        setWorkspaceId(null);
        setPreferences(null);
      }
      // Other HTTP errors (5xx / cold start): keep last-known session; cookies may still be valid
    } catch (err) {
      // Network / free-server wake failures must not erase a still-valid cookie session
      if ((err as Error)?.name !== 'AbortError') {
        console.warn('[auth] session check deferred (network/temporary):', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [getOrCreateAbortSignal, provisionPersonalWorkspace]);

  // Initial session check on mount and multi-tab synchronization listener
  useEffect(() => {
    checkSession();

    let channel: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
        channel.onmessage = (event) => {
          if (event.data?.type === 'LOGOUT') {
            cancelInFlightRequests();
            setUser(null);
            setIsAuthenticated(false);
            setWorkspaceId(null);
            setPreferences(null);
          } else if (event.data?.type === 'LOGIN' || event.data?.type === 'REFRESH') {
            checkSession();
          }
        };
      } catch {
        // Ignore
      }
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTH_SYNC_STORAGE_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          if (parsed.type === 'LOGOUT') {
            cancelInFlightRequests();
            setUser(null);
            setIsAuthenticated(false);
            setWorkspaceId(null);
            setPreferences(null);
          } else if (parsed.type === 'LOGIN' || parsed.type === 'REFRESH') {
            checkSession();
          }
        } catch {
          // Ignore
        }
      }
    };

    window.addEventListener('storage', onStorage);

    return () => {
      channel?.close();
      window.removeEventListener('storage', onStorage);
    };
  }, [checkSession, cancelInFlightRequests]);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error?.message || 'Sign in failed' };
      }

      const signInRes = data as SignInResponse;
      setUser(signInRes.user);
      setIsAuthenticated(true);
      if (signInRes.csrfToken) {
        setCsrfToken(signInRes.csrfToken);
      }
      setIsAuthModalOpen(false);
      broadcastAuthEvent('LOGIN');
      provisionPersonalWorkspace();

      // Resolve pending protected destination if present
      if (pendingDestination && typeof window !== 'undefined') {
        const dest = pendingDestination;
        setPendingDestination(null);
        window.location.href = dest;
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error)?.message || 'Network error during sign in' };
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/sign-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ email, password, displayName }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error?.message || 'Sign up failed' };
      }

      const signUpRes = data as SignUpResponse;
      return {
        success: true,
        requiresVerification: signUpRes.requiresVerification,
        message: signUpRes.message,
      };
    } catch (err) {
      return { success: false, error: (err as Error)?.message || 'Network error during sign up' };
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    cancelInFlightRequests();

    const currentUserId = user?.id;
    const currentWsId = workspaceId;
    if (currentUserId) {
      void OfflineFileCache.clearAccount(currentUserId).catch(() => {});
    }
    if (currentWsId) {
      void OfflineFileCache.clearWorkspace(currentWsId).catch(() => {});
    }

    // Clean up browser push subscription on backend and reset bound account state
    try {
      const client = createWebApiClient({ csrfToken });
      await cleanupWebPushOnSignOutAsync(client, currentUserId);
    } catch {
      // Ignore
    }

    // Reset client state immediately
    setUser(null);
    setIsAuthenticated(false);
    setWorkspaceId(null);
    setPreferences(null);
    broadcastAuthEvent('LOGOUT');

    try {
      await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: {
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
      });
    } catch {
      // Ignore network error on logout; client is already cleared
    }
  };

  const recoverPassword = async (email: string) => {
    try {
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error?.message || 'Password recovery request failed' };
      }
      return { success: true, message: data.message };
    } catch (err) {
      return { success: false, error: (err as Error)?.message || 'Network error during recovery' };
    }
  };

  const openAuthModal = (destination?: string) => {
    if (destination) {
      setPendingDestination(destination);
    }
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
    setPendingDestination(null);
  };

  const quarantineDraft = (draftType: string, payload: Record<string, unknown>) => {
    if (!user) return;
    const newQuarantine: QuarantinedWebDraft = {
      id: crypto.randomUUID(),
      userId: user.id,
      quarantinedAt: new Date().toISOString(),
      draftType,
      payload,
    };
    setQuarantinedDrafts((prev) => [...prev, newQuarantine]);
  };

  const restoreDraft = (draftId: string) => {
    if (!user) return null;
    const found = quarantinedDrafts.find((d) => d.id === draftId && d.userId === user.id);
    if (!found) return null;
    setQuarantinedDrafts((prev) => prev.filter((d) => d.id !== draftId));
    return found.payload;
  };

  const dismissDraft = (draftId: string) => {
    setQuarantinedDrafts((prev) => prev.filter((d) => d.id !== draftId));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        csrfToken,
        workspaceId,
        preferences,
        isAuthModalOpen,
        pendingDestination,
        quarantinedDrafts: user ? quarantinedDrafts.filter((d) => d.userId === user.id) : [],
        signIn,
        signUp,
        signOut,
        recoverPassword,
        provisionPersonalWorkspace,
        loadPreferences,
        savePreferences,
        openAuthModal,
        closeAuthModal,
        quarantineDraft,
        restoreDraft,
        dismissDraft,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
