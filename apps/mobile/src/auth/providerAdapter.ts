/**
 * Mobile Provider Authentication Adapter
 *
 * Implements real identity provider integration for the Android mobile shell:
 * - Interfaces with Supabase Auth service (GoTrue) over HTTP transport.
 * - Manages session lifecycle: sign-up, sign-in, recovery, refresh, and sign-out.
 * - Stores credentials exclusively in OS-backed secure storage (expo-secure-store).
 * - Restricts memory storage to tests; never falls back to unencrypted storage.
 * - Enforces flow-initiated deep link callbacks with PKCE code exchange or token verification.
 * - Verifies restored sessions against the provider before exposing private content.
 * - Explicitly handles credential deletion failures on sign-out to prevent silent session restoration.
 * - Quarantines uncommitted drafts on logout to prevent cross-account data leakage.
 */

import { parseDeepLinkUrl, type Profile, type UpdatePreferencesRequest } from '@daynori/contracts';
import { createApiClient } from '@daynori/api-client';
import {
  defaultSecureStorage,
  SecureStorageError,
  type SecureStoreContract,
} from './secureStorage.js';
import {
  DraftQuarantineManager,
  defaultDraftQuarantine,
  type QuarantinedDraft,
} from './draftQuarantine.js';

export interface MobileUser {
  id: string;
  email: string;
  name: string;
  workspaceId: string | null;
}

export interface AuthResult {
  success: boolean;
  requiresVerification?: boolean;
  message?: string;
  error?: string;
}

export interface InitiatedAuthFlow {
  state: string;
  nonce: string;
  codeVerifier: string;
  initiatedAt: number;
  type: 'signup' | 'signin' | 'recovery';
}

export interface ProviderClientContract {
  signUp(params: { email: string; password: string; displayName?: string }): Promise<AuthResult>;
  signInWithPassword(params: { email: string; password: string }): Promise<{
    user: MobileUser;
    accessToken: string;
    refreshToken: string;
  }>;
  verifyToken(accessToken: string): Promise<MobileUser | null>;
  refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>;
  recoverPassword(email: string): Promise<AuthResult>;
  logout(accessToken: string): Promise<void>;
  exchangeCode(
    code: string,
    codeVerifier: string
  ): Promise<{
    user: MobileUser;
    accessToken: string;
    refreshToken: string;
  }>;
  provisionWorkspace?(token: string): Promise<{ workspaceId: string }>;
  getPreferences?(token: string): Promise<Profile | null>;
  updatePreferences?(token: string, params: UpdatePreferencesRequest): Promise<Profile | null>;
}

