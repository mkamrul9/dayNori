import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StorageKeyError } from '@daynori/sync';
import type { SecureStoreContract } from '../auth/secureStorage.js';
import { MobileKeyManager } from './keyManager.js';
import { fillSecureRandomBytes, setSecureRandomProviderForTests } from './secureRandom.js';

class MemorySecureStore implements SecureStoreContract {
  store = new Map<string, string>();
  failGetKeys = new Set<string>();
  failSetKeys = new Set<string>();

  async getItemAsync(key: string): Promise<string | null> {
    if (this.failGetKeys.has(key)) {
      throw new Error('simulated secure-store read failure');
    }
    return this.store.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    if (this.failSetKeys.has(key)) {
      throw new Error('simulated secure-store write failure');
    }
    this.store.set(key, value);
  }

  async deleteItemAsync(key: string): Promise<void> {
    this.store.delete(key);
  }
}

function fixedProvider(fill: number): (n: number) => Promise<Uint8Array> {
  return async (n) => {
    const bytes = new Uint8Array(n);
    bytes.fill(fill);
    return bytes;
  };
}

describe('MobileKeyManager + secureRandom fail-closed behavior', () => {
  const user1 = 'usr_alice_001';
  const user2 = 'usr_bob_002';
  const ws1 = 'ws_11111111-1111-1111-1111-111111111111';
  const ws2 = 'ws_22222222-2222-2222-2222-222222222222';

  let secureStore: MemorySecureStore;
  let keyManager: MobileKeyManager;

  beforeEach(() => {
    secureStore = new MemorySecureStore();
    keyManager = new MobileKeyManager(secureStore);
    setSecureRandomProviderForTests(fixedProvider(0xab));
  });

  afterEach(() => {
    setSecureRandomProviderForTests(null);
  });

  it('initializes a 256-bit hex key on first use and reuses it', async () => {
    const key = await keyManager.getOrCreateKey(user1, ws1);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe('ab'.repeat(32));
    expect(await keyManager.getOrCreateKey(user1, ws1)).toBe(key);
  });

  it('fails closed when no CSPRNG is available', async () => {
    setSecureRandomProviderForTests(async () => {
      throw new StorageKeyError(
        'NO_SECURE_RANDOM: Cryptographically secure random generator is unavailable.'
      );
    });
    await expect(keyManager.getOrCreateKey(user1, ws1)).rejects.toThrow(/NO_SECURE_RANDOM/);
    expect(secureStore.store.size).toBe(0);
  });

  it('rejects short provider output without persisting a key', async () => {
    setSecureRandomProviderForTests(async () => new Uint8Array(8));
    await expect(keyManager.getOrCreateKey(user1, ws1)).rejects.toThrow(/NO_SECURE_RANDOM/);
    expect(secureStore.store.size).toBe(0);
  });

  it('rejects provider errors without deleting unrelated keys', async () => {
    const kept = await keyManager.getOrCreateKey(user1, ws2);
    setSecureRandomProviderForTests(async () => {
      throw new Error('provider exploded');
    });
    await expect(keyManager.getOrCreateKey(user1, ws1)).rejects.toThrow(/provider exploded|NO_SECURE_RANDOM/);
    expect(await keyManager.requireExistingKey(user1, ws2)).toBe(kept);
  });

  it('serializes concurrent first-time initialization for one alias', async () => {
    let calls = 0;
    setSecureRandomProviderForTests(async (n) => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return fixedProvider(0xcd)(n);
    });
    const [a, b] = await Promise.all([
      keyManager.getOrCreateKey(user1, ws1),
      keyManager.getOrCreateKey(user1, ws1),
    ]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });

  it('isolates keys across users and workspaces', async () => {
    setSecureRandomProviderForTests(async (n) => {
      const bytes = new Uint8Array(n);
      bytes[0] = secureStore.store.size + 1;
      return bytes;
    });
    const a = await keyManager.getOrCreateKey(user1, ws1);
    const b = await keyManager.getOrCreateKey(user1, ws2);
    const c = await keyManager.getOrCreateKey(user2, ws1);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('preserves a valid existing key when workspace index write fails', async () => {
    const key = await keyManager.getOrCreateKey(user1, ws1);
    const indexAlias = keyManager.getWorkspacesIndexAlias(user1);
    // Force a second workspace so recordWorkspaceForUser attempts a set.
    secureStore.failSetKeys.add(indexAlias);
    // Clear index membership so the next call tries to rewrite the index.
    secureStore.store.set(indexAlias, JSON.stringify([]));

    const reused = await keyManager.getOrCreateKey(user1, ws1);
    expect(reused).toBe(key);
    expect(await keyManager.requireExistingKey(user1, ws1)).toBe(key);
  });

  it('does not delete a valid key when secure-store index fails after first write', async () => {
    const indexAlias = keyManager.getWorkspacesIndexAlias(user1);
    secureStore.failSetKeys.add(indexAlias);
    const key = await keyManager.getOrCreateKey(user1, ws1);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(await keyManager.requireExistingKey(user1, ws1)).toBe(key);
  });

  it('surfaces secure-store read failures distinctly from missing keys', async () => {
    const alias = keyManager.getStorageKeyAlias(user1, ws1);
    secureStore.failGetKeys.add(alias);
    await expect(keyManager.getOrCreateKey(user1, ws1)).rejects.toThrow(/SECURE_STORE_READ_FAILED/);
  });

  it('surfaces secure-store write failures without leaving a partial success path for callers', async () => {
    const alias = keyManager.getStorageKeyAlias(user1, ws1);
    secureStore.failSetKeys.add(alias);
    await expect(keyManager.getOrCreateKey(user1, ws1)).rejects.toThrow(/SECURE_STORE_WRITE_FAILED/);
    expect(secureStore.store.has(alias)).toBe(false);
  });

  it('refuses invalid existing key format without deleting or regenerating', async () => {
    const alias = keyManager.getStorageKeyAlias(user1, ws1);
    secureStore.store.set(alias, 'not-a-valid-key');
    await expect(keyManager.getOrCreateKey(user1, ws1)).rejects.toThrow(/INVALID_KEY_FORMAT/);
    expect(secureStore.store.get(alias)).toBe('not-a-valid-key');
  });

  it('requireExistingKey fails closed when key is missing', async () => {
    await expect(keyManager.requireExistingKey(user1, ws1)).rejects.toThrow(/KEY_NOT_FOUND/);
  });

  it('fillSecureRandomBytes accepts injected provider byte counts only when sufficient', async () => {
    setSecureRandomProviderForTests(async () => new Uint8Array(32));
    const target = new Uint8Array(32);
    await fillSecureRandomBytes(target);
    expect(target.length).toBe(32);

    setSecureRandomProviderForTests(async () => new Uint8Array(4));
    await expect(fillSecureRandomBytes(new Uint8Array(32))).rejects.toThrow(/NO_SECURE_RANDOM/);
  });
});
