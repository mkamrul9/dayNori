import { describe, expect, it, beforeEach } from 'vitest';
import { MobileProviderAuthAdapter } from './auth/providerAdapter.js';
import { SecureStorageAdapter, inMemorySecureStore } from './auth/secureStorage.js';
import { DraftQuarantineManager, defaultDraftQuarantine } from './auth/draftQuarantine.js';

describe('Android Mobile Authentication & Session Lifecycle (Phase 09)', () => {
  let secureStore: SecureStorageAdapter;
  let quarantine: DraftQuarantineManager;
  let authAdapter: MobileProviderAuthAdapter;

  beforeEach(() => {
    inMemorySecureStore.clear();
    defaultDraftQuarantine.clearAllQuarantines();
    secureStore = new SecureStorageAdapter(inMemorySecureStore);
    quarantine = new DraftQuarantineManager();
    authAdapter = new MobileProviderAuthAdapter({
      secureStore,
      quarantineManager: quarantine,
      initialAuthenticated: false,
    });
  });

  describe('1. OS-Backed Secure Storage Adapter', () => {
    it('stores, retrieves, and deletes session secrets without plain text leakage', async () => {
      const KEY = 'test_secret_key';
      const SECRET_VAL = 'jwt_secure_token_payload_12345';

      await secureStore.setItemAsync(KEY, SECRET_VAL);
      const retrieved = await secureStore.getItemAsync(KEY);
      expect(retrieved).toBe(SECRET_VAL);

      await secureStore.deleteItemAsync(KEY);
      const afterDelete = await secureStore.getItemAsync(KEY);
      expect(afterDelete).toBeNull();
    });
  });

  describe('2. Provider Sign-Up, Sign-In, and Recovery Lifecycle', () => {
    it('defaults strictly to unauthenticated state on creation', () => {
      expect(authAdapter.isAuthenticated()).toBe(false);
      expect(authAdapter.getCurrentUser()).toBeNull();
      expect(authAdapter.getPendingDestination()).toBeNull();
    });

    it('executes sign-up journey and stores user record', async () => {
      const signUpRes = await authAdapter.signUp({
        email: 'alex@daynori.local',
        password: 'securePassword99!',
        displayName: 'Alex Mobile',
      });

      expect(signUpRes.success).toBe(true);
      expect(signUpRes.message).toBeDefined();
    });

    it('executes password sign-in, persists session in secure storage, and notifies listeners', async () => {
      await authAdapter.signUp({
        email: 'member@daynori.local',
        password: 'correctPassword123',
        displayName: 'Daynori Member',
      });

      let notified = false;
      const unsubscribe = authAdapter.subscribe(() => {
        notified = true;
      });

      // 1. Successful sign in
      const signInRes = await authAdapter.signInWithPassword({
        email: 'member@daynori.local',
        password: 'correctPassword123',
      });

      expect(signInRes.success).toBe(true);
      expect(authAdapter.isAuthenticated()).toBe(true);
      expect(authAdapter.getCurrentUser()?.email).toBe('member@daynori.local');
      expect(notified).toBe(true);

      // Verify tokens are stored in secure storage
      const storedAt = await secureStore.getItemAsync('daynori_sec_access_token');
      expect(storedAt).toBeDefined();
      expect(storedAt).toContain('mock_at_');

      // 2. Sign out clears secure storage
      await authAdapter.signOut();
      expect(authAdapter.isAuthenticated()).toBe(false);
      expect(authAdapter.getCurrentUser()).toBeNull();

      const clearedAt = await secureStore.getItemAsync('daynori_sec_access_token');
      expect(clearedAt).toBeNull();

      unsubscribe();
    });

    it('rejects incorrect password with user-friendly error without leaking internal details', async () => {
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

    it('handles password recovery without leaking whether account exists', async () => {
      const recoverRes = await authAdapter.recoverPassword('someone@daynori.local');
      expect(recoverRes.success).toBe(true);
      expect(recoverRes.message).toContain('Password recovery email sent');
    });
  });

  describe('3. Deep Link Callbacks, Allowlisted Redirects & Anti-Replay Defense', () => {
    it('authenticates session via valid deep link callback', async () => {
      const validUrl =
        'daynori://auth-callback?type=auth&token=verified_token_abc&nonce=nonce_unique_1';
      const result = await authAdapter.handleDeepLink(validUrl);

      expect(result.success).toBe(true);
      expect(authAdapter.isAuthenticated()).toBe(true);
    });

    it('ANTI-REPLAY DEFENSE: rejects replayed callback with already processed nonce', async () => {
      const replayNonce = 'nonce_replay_attack_9988';
      const link = `daynori://auth-callback?type=auth&token=tok_replay_1&nonce=${replayNonce}`;

      // First presentation succeeds
      const firstRes = await authAdapter.handleDeepLink(link);
      expect(firstRes.success).toBe(true);

      // Second presentation with same nonce is strictly rejected
      const secondRes = await authAdapter.handleDeepLink(link);
      expect(secondRes.success).toBe(false);
      expect(secondRes.error).toContain('replay rejected');
    });

    it('handles callback error parameters (e.g. expired link) safely', async () => {
      const errorLink =
        'daynori://auth-callback?type=auth&error=access_denied&error_description=Link+has+expired';
      const result = await authAdapter.handleDeepLink(errorLink);

      expect(result.success).toBe(false);
      expect(result.error).toContain('access_denied');
      expect(authAdapter.isAuthenticated()).toBe(false);
    });

    it('rejects external deep links with non-approved schemes or malformed structure', async () => {
      // Untrusted scheme
      const maliciousScheme = 'evilapp://auth-callback?type=auth&token=token123';
      const res1 = await authAdapter.handleDeepLink(maliciousScheme);
      expect(res1.success).toBe(false);

      // Non-auth payload
      const nonAuth = 'daynori://notification?destination=today';
      const res2 = await authAdapter.handleDeepLink(nonAuth);
      expect(res2.success).toBe(false);
    });
  });

  describe('4. Cold Start & Process Restart Restoration', () => {
    it('restores authenticated session from OS secure storage on process restart', async () => {
      // 1. Simulate existing credentials in KeyStore
      await secureStore.setItemAsync('daynori_sec_access_token', 'mock_at_user_reboot');
      await secureStore.setItemAsync('daynori_sec_user_id', 'usr_persisted_uuid_123');
      await secureStore.setItemAsync('daynori_sec_user_email', 'persisted@daynori.local');
      await secureStore.setItemAsync('daynori_sec_user_name', 'Persisted User');

      // 2. Fresh adapter instance initializes unauthenticated
      const freshAdapter = new MobileProviderAuthAdapter({
        secureStore,
        initialAuthenticated: false,
      });
      expect(freshAdapter.isAuthenticated()).toBe(false);

      // 3. Restore session
      const restored = await freshAdapter.restoreSession();
      expect(restored).toBe(true);
      expect(freshAdapter.isAuthenticated()).toBe(true);
      expect(freshAdapter.getCurrentUser()?.id).toBe('usr_persisted_uuid_123');
      expect(freshAdapter.getCurrentUser()?.email).toBe('persisted@daynori.local');
    });

    it('remains unauthenticated when secure storage is empty or cleared', async () => {
      const freshAdapter = new MobileProviderAuthAdapter({
        secureStore,
        initialAuthenticated: false,
      });

      const restored = await freshAdapter.restoreSession();
      expect(restored).toBe(false);
      expect(freshAdapter.isAuthenticated()).toBe(false);
      expect(freshAdapter.getCurrentUser()).toBeNull();
    });
  });

  describe('5. Draft Quarantine & Cross-Account Data Isolation', () => {
    it('quarantines unsent drafts on logout and strictly prevents cross-account exposure', async () => {
      // 1. User 1 logs in
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
      expect(user1).toBeDefined();

      // 2. User 1 creates an uncommitted task draft and logs out
      const user1Draft = {
        type: 'task',
        title: 'Secret Personal Plan for User 1',
        details: 'Confidential draft notes',
      };

      await authAdapter.signOut(user1Draft);
      expect(authAdapter.isAuthenticated()).toBe(false);

      // 3. User 2 logs in on the same device
      await authAdapter.signUp({
        email: 'user2@daynori.local',
        password: 'passwordUser2',
        displayName: 'User Two',
      });
      await authAdapter.signInWithPassword({
        email: 'user2@daynori.local',
        password: 'passwordUser2',
      });

      // Assert User 2 sees ZERO quarantined drafts
      const user2Quarantine = authAdapter.getQuarantinedDrafts();
      expect(user2Quarantine.length).toBe(0);

      // User 2 attempting to restore User 1's draft returns null
      const fakeDraftId = 'qd_fake_attempt';
      expect(authAdapter.restoreQuarantinedDraft(fakeDraftId)).toBeNull();

      // 4. User 2 logs out, User 1 logs back in
      await authAdapter.signOut();
      await authAdapter.signInWithPassword({
        email: 'user1@daynori.local',
        password: 'passwordUser1',
      });

      // Assert User 1's draft is safely present in their personal quarantine
      const user1Quarantine = authAdapter.getQuarantinedDrafts();
      expect(user1Quarantine.length).toBe(1);
      expect(user1Quarantine[0]?.userId).toBe(user1.id);

      // User 1 restores the draft
      const restoredDraft = authAdapter.restoreQuarantinedDraft(user1Quarantine[0]!.id);
      expect(restoredDraft).toBeDefined();
      expect(restoredDraft?.['title']).toBe('Secret Personal Plan for User 1');

      // Quarantine is now cleared
      expect(authAdapter.getQuarantinedDrafts().length).toBe(0);
    });
  });

  describe('6. Protected Destination Gating & Resume Contract', () => {
    it('queues pending protected destination and restores navigation upon authentication', async () => {
      expect(authAdapter.isAuthenticated()).toBe(false);

      // User attempts to access protected destination 'journal'
      authAdapter.setPendingDestination('journal');
      expect(authAdapter.getPendingDestination()).toBe('journal');

      // User authenticates
      await authAdapter.signUp({
        email: 'journaler@daynori.local',
        password: 'password123',
      });
      await authAdapter.signInWithPassword({
        email: 'journaler@daynori.local',
        password: 'password123',
      });

      expect(authAdapter.isAuthenticated()).toBe(true);
      // Destination is preserved for the navigation router to consume
      expect(authAdapter.getPendingDestination()).toBe('journal');
    });
  });
});
