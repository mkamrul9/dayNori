import type { SecureStoreContract } from '../auth/secureStorage.js';
import { StorageKeyError } from '@daynori/sync';

export interface MobileKeyManagerOptions {
  secureStore: SecureStoreContract;
  keyPrefix?: string;
}

export class MobileKeyManager {
  private secureStore: SecureStoreContract;
  private keyPrefix: string;
  private knownAccountKeys = new Map<string, Set<string>>();

  constructor(optionsOrSecureStore: MobileKeyManagerOptions | SecureStoreContract) {
    if ('secureStore' in optionsOrSecureStore) {
      this.secureStore = optionsOrSecureStore.secureStore;
      this.keyPrefix = optionsOrSecureStore.keyPrefix || 'daynori_sqlite_key';
    } else {
      this.secureStore = optionsOrSecureStore;
      this.keyPrefix = 'daynori_sqlite_key';
    }
  }

  getStorageKeyAlias(userId: string, workspaceId: string): string {
    return `${this.keyPrefix}_${userId}_${workspaceId}`;
  }

  /**
   * Retrieves an existing database encryption key or generates a new
   * high-entropy 256-bit key for first initialization.
   */
  async getOrCreateKey(userId: string, workspaceId: string): Promise<string> {
    if (!this.knownAccountKeys.has(userId)) {
      this.knownAccountKeys.set(userId, new Set());
    }
    this.knownAccountKeys.get(userId)!.add(workspaceId);

    const alias = this.getStorageKeyAlias(userId, workspaceId);
    const existing = await this.secureStore.getItemAsync(alias);
    if (existing) {
      return existing;
    }

    // Generate fresh 256-bit (32 bytes) cryptographically secure key
    const rawBytes = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(rawBytes);
    } else {
      // Node.js fallback for tests
      const nodeCrypto = await import('node:crypto');
      nodeCrypto.randomFillSync(rawBytes);
    }

    const hexKey = Array.from(rawBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    await this.secureStore.setItemAsync(alias, hexKey);
    return hexKey;
  }

  /**
   * Retrieves the stored key without generating a replacement.
   * Throws StorageKeyError if missing.
   */
  async requireExistingKey(userId: string, workspaceId: string): Promise<string> {
    const alias = this.getStorageKeyAlias(userId, workspaceId);
    const existing = await this.secureStore.getItemAsync(alias);
    if (!existing) {
      throw new StorageKeyError(
        'KEY_NOT_FOUND: Encryption key for this account/workspace is missing from secure storage.'
      );
    }
    return existing;
  }

  /**
   * Alias for requireExistingKey.
   */
  async getKey(userId: string, workspaceId: string): Promise<string> {
    return this.requireExistingKey(userId, workspaceId);
  }

  /**
   * Deletes the encryption key for this workspace (e.g. on full account erasure
   * or simulating key loss).
   */
  async deleteKey(userId: string, workspaceId: string): Promise<void> {
    const alias = this.getStorageKeyAlias(userId, workspaceId);
    await this.secureStore.deleteItemAsync(alias);
    this.knownAccountKeys.get(userId)?.delete(workspaceId);
  }

  /**
   * Clears all encryption keys associated with an account across all its workspaces.
   */
  async clearAccountKeys(userId: string): Promise<void> {
    const wsSet = this.knownAccountKeys.get(userId);
    if (wsSet) {
      for (const wsId of wsSet) {
        const alias = this.getStorageKeyAlias(userId, wsId);
        await this.secureStore.deleteItemAsync(alias);
      }
      this.knownAccountKeys.delete(userId);
    }
  }

  /**
   * For testing wrong-key failure behavior: overwrites key with a wrong key.
   */
  async setCorruptedKey(userId: string, workspaceId: string, fakeKey: string): Promise<void> {
    const alias = this.getStorageKeyAlias(userId, workspaceId);
    await this.secureStore.setItemAsync(alias, fakeKey);
  }
}
