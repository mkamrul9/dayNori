import { describe, expect, it, beforeEach } from 'vitest';
import type { UpdatePreferencesRequest } from '@daynori/contracts';
import {
  MobileProviderAuthAdapter,
  SEC_KEY_ACCESS_TOKEN,
  SEC_KEY_USER_ID,
  SEC_KEY_USER_EMAIL,
  SEC_KEY_WORKSPACE_ID,
  SEC_KEY_SESSION_REVOKED,
  SEC_KEY_PENDING_FLOW,
  type MobileUser,
  type ProviderClientContract,
  type AuthResult,
} from './auth/providerAdapter.js';
import {
  SecureStorageAdapter,
  SecureStorageError,
  InMemorySecureStore,
  type SecureStoreContract,
} from './auth/secureStorage.js';
import { DraftQuarantineManager, defaultDraftQuarantine } from './auth/draftQuarantine.js';

describe('Android Mobile Authentication & Session Lifecycle (Phase 09 Hardened)', () => {
  let memoryStore: InMemorySecureStore;
  let secureStore: SecureStorageAdapter;
  let quarantine: DraftQuarantineManager;
  let authAdapter: MobileProviderAuthAdapter;
  let mockProvider: MockMobileProvider;

  class MockMobileProvider implements ProviderClientContract {
    public users = new Map<
      string,
      { id: string; email: string; password: string; name?: string }
    >();
    public revokedTokens = new Set<string>();
    public forceFailure = false;

    async signUp(params: {
      email: string;
      password: string;
      displayName?: string;
    }): Promise<AuthResult> {
      if (this.forceFailure) {
        return { success: false, error: 'Authentication service unavailable' };
      }
      const id = crypto.randomUUID();
      this.users.set(params.email.toLowerCase(), {
        id,
        email: params.email.toLowerCase(),
        password: params.password,
        name: params.displayName,
      });
      return {
        success: true,
        requiresVerification: true,
        message: 'Verification email sent. Please check your inbox.',
      };
    }

    async signInWithPassword(params: { email: string; password: string }) {
      if (this.forceFailure) {
        throw new Error('Authentication service unavailable');
      }
      const u = this.users.get(params.email.toLowerCase());
      if (!u || u.password !== params.password) {
        throw new Error('Invalid email or password');
      }
      const user: MobileUser = {
        id: u.id,
        email: u.email,
        name: u.name || u.email.split('@')[0] || 'User',
        workspaceId: null,
      };
      return {
        user,
        accessToken: `valid_mobile_at_${u.id}`,
        refreshToken: `valid_mobile_rt_${u.id}`,
      };
    }

    async verifyToken(accessToken: string): Promise<MobileUser | null> {
      if (this.forceFailure || this.revokedTokens.has(accessToken)) return null;
      if (accessToken.startsWith('valid_mobile_at_')) {
        const id = accessToken.replace('valid_mobile_at_', '');
        return {
          id,
          email: 'verified@daynori.local',
          name: 'Verified User',
          workspaceId: null,
        };
      }
      return null;
    }

    async refreshToken(refreshToken: string) {
      if (this.forceFailure) throw new Error('Authentication service unavailable');
      if (refreshToken.startsWith('valid_mobile_rt_')) {
        const id = refreshToken.replace('valid_mobile_rt_', '');
        return {
          accessToken: `valid_mobile_at_${id}`,
          refreshToken: `valid_mobile_rt_${id}_rotated`,
        };
      }
      throw new Error('Refresh token rejected');
    }

    async recoverPassword(_email: string): Promise<AuthResult> {
      if (this.forceFailure) return { success: false, error: 'Authentication service unavailable' };
      return { success: true, message: 'Password recovery email sent if account exists.' };
    }

    async logout(accessToken: string): Promise<void> {
      this.revokedTokens.add(accessToken);
    }

    async exchangeCode(code: string, codeVerifier: string) {
      if (this.forceFailure) throw new Error('Authentication service unavailable');
      if (code === 'valid_flow_code' && codeVerifier.length > 10) {
        const id = crypto.randomUUID();
        return {
          user: {
            id,
            email: 'flow_user@daynori.local',
            name: 'Flow User',
            workspaceId: null,
          },
          accessToken: `valid_mobile_at_${id}`,
          refreshToken: `valid_mobile_rt_${id}`,
        };
      }
      throw new Error('Authorization code exchange failed');
    }

    async provisionWorkspace(token: string) {
      const id = token.replace('valid_mobile_at_', '');
      return { workspaceId: `ws_personal_${id}` };
    }

    async getPreferences(token: string) {
      const id = token.replace('valid_mobile_at_', '');
      return {
        id,
        displayName: 'Mobile Member',
        preferredLocale: 'en',
        timeZone: 'UTC',
        weekStart: 'monday' as const,
        preferences: { theme: 'system' as const, compactMode: false },
        preferencesSchemaVersion: 1,
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    async updatePreferences(token: string, params: UpdatePreferencesRequest) {
      const id = token.replace('valid_mobile_at_', '');
      return {
        id,
        displayName: params.displayName || 'Mobile Member',
        preferredLocale: params.preferredLocale || 'en',
        timeZone: params.timeZone || 'UTC',
        weekStart: params.weekStart || ('monday' as const),
        preferences: params.preferences || { theme: 'system' as const, compactMode: false },
        preferencesSchemaVersion: 1,
        revision: (params.expectedRevision || 1) + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  beforeEach(() => {
    memoryStore = new InMemorySecureStore();
    defaultDraftQuarantine.clearAllQuarantines();
    secureStore = new SecureStorageAdapter(memoryStore);
    quarantine = new DraftQuarantineManager();
    mockProvider = new MockMobileProvider();
    authAdapter = new MobileProviderAuthAdapter({
      secureStore,
      quarantineManager: quarantine,
      providerClient: mockProvider,
      initialAuthenticated: false,
    });
  });

  describe('1. OS-Backed Secure Storage Adapter', () => {
    it('stores, retrieves, and deletes session secrets', async () => {
      const KEY = 'test_secret_key';
      const SECRET_VAL = 'jwt_secure_token_payload_12345';

      await secureStore.setItemAsync(KEY, SECRET_VAL);
      const retrieved = await secureStore.getItemAsync(KEY);
      expect(retrieved).toBe(SECRET_VAL);

      await secureStore.deleteItemAsync(KEY);
      const afterDelete = await secureStore.getItemAsync(KEY);
      expect(afterDelete).toBeNull();
    });

    it('propagates actionable SecureStorageError when store operations fail', async () => {
      const failingStore = {
        async getItemAsync(): Promise<string | null> {
          throw new Error('KeyStore corrupted');
        },
        async setItemAsync(): Promise<void> {
          throw new Error('Hardware backing failure');
        },
        async deleteItemAsync(): Promise<void> {
          throw new Error('Deletion locked');
        },
      };

      const failingAdapter = new SecureStorageAdapter(failingStore);
      await expect(failingAdapter.getItemAsync('k')).rejects.toThrow(SecureStorageError);
      await expect(failingAdapter.setItemAsync('k', 'v')).rejects.toThrow(SecureStorageError);
      await expect(failingAdapter.deleteItemAsync('k')).rejects.toThrow(SecureStorageError);
    });
  });

  describe('2. Provider Sign-Up, Sign-In, and Recovery Lifecycle', () => {
    it('defaults strictly to unauthenticated state on creation', () => {
      expect(authAdapter.isAuthenticated()).toBe(false);
      expect(authAdapter.getCurrentUser()).toBeNull();
      expect(authAdapter.getPendingDestination()).toBeNull();
    });

    it('fails safely when provider is unreachable, never falling back to runtime mock accounts', async () => {
      mockProvider.forceFailure = true;

      const res = await authAdapter.signInWithPassword({
        email: 'attacker@evil.com',
        password: 'password123',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('unavailable');
      expect(authAdapter.isAuthenticated()).toBe(false);
      expect(authAdapter.getCurrentUser()).toBeNull();
    });

    it('executes genuine sign-up and sign-in journeys', async () => {
      await authAdapter.signUp({
        email: 'member@daynori.local',
        password: 'correctPassword123',
        displayName: 'Daynori Member',
      });

      let notified = false;
      const unsubscribe = authAdapter.subscribe(() => {
        notified = true;
      });

      const signInRes = await authAdapter.signInWithPassword({
        email: 'member@daynori.local',
        password: 'correctPassword123',
      });

      expect(signInRes.success).toBe(true);
      expect(authAdapter.isAuthenticated()).toBe(true);
      expect(authAdapter.getCurrentUser()?.email).toBe('member@daynori.local');
      expect(authAdapter.getCurrentUser()?.workspaceId).toBeNull(); // explicit "workspace not provisioned"
      expect(notified).toBe(true);

      const storedAt = await secureStore.getItemAsync(SEC_KEY_ACCESS_TOKEN);
      expect(storedAt).toBeDefined();

      await authAdapter.signOut();
      expect(authAdapter.isAuthenticated()).toBe(false);
      expect(authAdapter.getCurrentUser()).toBeNull();

      const clearedAt = await secureStore.getItemAsync(SEC_KEY_ACCESS_TOKEN);
      expect(clearedAt).toBeNull();

      unsubscribe();
    });

    it('rejects incorrect password without leaking internal details', async () => {
      await authAdapter.signUp({
        email: 'user2@daynori.local',
        password: 'validPassword123',
      });

      const badRes = await authAdapter.signInWithPassword({
        email: 'user2@daynori.local',
        password: 'wrongPassword999',
      });

      expect(badRes.success).toBe(false);
      expect(badRes.error).toBe('Invalid email or password');
      expect(authAdapter.isAuthenticated()).toBe(false);
    });
  });

  describe('3. Initiated Flow Binding & Anti-Replay Callbacks', () => {
    it('REJECTS unsolicited external callbacks when no flow was initiated', async () => {
      const unsolicitedUrl =
        'daynori://auth-callback?type=auth&token=some_token&nonce=fake_nonce_1';
      const result = await authAdapter.handleDeepLink(unsolicitedUrl);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No initiated authentication flow found');
      expect(authAdapter.isAuthenticated()).toBe(false);
    });

    it('REJECTS callbacks with mismatched state/nonce', async () => {
      // Flow initiated
      authAdapter.initiateAuthFlow('signin');

      // Callback arrives with a different nonce
      const mismatchedUrl = `daynori://auth-callback?type=auth&token=some_token&nonce=different_unseen_nonce`;
      const result = await authAdapter.handleDeepLink(mismatchedUrl);

      expect(result.success).toBe(false);
      expect(result.error).toContain('State or nonce does not match');
      expect(authAdapter.isAuthenticated()).toBe(false);
    });

    it('authenticates session via flow-initiated code exchange', async () => {
      const flow = authAdapter.initiateAuthFlow('signin');

      const validUrl = `daynori://auth-callback?type=auth&code=valid_flow_code&nonce=${flow.nonce}`;
      const result = await authAdapter.handleDeepLink(validUrl);

      expect(result.success).toBe(true);
      expect(authAdapter.isAuthenticated()).toBe(true);
      expect(authAdapter.getCurrentUser()?.email).toBe('flow_user@daynori.local');
    });

    it('ANTI-REPLAY: strictly rejects replayed callback with already processed nonce', async () => {
      const flow = authAdapter.initiateAuthFlow('signin');
      const validUrl = `daynori://auth-callback?type=auth&code=valid_flow_code&nonce=${flow.nonce}`;

      // First presentation succeeds
      const firstRes = await authAdapter.handleDeepLink(validUrl);
      expect(firstRes.success).toBe(true);

      // Second presentation is strictly rejected
      const secondRes = await authAdapter.handleDeepLink(validUrl);
      expect(secondRes.success).toBe(false);
    });

    it('handles provider error callback parameters safely', async () => {
      authAdapter.initiateAuthFlow('signin');
      const errorLink =
        'daynori://auth-callback?type=auth&error=access_denied&error_description=Link+has+expired';
      const result = await authAdapter.handleDeepLink(errorLink);

      expect(result.success).toBe(false);
      expect(result.error).toContain('access_denied');
      expect(authAdapter.isAuthenticated()).toBe(false);
    });

    it('COLD START: preserves pending flow state in OS secure storage across process termination', async () => {
      // 1. Adapter initiates flow (e.g. user initiated sign-up or recovery)
      const flow = await authAdapter.initiateAuthFlowAsync('signup');

      // 2. Process termination simulated: fresh adapter instance with same secureStore and NO in-memory state
      const coldStartAdapter = new MobileProviderAuthAdapter({
        secureStore,
        quarantineManager: quarantine,
        providerClient: mockProvider,
      });

      // 3. User taps email link, opening deep link in fresh app process
      const validUrl = `daynori://auth-callback?type=auth&code=valid_flow_code&nonce=${flow.nonce}`;
      const result = await coldStartAdapter.handleDeepLink(validUrl);

      expect(result.success).toBe(true);
      expect(coldStartAdapter.isAuthenticated()).toBe(true);
      expect(coldStartAdapter.getCurrentUser()?.email).toBe('flow_user@daynori.local');

      // 4. Pending flow state is wiped from secure store on consumption
      const storedAfter = await secureStore.getItemAsync(SEC_KEY_PENDING_FLOW);
      expect(storedAfter).toBeNull();
    });

    it('REJECTS unsolicited raw token callbacks without authorization code exchange', async () => {
      const flow = await authAdapter.initiateAuthFlowAsync('signin');
      const rawTokenUrl = `daynori://auth-callback?type=auth&token=attacker_raw_token&nonce=${flow.nonce}`;
      const result = await authAdapter.handleDeepLink(rawTokenUrl);

      expect(result.success).toBe(false);
      expect(result.error).toContain('unsolicited token logins are forbidden');
      expect(authAdapter.isAuthenticated()).toBe(false);
    });
  });

  describe('4. Secure Storage Failures & Session Restoration', () => {
    it('restores verified session on reboot when provider confirms token', async () => {
      await secureStore.setItemAsync(SEC_KEY_ACCESS_TOKEN, 'valid_mobile_at_persisted_123');
      await secureStore.setItemAsync(SEC_KEY_USER_ID, 'persisted_123');
      await secureStore.setItemAsync(SEC_KEY_USER_EMAIL, 'verified@daynori.local');

      const freshAdapter = new MobileProviderAuthAdapter({
        secureStore,
        providerClient: mockProvider,
        initialAuthenticated: false,
      });

      const restored = await freshAdapter.restoreSession();
      expect(restored).toBe(true);
      expect(freshAdapter.isAuthenticated()).toBe(true);
      expect(freshAdapter.getCurrentUser()?.id).toBe('persisted_123');
    });

    it('REJECTS session restoration when token is expired or revoked by provider', async () => {
      mockProvider.revokedTokens.add('valid_mobile_at_revoked_999');

      await secureStore.setItemAsync(SEC_KEY_ACCESS_TOKEN, 'valid_mobile_at_revoked_999');
      await secureStore.setItemAsync(SEC_KEY_USER_ID, 'revoked_999');

      const freshAdapter = new MobileProviderAuthAdapter({
        secureStore,
        providerClient: mockProvider,
        initialAuthenticated: false,
      });

      const restored = await freshAdapter.restoreSession();
      expect(restored).toBe(false);
      expect(freshAdapter.isAuthenticated()).toBe(false);
      expect(freshAdapter.getCurrentUser()).toBeNull();
    });

    it('FAILED CREDENTIAL DELETION: marks session as revoked so restart cannot restore signed-out account', async () => {
      // Setup active session
      await secureStore.setItemAsync(SEC_KEY_ACCESS_TOKEN, 'valid_mobile_at_user_to_signout');
      await secureStore.setItemAsync(SEC_KEY_USER_ID, 'user_to_signout');
      await authAdapter.restoreSession();
      expect(authAdapter.isAuthenticated()).toBe(true);

      // Simulate secure store deleteItemAsync failure
      const deleteFailStore: SecureStoreContract = {
        async getItemAsync(key: string) {
          return memoryStore.getItemAsync(key);
        },
        async setItemAsync(key: string, value: string) {
          return memoryStore.setItemAsync(key, value);
        },
        async deleteItemAsync(key: string) {
          if (key === SEC_KEY_ACCESS_TOKEN) {
            throw new Error('KeyStore delete hardware lock');
          }
          return memoryStore.deleteItemAsync(key);
        },
      };

      const failingAuthAdapter = new MobileProviderAuthAdapter({
        secureStore: new SecureStorageAdapter(deleteFailStore),
        providerClient: mockProvider,
        initialAuthenticated: true,
      });

      // Sign-out explicitly throws SecureStorageError and marks revoked
      await expect(failingAuthAdapter.signOut()).rejects.toThrow(SecureStorageError);

      // Verify the revoked marker was set
      const revokedFlag = await memoryStore.getItemAsync(SEC_KEY_SESSION_REVOKED);
      expect(revokedFlag).toBe('true');

      // Now simulate a fresh app launch: restoreSession MUST NOT restore the session
      const restartAdapter = new MobileProviderAuthAdapter({
        secureStore,
        providerClient: mockProvider,
        initialAuthenticated: false,
      });

      const restoredAfterRestart = await restartAdapter.restoreSession();
      expect(restoredAfterRestart).toBe(false);
      expect(restartAdapter.isAuthenticated()).toBe(false);
      expect(restartAdapter.getCurrentUser()).toBeNull();
    });
  });

  describe('5. Draft Quarantine & Cross-Account Data Isolation', () => {
    it('quarantines unsent drafts on logout and strictly prevents cross-account exposure', async () => {
      await authAdapter.signUp({
        email: 'user1@daynori.local',
        password: 'passwordUser1',
        displayName: 'User One',
      });
      await authAdapter.signInWithPassword({
        email: 'user1@daynori.local',
        password: 'passwordUser1',
      });
      const user1 = authAdapter.getCurrentUser()!;

      const user1Draft = {
        type: 'task',
        title: 'Secret Personal Plan for User 1',
      };

      await authAdapter.signOut(user1Draft);
      expect(authAdapter.isAuthenticated()).toBe(false);

      // User 2 logs in
      await authAdapter.signUp({
        email: 'user2@daynori.local',
        password: 'passwordUser2',
        displayName: 'User Two',
      });
      await authAdapter.signInWithPassword({
        email: 'user2@daynori.local',
        password: 'passwordUser2',
      });

      // User 2 sees ZERO quarantined drafts
      expect(authAdapter.getQuarantinedDrafts().length).toBe(0);

      // User 1 logs back in
      await authAdapter.signOut();
      await authAdapter.signInWithPassword({
        email: 'user1@daynori.local',
        password: 'passwordUser1',
      });

      // User 1 sees their quarantined draft
      const user1Quarantine = authAdapter.getQuarantinedDrafts();
      expect(user1Quarantine.length).toBe(1);
      expect(user1Quarantine[0]?.userId).toBe(user1.id);
    });
  });

  describe('Mobile Personal Workspace & User Preferences Integration (Phase 10)', () => {
    it('provisions personal workspace, updates currentUser, and persists in KeyStore', async () => {
      await authAdapter.signUp({
        email: 'p10user@daynori.local',
        password: 'passwordP10',
        displayName: 'P10 User',
      });
      await authAdapter.signInWithPassword({
        email: 'p10user@daynori.local',
        password: 'passwordP10',
      });

      expect(authAdapter.getCurrentUser()?.workspaceId).toBeNull();

      const wsId = await authAdapter.provisionPersonalWorkspace();
      expect(wsId).toBeDefined();
      expect(wsId).toContain('ws_personal_');
      expect(authAdapter.getCurrentUser()?.workspaceId).toBe(wsId);

      const storedWsId = await secureStore.getItemAsync(SEC_KEY_WORKSPACE_ID);
      expect(storedWsId).toBe(wsId);
    });

    it('restoreSession restores persisted workspaceId into active session', async () => {
      await secureStore.setItemAsync(SEC_KEY_ACCESS_TOKEN, 'valid_mobile_at_persisted_ws_user');
      await secureStore.setItemAsync(SEC_KEY_USER_ID, 'persisted_ws_user');
      await secureStore.setItemAsync(SEC_KEY_USER_EMAIL, 'ws_persisted@daynori.local');
      await secureStore.setItemAsync(SEC_KEY_WORKSPACE_ID, 'ws_personal_persisted_ws_user');

      const freshAdapter = new MobileProviderAuthAdapter({
        secureStore,
        quarantineManager: defaultDraftQuarantine,
        providerClient: mockProvider,
      });

      const restored = await freshAdapter.restoreSession();
      expect(restored).toBe(true);
      expect(freshAdapter.getCurrentUser()?.workspaceId).toBe('ws_personal_persisted_ws_user');
    });

    it('getPreferences and updatePreferences communicate through adapter', async () => {
      await authAdapter.signUp({
        email: 'prefuser@daynori.local',
        password: 'passwordP10',
        displayName: 'Pref User',
      });
      await authAdapter.signInWithPassword({
        email: 'prefuser@daynori.local',
        password: 'passwordP10',
      });

      const prefs = await authAdapter.getPreferences();
      expect(prefs).toBeDefined();
      expect(prefs?.timeZone).toBe('UTC');
      expect(prefs?.weekStart).toBe('monday');

      const updated = await authAdapter.updatePreferences({
        timeZone: 'Asia/Tokyo',
        weekStart: 'sunday',
        expectedRevision: 1,
      });

      expect(updated?.timeZone).toBe('Asia/Tokyo');
      expect(updated?.weekStart).toBe('sunday');
      expect(updated?.revision).toBe(2);
    });

    it('signOut purges persisted workspaceId and previous account state', async () => {
      await authAdapter.signUp({
        email: 'signoutuser@daynori.local',
        password: 'passwordP10',
        displayName: 'Signout User',
      });
      await authAdapter.signInWithPassword({
        email: 'signoutuser@daynori.local',
        password: 'passwordP10',
      });
      await authAdapter.provisionPersonalWorkspace();
      expect(await secureStore.getItemAsync(SEC_KEY_WORKSPACE_ID)).toBeTruthy();

      await authAdapter.signOut();
      expect(authAdapter.isAuthenticated()).toBe(false);
      expect(authAdapter.getCurrentUser()).toBeNull();

      const storedWs = await secureStore.getItemAsync(SEC_KEY_WORKSPACE_ID);
      expect(storedWs).toBeNull();
    });
  });
});