function createTimeoutSignal(ms: number): AbortSignal {
  const anySignal = AbortSignal as unknown as { timeout?: (m: number) => AbortSignal };
  if (typeof anySignal.timeout === 'function') {
    return anySignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export const SEC_KEY_ACCESS_TOKEN = 'daynori_sec_access_token';
export const SEC_KEY_REFRESH_TOKEN = 'daynori_sec_refresh_token';
export const SEC_KEY_USER_ID = 'daynori_sec_user_id';
export const SEC_KEY_USER_EMAIL = 'daynori_sec_user_email';
export const SEC_KEY_USER_NAME = 'daynori_sec_user_name';
export const SEC_KEY_WORKSPACE_ID = 'daynori_sec_workspace_id';
export const SEC_KEY_SESSION_REVOKED = 'daynori_sec_session_revoked';

export class MobileProviderAuthAdapter {
  private authenticated: boolean = false;
  private currentUser: MobileUser | null = null;
  private pendingDestination: string | null = null;
  private listeners: Array<() => void> = [];

  private secureStore: SecureStoreContract;
  private quarantineManager: DraftQuarantineManager;
  private supabaseUrl: string;
  private supabaseAnonKey: string;
  private apiBaseUrl: string;
  private requestTimeoutMs: number;
  private customProvider: ProviderClientContract | null = null;

  // Active initiated authentication flow awaiting callback
  private pendingFlow: InitiatedAuthFlow | null = null;

  // Cache of processed nonces / tokens to prevent replay attacks (10 minute window)
  private processedNonces = new Map<string, number>();

  constructor(
    options?:
      | {
          secureStore?: SecureStoreContract;
          quarantineManager?: DraftQuarantineManager;
          supabaseUrl?: string;
          supabaseAnonKey?: string;
          apiBaseUrl?: string;
          requestTimeoutMs?: number;
          initialAuthenticated?: boolean;
          providerClient?: ProviderClientContract;
        }
      | boolean
  ) {
    const opts = typeof options === 'boolean' ? { initialAuthenticated: options } : options;
    this.secureStore = opts?.secureStore ?? defaultSecureStorage;
    this.quarantineManager = opts?.quarantineManager ?? defaultDraftQuarantine;
    this.supabaseUrl =
      opts?.supabaseUrl ?? process.env['SUPABASE_AUTH_URL'] ?? 'http://127.0.0.1:54321';
    this.supabaseAnonKey =
      opts?.supabaseAnonKey ?? process.env['SUPABASE_ANON_KEY'] ?? 'test-anon-key';
    this.apiBaseUrl = opts?.apiBaseUrl ?? process.env['DAYNORI_API_URL'] ?? 'http://127.0.0.1:3001';
    this.requestTimeoutMs =
      opts?.requestTimeoutMs ?? (process.env['NODE_ENV'] === 'test' ? 1000 : 5000);
    this.customProvider = opts?.providerClient ?? null;

    if (opts?.initialAuthenticated) {
      this.authenticated = true;
      this.currentUser = {
        id: 'usr_synthetic_initial',
        email: 'user@daynori.local',
        name: 'Alex Morgan',
        workspaceId: null,
      };
    }
  }

  public isAuthenticated(): boolean {
    return this.authenticated;
  }

  public getCurrentUser(): MobileUser | null {
    return this.currentUser;
  }

  public getPendingDestination(): string | null {
    return this.pendingDestination;
  }

  public setPendingDestination(dest: string | null): void {
    this.pendingDestination = dest;
  }

  public async getAccessToken(): Promise<string | null> {
    try {
      return await this.secureStore.getItemAsync(SEC_KEY_ACCESS_TOKEN);
    } catch {
      return null;
    }
  }

  /**
   * Idempotently provision or resolve the personal workspace for the authenticated mobile user.
   */
  public async provisionPersonalWorkspace(): Promise<string | null> {
    if (!this.currentUser) return null;

    const token = await this.getAccessToken();
    if (!token) return null;

    if (this.customProvider?.provisionWorkspace) {
      try {
        const res = await this.customProvider.provisionWorkspace(token);
        this.currentUser.workspaceId = res.workspaceId;
        await this.secureStore.setItemAsync(SEC_KEY_WORKSPACE_ID, res.workspaceId);
        this.notify();
        return res.workspaceId;
      } catch {
        return null;
      }
    }

    try {
      const apiClient = createApiClient({ baseUrl: this.apiBaseUrl, token });
      const res = await apiClient.provisionPersonalWorkspace({
        displayName: this.currentUser.name,
      });
      const wsId = res.data.workspace.id;
      this.currentUser.workspaceId = wsId;
      await this.secureStore.setItemAsync(SEC_KEY_WORKSPACE_ID, wsId);
      this.notify();
      return wsId;
    } catch {
      return null;
    }
  }

  /**
   * Fetch actor profile and synced preferences.
   */
  public async getPreferences(): Promise<Profile | null> {
    if (!this.currentUser) return null;
    const token = await this.getAccessToken();
    if (!token) return null;

    if (this.customProvider?.getPreferences) {
      return this.customProvider.getPreferences(token);
    }

    try {
      const apiClient = createApiClient({ baseUrl: this.apiBaseUrl, token });
      const res = await apiClient.getUserPreferences();
      return res.data;
    } catch {
      return null;
    }
  }

  /**
   * Update actor preferences with revision concurrency control.
   */
  public async updatePreferences(params: UpdatePreferencesRequest): Promise<Profile | null> {
    if (!this.currentUser) return null;
    const token = await this.getAccessToken();
    if (!token) return null;

    if (this.customProvider?.updatePreferences) {
      return this.customProvider.updatePreferences(token, params);
    }

    try {
      const apiClient = createApiClient({ baseUrl: this.apiBaseUrl, token });
      const res = await apiClient.updateUserPreferences(params);
      return res.data;
    } catch {
      return null;
    }
  }

  /**
   * Cold start / Process restart session restoration.
   * Reads session secrets from OS-backed secure storage and verifies with provider before exposing private content.
   */
  public async restoreSession(): Promise<boolean> {
    try {
      const isRevoked = await this.secureStore.getItemAsync(SEC_KEY_SESSION_REVOKED);
      if (isRevoked === 'true') {
        await this.clearStoredCredentials();
        this.authenticated = false;
        this.currentUser = null;
        return false;
      }

      const accessToken = await this.secureStore.getItemAsync(SEC_KEY_ACCESS_TOKEN);
      const refreshToken = await this.secureStore.getItemAsync(SEC_KEY_REFRESH_TOKEN);

      if (!accessToken) {
        this.authenticated = false;
        this.currentUser = null;
        return false;
      }

      // Verify token with provider
      let verifiedUser: MobileUser | null = null;
      if (this.customProvider) {
        verifiedUser = await this.customProvider.verifyToken(accessToken);
      } else {
        verifiedUser = await this.fetchProviderUser(accessToken);
      }

      if (verifiedUser) {
        const storedWorkspaceId = await this.secureStore.getItemAsync(SEC_KEY_WORKSPACE_ID);
        this.currentUser = {
          ...verifiedUser,
          workspaceId: storedWorkspaceId || null,
        };
        this.authenticated = true;
        this.notify();
        return true;
      }

      // Access token verification failed (expired/revoked), attempt refresh
      if (refreshToken) {
        try {
          let refreshed: { accessToken: string; refreshToken: string };
          if (this.customProvider) {
            refreshed = await this.customProvider.refreshToken(refreshToken);
          } else {
            refreshed = await this.fetchProviderRefresh(refreshToken);
          }

          // Re-verify refreshed token
          const reVerified = this.customProvider
            ? await this.customProvider.verifyToken(refreshed.accessToken)
            : await this.fetchProviderUser(refreshed.accessToken);

          if (reVerified) {
            await this.persistSession(reVerified, refreshed.accessToken, refreshed.refreshToken);
            return true;
          }
        } catch {
          // Refresh failed
        }
      }

      // Session could not be validated; wipe stale credentials
      await this.clearStoredCredentials();
    } catch {
      // Storage or network error: fail safely without exposing private session
    }

    this.authenticated = false;
    this.currentUser = null;
    return false;
  }

  /**
   * Register a new user with Supabase Auth. Fails safely on provider outages.
   */
  public async signUp(params: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<AuthResult> {
    if (this.customProvider) {
      return this.customProvider.signUp(params);
    }

    const normalizedEmail = params.email.toLowerCase().trim();

    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/signup`, {
        method: 'POST',
        signal: createTimeoutSignal(this.requestTimeoutMs),
        headers: {
          'Content-Type': 'application/json',
          apikey: this.supabaseAnonKey,
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password: params.password,
          data: { display_name: params.displayName },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return {
          success: true,
          requiresVerification: true,
          message: 'Verification email sent. Please check your inbox.',
        };
      }

      return {
        success: false,
        error: data.msg || data.message || data.error_description || 'Sign up failed',
      };
    } catch {
      return {
        success: false,
        error: 'Authentication service unavailable',
      };
    }
  }

  /**
   * Sign in with password. Stores session in OS-backed secure storage upon verification.
   */
  public async signInWithPassword(params: {
    email: string;
    password: string;
  }): Promise<AuthResult> {
    if (this.customProvider) {
      try {
        const result = await this.customProvider.signInWithPassword(params);
        await this.persistSession(result.user, result.accessToken, result.refreshToken);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Invalid email or password',
        };
      }
    }

    const normalizedEmail = params.email.toLowerCase().trim();

    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        signal: createTimeoutSignal(this.requestTimeoutMs),
        headers: {
          'Content-Type': 'application/json',
          apikey: this.supabaseAnonKey,
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password: params.password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const user: MobileUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.display_name || data.user.email.split('@')[0],
          workspaceId: null, // explicit "workspace not provisioned" until Phase 10
        };

        await this.persistSession(user, data.access_token, data.refresh_token);
        return { success: true };
      }

      return {
        success: false,
        error: data.msg || data.error_description || 'Invalid email or password',
      };
    } catch {
      return {
        success: false,
        error: 'Authentication service unavailable',
      };
    }
  }

  /**
   * Password recovery request.
   */
  public async recoverPassword(email: string): Promise<AuthResult> {
    if (this.customProvider) {
      return this.customProvider.recoverPassword(email);
    }

    const normalizedEmail = email.toLowerCase().trim();
    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/recover`, {
        method: 'POST',
        signal: createTimeoutSignal(this.requestTimeoutMs),
        headers: {
          'Content-Type': 'application/json',
          apikey: this.supabaseAnonKey,
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          error: data.msg || data.message || 'Password recovery request failed',
        };
      }
    } catch {
      return {
        success: false,
        error: 'Authentication service unavailable',
      };
    }

    return {
      success: true,
      message: 'Password recovery email sent if account exists.',
    };
  }

  /**
   * Initiates an authentication flow (OAuth, magic link, email confirmation).
   * Generates and stores anti-replay state, nonce, and PKCE verifier.
   */
  public initiateAuthFlow(type: 'signup' | 'signin' | 'recovery' = 'signin'): {
    state: string;
    nonce: string;
    codeVerifier: string;
  } {
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const codeVerifier =
      crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    this.pendingFlow = { state, nonce, codeVerifier, initiatedAt: Date.now(), type };
    return { state, nonce, codeVerifier };
  }

  /**
   * Deep link authentication callback processor.
   * Requires matching initiated flow, enforces replay protection, and performs provider-verified code/token exchange.
   */
  public async handleDeepLink(url: string): Promise<AuthResult> {
    // 1. Parse and validate URL structure
    const parseResult = parseDeepLinkUrl(url);
    if (!parseResult.success || !parseResult.payload) {
      return { success: false, error: 'Invalid or unsupported deep link format' };
    }

    const payload = parseResult.payload;

    if (payload.type !== 'auth') {
      return { success: false, error: 'Not an authentication deep link' };
    }

    if (payload.error) {
      return {
        success: false,
        error: `Authentication failed: ${payload.error}`,
      };
    }

    // 2. Validate against initiated flow
    const now = Date.now();
    if (!this.pendingFlow || now - this.pendingFlow.initiatedAt > 10 * 60 * 1000) {
      this.pendingFlow = null;
      return {
        success: false,
        error: 'No initiated authentication flow found (unsolicited or expired callback rejected)',
      };
    }

    // 3. Binding check: state or nonce must match initiated flow
    const matchingId = payload.nonce || payload.state;
    if (
      !matchingId ||
      (matchingId !== this.pendingFlow.nonce && matchingId !== this.pendingFlow.state)
    ) {
      return {
        success: false,
        error: 'State or nonce does not match initiated authentication flow',
      };
    }

    // 4. Anti-replay protection
    if (this.processedNonces.has(matchingId)) {
      return {
        success: false,
        error: 'Authentication link has already been used (replay rejected)',
      };
    }
    this.processedNonces.set(matchingId, now);

    // Clean up expired nonces
    for (const [nonce, timestamp] of this.processedNonces.entries()) {
      if (now - timestamp > 10 * 60 * 1000) {
        this.processedNonces.delete(nonce);
      }
    }

    // 5. Genuine provider verification / code exchange
    try {
      let verifiedUser: MobileUser;
      let accessToken: string;
      let refreshToken: string;

      if (payload.code) {
        if (this.customProvider) {
          const res = await this.customProvider.exchangeCode(
            payload.code,
            this.pendingFlow.codeVerifier
          );
          verifiedUser = res.user;
          accessToken = res.accessToken;
          refreshToken = res.refreshToken;
        } else {
          const ex = await this.fetchProviderCodeExchange(
            payload.code,
            this.pendingFlow.codeVerifier
          );
          verifiedUser = ex.user;
          accessToken = ex.accessToken;
          refreshToken = ex.refreshToken;
        }
      } else if (payload.token) {
        if (this.customProvider) {
          const user = await this.customProvider.verifyToken(payload.token);
          if (!user) throw new Error('Provider rejected authentication token');
          verifiedUser = user;
          accessToken = payload.token;
          refreshToken = '';
        } else {
          const user = await this.fetchProviderUser(payload.token);
          if (!user) throw new Error('Provider rejected authentication token');
          verifiedUser = user;
          accessToken = payload.token;
          refreshToken = '';
        }
      } else {
        return { success: false, error: 'Callback missing authorization code or token' };
      }

      this.pendingFlow = null;
      await this.persistSession(verifiedUser, accessToken, refreshToken);
      return { success: true };
    } catch (err) {
      this.pendingFlow = null;
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Provider authentication verification failed',
      };
    }
  }

  /**
   * Sign out user.
   * Revokes server session, clears OS-backed secure storage, and quarantines uncommitted drafts.
   * Explicitly propagates credential deletion failures to prevent silent restoration.
   */
  public async signOut(uncommittedDraft?: Record<string, unknown>): Promise<void> {
    const userToSignOut = this.currentUser;
    if (userToSignOut && uncommittedDraft && Object.keys(uncommittedDraft).length > 0) {
      this.quarantineManager.quarantineDraft(
        userToSignOut.id,
        'mobile_uncommitted_draft',
        uncommittedDraft
      );
    }

    // Immediately revoke authenticated state in memory and notify listeners
    this.authenticated = false;
    this.currentUser = null;
    this.pendingDestination = null;
    this.notify();

    let tokenToRevoke: string | null = null;
    try {
      tokenToRevoke = await this.secureStore.getItemAsync(SEC_KEY_ACCESS_TOKEN);
    } catch {
      // Ignore read failure during sign-out
    }

    // Revoke server-side session at provider
    if (tokenToRevoke) {
      try {
        if (this.customProvider) {
          await this.customProvider.logout(tokenToRevoke);
        } else {
          await fetch(`${this.supabaseUrl}/auth/v1/logout`, {
            method: 'POST',
            signal: createTimeoutSignal(this.requestTimeoutMs),
            headers: {
              Authorization: `Bearer ${tokenToRevoke}`,
              apikey: this.supabaseAnonKey,
            },
          });
        }
      } catch {
        // Network failure during server revocation is caught safely
      }
    }

    // Explicitly clear secrets from OS secure storage
    try {
      await this.clearStoredCredentials();
    } catch (err) {
      // Mark session as explicitly revoked so restart cannot silently restore it
      try {
        await this.secureStore.setItemAsync(SEC_KEY_SESSION_REVOKED, 'true');
      } catch {
        // secondary store failure
      }
      throw new SecureStorageError(
        'Failed to delete credentials from secure storage during sign-out. Marked as revoked.',
        err
      );
    }
  }

  public logout(): void {
    this.authenticated = false;
    this.currentUser = null;
    this.pendingDestination = null;
    this.notify();
    void this.signOut();
  }

  /**
   * Retrieves quarantined drafts for active user.
   */
  public getQuarantinedDrafts(): QuarantinedDraft[] {
    if (!this.currentUser) return [];
    return this.quarantineManager.getQuarantinedDrafts(this.currentUser.id);
  }

  /**
   * Restores a quarantined draft for the active user.
   */
  public restoreQuarantinedDraft(draftId: string): Record<string, unknown> | null {
    if (!this.currentUser) return null;
    return this.quarantineManager.restoreQuarantinedDraft(this.currentUser.id, draftId);
  }

  /**
   * Dismisses a quarantined draft.
   */
  public dismissQuarantinedDraft(draftId: string): boolean {
    if (!this.currentUser) return false;
    return this.quarantineManager.dismissQuarantinedDraft(this.currentUser.id, draftId);
  }

  /**
   * Synthetic login strictly for test suites and dev review mode.
   */
  public loginSynthetic(user?: Partial<MobileUser>): void {
    this.authenticated = true;
    this.currentUser = {
      id: user?.id || 'usr_synthetic_demo',
      email: user?.email || 'demo@daynori.local',
      name: user?.name || 'Alex Morgan',
      workspaceId: user?.workspaceId ?? null,
    };
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  public clearListeners(): void {
    this.listeners = [];
  }

  private async persistSession(
    user: MobileUser,
    accessToken: string,
    refreshToken?: string
  ): Promise<void> {
    this.currentUser = user;
    this.authenticated = true;

    await this.secureStore.setItemAsync(SEC_KEY_ACCESS_TOKEN, accessToken);
    if (refreshToken) {
      await this.secureStore.setItemAsync(SEC_KEY_REFRESH_TOKEN, refreshToken);
    }
    await this.secureStore.setItemAsync(SEC_KEY_USER_ID, user.id);
    await this.secureStore.setItemAsync(SEC_KEY_USER_EMAIL, user.email);
    await this.secureStore.setItemAsync(SEC_KEY_USER_NAME, user.name);
    if (user.workspaceId) {
      await this.secureStore.setItemAsync(SEC_KEY_WORKSPACE_ID, user.workspaceId);
    } else {
      await this.secureStore.deleteItemAsync(SEC_KEY_WORKSPACE_ID).catch(() => {});
    }
    await this.secureStore.deleteItemAsync(SEC_KEY_SESSION_REVOKED).catch(() => {});

    this.notify();
  }

  private async clearStoredCredentials(): Promise<void> {
    await this.secureStore.deleteItemAsync(SEC_KEY_ACCESS_TOKEN);
    await this.secureStore.deleteItemAsync(SEC_KEY_REFRESH_TOKEN);
    await this.secureStore.deleteItemAsync(SEC_KEY_USER_ID);
    await this.secureStore.deleteItemAsync(SEC_KEY_USER_EMAIL);
    await this.secureStore.deleteItemAsync(SEC_KEY_USER_NAME);
    await this.secureStore.deleteItemAsync(SEC_KEY_WORKSPACE_ID);
  }

  private async fetchProviderUser(accessToken: string): Promise<MobileUser | null> {
    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: this.supabaseAnonKey,
        },
        signal: createTimeoutSignal(this.requestTimeoutMs),
      });

      if (!res.ok) return null;
      const data = await res.json();
      return {
        id: data.id,
        email: data.email,
        name: data.user_metadata?.display_name || data.email.split('@')[0],
        workspaceId: null,
      };
    } catch {
      return null;
    }
  }

  private async fetchProviderRefresh(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.supabaseAnonKey,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: createTimeoutSignal(this.requestTimeoutMs),
    });

    if (!res.ok) {
      throw new Error('Refresh token rejected');
    }
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  }

  private async fetchProviderCodeExchange(
    code: string,
    codeVerifier: string
  ): Promise<{ user: MobileUser; accessToken: string; refreshToken: string }> {
    const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.supabaseAnonKey,
      },
      body: JSON.stringify({
        auth_code: code,
        code_verifier: codeVerifier,
      }),
      signal: createTimeoutSignal(this.requestTimeoutMs),
    });

    if (!res.ok) {
      throw new Error('Authorization code exchange failed');
    }
    const data = await res.json();
    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.display_name || data.user.email.split('@')[0],
        workspaceId: null,
      },
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}

// Global default instance for mobile app runtime
export const defaultProviderAuthAdapter = new MobileProviderAuthAdapter();
