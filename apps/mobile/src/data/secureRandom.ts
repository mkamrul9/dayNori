/**
 * Device-safe CSPRNG for SQLCipher key material.
 * Prefer linked expo-crypto `getRandomBytesAsync` (not the sync getRandomBytes
 * development fallback). Avoid react-native-get-random-values when ExpoCrypto is
 * stubbed but unlinked (it throws before other fallbacks).
 */
import { NativeModules } from 'react-native';
import { StorageKeyError } from '@daynori/sync';

/** Injectable CSPRNG for unit tests only. Production paths leave this unset. */
export type SecureRandomProvider = (byteLength: number) => Promise<Uint8Array>;

let injectedProvider: SecureRandomProvider | null = null;

/** Test-only: install a deterministic or failing RNG. Pass null to clear. */
export function setSecureRandomProviderForTests(provider: SecureRandomProvider | null): void {
  injectedProvider = provider;
}

function decodeBase64ToBytes(b64: string, target: Uint8Array): void {
  const atobFn = (globalThis as { atob?: (data: string) => string }).atob;
  if (typeof atobFn !== 'function') {
    throw new StorageKeyError('NO_SECURE_RANDOM: base64 decoder unavailable.');
  }
  const bin = atobFn(b64);
  if (bin.length < target.length) {
    throw new StorageKeyError('NO_SECURE_RANDOM: insufficient random bytes.');
  }
  for (let i = 0; i < target.length; i += 1) {
    target[i] = bin.charCodeAt(i) & 0xff;
  }
}

function randomBase64FromNative(byteLength: number): string | null {
  const rn = NativeModules as {
    RNGetRandomValues?: { getRandomBase64?: (n: number) => string };
    ExpoRandom?: { getRandomBase64String?: (n: number) => string };
  };
  if (typeof rn.RNGetRandomValues?.getRandomBase64 === 'function') {
    return rn.RNGetRandomValues.getRandomBase64(byteLength);
  }
  if (typeof rn.ExpoRandom?.getRandomBase64String === 'function') {
    return rn.ExpoRandom.getRandomBase64String(byteLength);
  }
  const expoMods = (
    globalThis as {
      ExpoModules?: { ExpoRandom?: { getRandomBase64String?: (n: number) => string } };
    }
  ).ExpoModules;
  if (typeof expoMods?.ExpoRandom?.getRandomBase64String === 'function') {
    return expoMods.ExpoRandom.getRandomBase64String(byteLength);
  }
  return null;
}

function acceptProviderBytes(bytes: Uint8Array, target: Uint8Array): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < target.length) {
    throw new StorageKeyError(
      `NO_SECURE_RANDOM: provider returned ${bytes?.byteLength ?? 0} bytes; expected ${target.length}.`
    );
  }
  target.set(bytes.subarray(0, target.length));
}

/** Fill `target` with cryptographically secure random bytes. Fail closed. */
export async function fillSecureRandomBytes(target: Uint8Array): Promise<void> {
  if (injectedProvider) {
    const bytes = await injectedProvider(target.length);
    acceptProviderBytes(bytes, target);
    return;
  }

  // Prefer linked expo-crypto async API when present in the Dev Client / release binary.
  // Unlinked stubs, missing __DEV__, and host Vitest imports must fall through — not
  // fail closed — so WebCrypto / native modules can still succeed.
  try {
    const ExpoCrypto = await import('expo-crypto');
    if (typeof ExpoCrypto.getRandomBytesAsync === 'function') {
      const bytes = await ExpoCrypto.getRandomBytesAsync(target.length);
      acceptProviderBytes(bytes, target);
      return;
    }
  } catch (err) {
    if (err instanceof StorageKeyError) {
      throw err;
    }
    // Fall through to other device RNGs / final fail-closed.
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    try {
      globalThis.crypto.getRandomValues(target);
      return;
    } catch {
      // Broken stub (e.g. ExpoCrypto registered but not linked) — try natives next.
    }
  }

  const b64 = randomBase64FromNative(target.length);
  if (b64) {
    decodeBase64ToBytes(b64, target);
    return;
  }

  throw new StorageKeyError(
    'NO_SECURE_RANDOM: Cryptographically secure random generator is unavailable. Rebuild the native Dev Client with expo-crypto linked.'
  );
}
