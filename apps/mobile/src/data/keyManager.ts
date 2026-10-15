import type { SecureStoreContract } from '../auth/secureStorage.js';
import { StorageKeyError } from '@daynori/sync';

export interface MobileKeyManagerOptions {
  secureStore: SecureStoreContract;
  keyPrefix?: string;
}

export class MobileKeyManager {
  private secureStore: SecureStoreContract;
  private keyPrefix: string;
  private inFlightInit = new Map<string, Promise<string>>();

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

  getWorkspacesIndexAlias(userId: string): string {
    return `${this.keyPrefix}_workspaces_${userId}`;
  }

  private validateKeyFormat(key: string): void {
    if (!/^[0-9a-fA-F]{64}$/.test(key)) {
      throw new StorageKeyError(
        'INVALID_KEY_FORMAT: Encryption key must be a 64-character hex string.'
      );
    }
  }

  private async recordWorkspaceForUser(userId: string, workspaceId: string): Promise<void> {
    const indexAlias = this.getWorkspacesIndexAlias(userId);
    let workspaces: string[] = [];
    try {
      const raw = await this.secureStore.getItemAsync(indexAlias);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          workspaces = parsed;
        }
      }
    } catch {
      workspaces = [];
    }

    if (!workspaces.includes(workspaceId)) {
      workspaces.push(workspaceId);
      await this.secureStore.setItemAsync(indexAlias, JSON.stringify(workspaces));
    }
  }

  /**
   * Checks whether an encryption key already exists in secure storage.
   */
  async hasKey(userId: string, workspaceId: string): Promise<boolean> {
    const alias = this.getStorageKeyAlias(userId, workspaceId);
    const existing = await this.secureStore.getItemAsync(alias);
    return existing !== null && existing.length > 0;
  }

  /**
   * Retrieves an existing database encryption key or generates a new
   * high-entropy 256-bit key for first initialization.
   *
   * Serializes concurrent initialization calls for the same alias to prevent
   * racing key creation.
   */
  async getOrCreateKey(userId: string, workspaceId: string): Promise<string> {
    const alias = this.getStorageKeyAlias(userId, workspaceId);

    const existingPromise = this.inFlightInit.get(alias);
    if (existingPromise) {
      return existingPromise;
    }

    const initPromise = (async () => {
      try {
        const existing = await this.secureStore.getItemAsync(alias);
        if (existing) {
          this.validateKeyFormat(existing);
          await this.recordWorkspaceForUser(userId, workspaceId);
          return existing;
        }

        // Generate fresh 256-bit (32 bytes) cryptographically secure key
        const rawBytes = new Uint8Array(32);
        if (typeof globalThis.crypto?.getRandomValues === 'function') {
          globalThis.crypto.getRandomValues(rawBytes);
        } else {
          // Dynamic import for Node.js test environments; avoid breaking mobile bundler
          const cryptoModule = await (async () => {
            try {
              return await import('node:crypto');
            } catch {
              return null;
            }
          })();
          if (cryptoModule?.randomFillSync) {
            cryptoModule.randomFillSync(rawBytes);
          } else {
            throw new StorageKeyError(
              'NO_SECURE_RANDOM: Cryptographically secure random generator is unavailable.'
            );
          }
        }

        const hexKey = Array.from(rawBytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

        this.validateKeyFormat(hexKey);
        await this.secureStore.setItemAsync(alias, hexKey);
        await this.recordWorkspaceForUser(userId, workspaceId);
        return hexKey;
      } finally {
        this.inFlightInit.delete(alias);
      }
    })();

    this.inFlightInit.set(alias, initPromise);
    return initPromise;
  }

  /**
   * Retrieves the stored key without generating a replacement.
   * Throws StorageKeyError if missing or invalid.
   */
  async requireExistingKey(userId: string, workspaceId: string): Promise<string> {
    const alias = this.getStorageKeyAlias(userId, workspaceId);
    const existing = await this.secureStore.getItemAsync(alias);
    if (!existing) {
      throw new StorageKeyError(
        'KEY_NOT_FOUND: Encryption key for this account/workspace is missing from secure storage.'
      );
    }
    this.validateKeyFormat(existing);
    return existing;
  }

  /**
   * Alias for requireExistingKey.
   */
  async getKey(userId: string, workspaceId: string): Promise<string> {
    return this.requireExistingKey(userId, workspaceId);
  }

  /**
   * Deletes the encryption key for this workspace (e.g. on workspace data erasure
   * or simulating key loss).
   */
  async deleteKey(userId: string, workspaceId: string): Promise<void> {
    const alias = this.getStorageKeyAlias(userId, workspaceId);
    await this.secureStore.deleteItemAsync(alias);

    // Update persisted index
    const indexAlias = this.getWorkspacesIndexAlias(userId);
    try {
      const raw = await this.secureStore.getItemAsync(indexAlias);
      if (raw) {
        const workspaces: string[] = JSON.parse(raw);
        const filtered = workspaces.filter((w) => w !== workspaceId);
        await this.secureStore.setItemAsync(indexAlias, JSON.stringify(filtered));
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Clears all encryption keys associated with an account across all its workspaces.
   * Durable across process restarts by reading the persisted workspaces index.
   */
  async clearAccountKeys(userId: string): Promise<void> {
    const indexAlias = this.getWorkspacesIndexAlias(userId);
    let workspaces: string[] = [];
    try {
      const raw = await this.secureStore.getItemAsync(indexAlias);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          workspaces = parsed;
        }
      }
    } catch {
      /* ignore */
    }

    for (const wsId of workspaces) {
      const alias = this.getStorageKeyAlias(userId, wsId);
      await this.secureStore.deleteItemAsync(alias);
    }
    await this.secureStore.deleteItemAsync(indexAlias);
  }

  /**
   * For testing wrong-key failure behavior: overwrites key with a wrong key.
   */
  async setCorruptedKey(userId: string, workspaceId: string, fakeKey: string): Promise<void> {
    this.validateKeyFormat(fakeKey);
    const alias = this.getStorageKeyAlias(userId, workspaceId);
    await this.secureStore.setItemAsync(alias, fakeKey);
    await this.recordWorkspaceForUser(userId, workspaceId);
  }
}
