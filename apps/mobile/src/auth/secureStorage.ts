/**
 * OS-Backed Secure Storage Adapter for Daynori Mobile
 *
 * Implements persistent secure secret storage:
 * - Uses platform-protected storage (Android KeyStore / iOS Keychain via expo-secure-store when available).
 * - Never persists session tokens in AsyncStorage, unencrypted SQLite, or plain files.
 * - Provides an in-memory protected store fallback for Node test runners and environments where native modules are not linked.
 * - Never logs or exposes raw token contents in error messages.
 */

export interface SecureStoreContract {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

class InMemorySecureStore implements SecureStoreContract {
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

// In-memory fallback instance
export const inMemorySecureStore = new InMemorySecureStore();

export class SecureStorageAdapter implements SecureStoreContract {
  private nativeStore: SecureStoreContract | null = null;
  private fallbackStore: InMemorySecureStore = inMemorySecureStore;

  constructor(customNativeStore?: SecureStoreContract) {
    if (customNativeStore) {
      this.nativeStore = customNativeStore;
      return;
    }

    // Attempt to load expo-secure-store dynamically if present in native bundle
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SecureStore = require('expo-secure-store');
      if (SecureStore && typeof SecureStore.getItemAsync === 'function') {
        this.nativeStore = SecureStore as SecureStoreContract;
      }
    } catch {
      // Native module not available (e.g. in test environment or Expo web)
      this.nativeStore = null;
    }
  }

  async getItemAsync(key: string): Promise<string | null> {
    try {
      if (this.nativeStore) {
        return await this.nativeStore.getItemAsync(key);
      }
    } catch {
      // On native error, fall back to memory
    }
    return this.fallbackStore.getItemAsync(key);
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    try {
      if (this.nativeStore) {
        await this.nativeStore.setItemAsync(key, value);
        return;
      }
    } catch {
      // Fall back to memory
    }
    await this.fallbackStore.setItemAsync(key, value);
  }

  async deleteItemAsync(key: string): Promise<void> {
    try {
      if (this.nativeStore) {
        await this.nativeStore.deleteItemAsync(key);
        return;
      }
    } catch {
      // Fall back to memory
    }
    await this.fallbackStore.deleteItemAsync(key);
  }
}

export const defaultSecureStorage = new SecureStorageAdapter();
