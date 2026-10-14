'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { AuthSession, SignInResponse, SignUpResponse } from '@daynori/contracts';

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
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
  openAuthModal: (pendingDestination?: string) => void;
  closeAuthModal: () => void;
  quarantineDraft: (draftType: string, payload: Record<string, unknown>) => void;
  restoreDraft: (draftId: string) => Record<string, unknown> | null;
  dismissDraft: (draftId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_CHANNEL_NAME = 'daynori_auth_channel';
const AUTH_SYNC_STORAGE_KEY = 'daynori_auth_sync_event';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
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
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
        if (session.csrfToken) {
          setCsrfToken(session.csrfToken);
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setUser(null);
        setIsAuthenticated(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, [getOrCreateAbortSignal]);

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

    // Reset client state immediately
    setUser(null);
    setIsAuthenticated(false);
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
        isAuthModalOpen,
        pendingDestination,
        quarantinedDrafts: user ? quarantinedDrafts.filter((d) => d.userId === user.id) : [],
        signIn,
        signUp,
        signOut,
        recoverPassword,
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
