/**
 * OS-Backed Secure Storage Adapter for Daynori Mobile
 *
 * Implements persistent secure secret storage:
 * - Uses platform-protected storage (Android KeyStore / iOS Keychain via expo-secure-store).
 * - Never persists session tokens in AsyncStorage, unencrypted SQLite, or plain files.
 * - Restricts in-memory storage strictly to explicit test environments (NODE_ENV === 'test').
 * - Propagates actionable SecureStorageError on storage or native module failures.
 * - Never logs or exposes raw token contents in error messages.
 */

export interface SecureStoreContract {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export class SecureStorageError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'SecureStorageError';
    this.cause = cause;
  }
}

export class InMemorySecureStore implements SecureStoreContract {
  private store = new Map<string, string>();

  async getItemAsync(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async deleteItemAsync(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// In-memory fallback instance strictly for test runners
export const inMemorySecureStore = new InMemorySecureStore();

export class SecureStorageAdapter implements SecureStoreContract {
  private nativeStore: SecureStoreContract | null = null;
  private memoryStore: InMemorySecureStore | null = null;

  constructor(customStore?: SecureStoreContract) {
    if (customStore) {
      this.nativeStore = customStore;
      return;
    }

    // In unit test runners, allow memory store fallback only when NODE_ENV === 'test'
    if (process.env['NODE_ENV'] === 'test') {
      this.memoryStore = inMemorySecureStore;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SecureStore = require('expo-secure-store');
      if (SecureStore && typeof SecureStore.getItemAsync === 'function') {
        this.nativeStore = SecureStore as SecureStoreContract;
      }
    } catch {
      this.nativeStore = null;
    }
  }

  async getItemAsync(key: string): Promise<string | null> {
    if (this.nativeStore) {
      try {
        return await this.nativeStore.getItemAsync(key);
      } catch (err) {
        throw new SecureStorageError(`Failed to read from secure storage: key [${key}]`, err);
      }
    }
    if (this.memoryStore) {
      return this.memoryStore.getItemAsync(key);
    }
    throw new SecureStorageError(
      'Native secure storage (expo-secure-store) is unavailable in current runtime'
    );
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    if (this.nativeStore) {
      try {
        await this.nativeStore.setItemAsync(key, value);
        return;
      } catch (err) {
        throw new SecureStorageError(`Failed to write to secure storage: key [${key}]`, err);
      }
    }
    if (this.memoryStore) {
      await this.memoryStore.setItemAsync(key, value);
      return;
    }
    throw new SecureStorageError(
      'Native secure storage (expo-secure-store) is unavailable in current runtime'
    );
  }

  async deleteItemAsync(key: string): Promise<void> {
    if (this.nativeStore) {
      try {
        await this.nativeStore.deleteItemAsync(key);
        return;
      } catch (err) {
        throw new SecureStorageError(`Failed to delete from secure storage: key [${key}]`, err);
      }
    }
    if (this.memoryStore) {
      await this.memoryStore.deleteItemAsync(key);
      return;
    }
    throw new SecureStorageError(
      'Native secure storage (expo-secure-store) is unavailable in current runtime'
    );
  }
}

export const defaultSecureStorage = new SecureStorageAdapter();
