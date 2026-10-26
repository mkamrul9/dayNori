/**
 * Device-safe CSPRNG for SQLCipher key material.
 * Avoid react-native-get-random-values when ExpoCrypto is stubbed but unlinked
 * (it throws "Cannot find native module 'ExpoCrypto'" before other fallbacks).
 */
import { NativeModules } from 'react-native';
import { StorageKeyError } from '@daynori/sync';

function decodeBase64ToBytes(b64: string, target: Uint8Array): void {
  // Prefer global atob when present (Hermes/RN).
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

/** Fill `target` with cryptographically secure random bytes. */
export async function fillSecureRandomBytes(target: Uint8Array): Promise<void> {
  // Prefer linked expo-crypto when present in the Dev Client / release binary.
  try {
    const ExpoCrypto = await import('expo-crypto');
    if (typeof ExpoCrypto.getRandomBytesAsync === 'function') {
      const bytes = await ExpoCrypto.getRandomBytesAsync(target.length);
      target.set(bytes);
      return;
    }
  } catch {
    // Unlinked or unavailable — try other device RNGs.
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    try {
      globalThis.crypto.getRandomValues(target);
      return;
    } catch {
      // Broken stub (e.g. ExpoCrypto registered but not linked).
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
