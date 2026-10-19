/**
 * Phase 46 vault platform provider contracts.
 * Production must never silently fall back to a mock or plaintext repository.
 */

import type { VaultUnlockMethod } from '@daynori/domain';

export type ProviderAvailability = 'available' | 'unavailable';

export interface VaultKeyUnwrapResult {
  ok: true;
  /** Opaque handle id — never log key material. */
  keyHandleId: string;
  method: VaultUnlockMethod;
}

export interface VaultKeyUnwrapFailure {
  ok: false;
  reason:
    | 'wrong_credentials'
    | 'cancelled'
    | 'unavailable'
    | 'biometric_invalidated'
    | 'rate_limited'
    | 'pin_scheme_unavailable';
  message: string;
}

export type VaultKeyUnwrapOutcome = VaultKeyUnwrapResult | VaultKeyUnwrapFailure;

/** Reviewed key-provider operations. Missing provider ⇒ explicit unavailable. */
export interface VaultKeyProvider {
  readonly id: string;
  readonly kind: 'production' | 'synthetic_harness';
  availability(): ProviderAvailability;
  unwrapWithPassphrase(passphrase: string): Promise<VaultKeyUnwrapOutcome>;
  unwrapWithRecoverySecret(secret: string): Promise<VaultKeyUnwrapOutcome>;
  /**
   * Biometric/device-auth bound key release. A biometric boolean alone is never enough;
   * implementations must perform cryptographic unwrap under OS-auth-bound key.
   */
  unwrapWithBiometricDeviceKey(): Promise<VaultKeyUnwrapOutcome>;
  /** PIN/device-key scheme — unavailable until reviewed design accepted. */
  unwrapWithPinDeviceKey(_pin: string): Promise<VaultKeyUnwrapOutcome>;
  releaseKeyHandle(keyHandleId: string): Promise<void>;
}

export interface VaultCiphertextRecord {
  id: string;
  folderId: string | null;
  titleCiphertextLabel: string;
  bodyCiphertextLabel: string;
  revision: number;
  trashed: boolean;
  updatedAt: string;
}

export interface VaultCiphertextRepository {
  readonly id: string;
  readonly kind: 'production' | 'synthetic_harness';
  availability(): ProviderAvailability;
  listItems(folderId: string | null): Promise<VaultCiphertextRecord[]>;
  getItem(id: string): Promise<VaultCiphertextRecord | null>;
  /** Decrypt-on-read only when unlocked key handle is presented. */
  revealPlaintext(
    id: string,
    keyHandleId: string
  ): Promise<{ ok: true; title: string; body: string } | { ok: false; reason: string }>;
  clearPlaintextCaches(): Promise<void>;
}

export interface BiometricCapabilityProvider {
  probe(): Promise<'available' | 'unavailable' | 'invalidated' | 'unknown'>;
}

export interface DeviceEnrollmentProvider {
  status(): Promise<'unknown' | 'enrolled' | 'revoked' | 'unavailable'>;
  /** Observed revocation after reconnect / sync — not claimed while offline. */
  observeRevocationSignal(): Promise<boolean>;
}

export interface VaultProviderBundle {
  keyProvider: VaultKeyProvider;
  ciphertextRepository: VaultCiphertextRepository;
  biometric: BiometricCapabilityProvider;
  enrollment: DeviceEnrollmentProvider;
}

/**
 * Production bundle: explicit unavailable until Phase 44/45 gates and reviewed adapters land.
 * Never substitutes synthetic providers.
 */
export function createProductionUnavailableVaultProviders(): VaultProviderBundle {
  const unavailableKey: VaultKeyProvider = {
    id: 'production-unavailable-key-provider',
    kind: 'production',
    availability: () => 'unavailable',
    async unwrapWithPassphrase() {
      return {
        ok: false,
        reason: 'unavailable',
        message:
          'Production vault key provider is unavailable. Phase 44/45 gates and reviewed adapters are required.',
      };
    },
    async unwrapWithRecoverySecret() {
      return {
        ok: false,
        reason: 'unavailable',
        message: 'Production vault recovery unwrap is unavailable.',
      };
    },
    async unwrapWithBiometricDeviceKey() {
      return {
        ok: false,
        reason: 'unavailable',
        message:
          'Biometric device-key unlock is unavailable until reviewed Keystore wrapping is approved.',
      };
    },
    async unwrapWithPinDeviceKey() {
      return {
        ok: false,
        reason: 'pin_scheme_unavailable',
        message:
          'Short PIN/device-key unlock is unavailable and must never protect synchronized envelopes alone.',
      };
    },
    async releaseKeyHandle() {},
  };

  const unavailableRepo: VaultCiphertextRepository = {
    id: 'production-unavailable-ciphertext-repo',
    kind: 'production',
    availability: () => 'unavailable',
    async listItems() {
      throw new Error('Production vault ciphertext repository unavailable.');
    },
    async getItem() {
      throw new Error('Production vault ciphertext repository unavailable.');
    },
    async revealPlaintext() {
      return { ok: false, reason: 'unavailable' };
    },
    async clearPlaintextCaches() {},
  };

  return {
    keyProvider: unavailableKey,
    ciphertextRepository: unavailableRepo,
    biometric: {
      async probe() {
        return 'unavailable';
      },
    },
    enrollment: {
      async status() {
        return 'unavailable';
      },
      async observeRevocationSignal() {
        return false;
      },
    },
  };
}
