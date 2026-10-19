/**
 * SYNTHETIC HARNESS ONLY — local development (Phases 46–47).
 * Disconnected from production vault storage, sync, and API routes.
 * Must never be selected as a silent production fallback.
 */

import type {
  BiometricCapabilityProvider,
  DeviceEnrollmentProvider,
  VaultCiphertextRecord,
  VaultCiphertextRepository,
  VaultKeyProvider,
  VaultKeyUnwrapOutcome,
  VaultProviderBundle,
} from './vaultProviders.js';

export const SYNTHETIC_PASSPHRASE = 'correct-horse-battery-staple-synthetic';
export const SYNTHETIC_RECOVERY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefAAAA';

const FIXTURES: VaultCiphertextRecord[] = [
  {
    id: 'vault-item-1',
    folderId: null,
    titleCiphertextLabel: 'env:title:v1:item-1',
    bodyCiphertextLabel: 'env:body:v1:item-1',
    revision: 1,
    trashed: false,
    updatedAt: '2026-10-19T00:00:00.000Z',
  },
  {
    id: 'vault-item-2',
    folderId: 'vault-folder-a',
    titleCiphertextLabel: 'env:title:v1:item-2',
    bodyCiphertextLabel: 'env:body:v1:item-2',
    revision: 2,
    trashed: false,
    updatedAt: '2026-10-19T01:00:00.000Z',
  },
  {
    id: 'vault-item-trash',
    folderId: null,
    titleCiphertextLabel: 'env:title:v1:trash',
    bodyCiphertextLabel: 'env:body:v1:trash',
    revision: 1,
    trashed: true,
    updatedAt: '2026-10-18T00:00:00.000Z',
  },
];

const PLAINTEXTS: Record<string, { title: string; body: string }> = {
  'vault-item-1': {
    title: 'Synthetic vault note',
    body: 'Harness plaintext — not production content.',
  },
  'vault-item-2': {
    title: 'Folder note',
    body: 'Nested synthetic ciphertext fixture.',
  },
  'vault-item-trash': {
    title: 'Trashed note',
    body: 'In trash for recovery UI.',
  },
};

export interface SyntheticHarnessOptions {
  biometricBoundKeyAvailable?: boolean;
  revoked?: boolean;
  biometricInvalidated?: boolean;
}

export interface SyntheticHarnessControls {
  invalidateBiometric: () => void;
  revokeDevice: () => void;
  expectedPassphrase: string;
  expectedRecovery: string;
  listTrash: () => VaultCiphertextRecord[];
}

export function createSyntheticVaultProviders(options: SyntheticHarnessOptions = {}): {
  bundle: VaultProviderBundle;
  controls: SyntheticHarnessControls;
} {
  const liveHandles = new Set<string>();
  let biometricInvalidated = options.biometricInvalidated === true;
  let revoked = options.revoked === true;
  const biometricBound = options.biometricBoundKeyAvailable !== false;

  const keyProvider: VaultKeyProvider = {
    id: 'synthetic-harness-key-provider',
    kind: 'synthetic_harness',
    availability: () => 'available',
    async unwrapWithPassphrase(passphrase) {
      if (passphrase !== SYNTHETIC_PASSPHRASE) {
        return { ok: false, reason: 'wrong_credentials', message: 'Passphrase rejected.' };
      }
      const keyHandleId = `synth-handle-${Date.now()}`;
      liveHandles.add(keyHandleId);
      return { ok: true, keyHandleId, method: 'passphrase' };
    },
    async unwrapWithRecoverySecret(secret) {
      if (secret !== SYNTHETIC_RECOVERY) {
        return { ok: false, reason: 'wrong_credentials', message: 'Recovery secret rejected.' };
      }
      const keyHandleId = `synth-recovery-${Date.now()}`;
      liveHandles.add(keyHandleId);
      return { ok: true, keyHandleId, method: 'recovery_secret' };
    },
    async unwrapWithBiometricDeviceKey() {
      if (biometricInvalidated) {
        return {
          ok: false,
          reason: 'biometric_invalidated',
          message: 'Biometric enrollment changed; device key invalidated. Use passphrase.',
        };
      }
      if (!biometricBound) {
        return {
          ok: false,
          reason: 'unavailable',
          message: 'Biometric/device-auth capability unavailable in this harness configuration.',
        };
      }
      const keyHandleId = `synth-bio-${Date.now()}`;
      liveHandles.add(keyHandleId);
      return { ok: true, keyHandleId, method: 'biometric_device_key' };
    },
    async unwrapWithPinDeviceKey(): Promise<VaultKeyUnwrapOutcome> {
      return {
        ok: false,
        reason: 'pin_scheme_unavailable',
        message:
          'PIN/device-key unlock remains unavailable and must never protect synchronized envelopes alone.',
      };
    },
    async releaseKeyHandle(keyHandleId) {
      liveHandles.delete(keyHandleId);
    },
  };

  const ciphertextRepository: VaultCiphertextRepository = {
    id: 'synthetic-harness-ciphertext-repo',
    kind: 'synthetic_harness',
    availability: () => 'available',
    async listItems(folderId) {
      return FIXTURES.filter((f) => !f.trashed && f.folderId === folderId);
    },
    async getItem(id) {
      return FIXTURES.find((f) => f.id === id) ?? null;
    },
    async revealPlaintext(id, keyHandleId) {
      if (!liveHandles.has(keyHandleId)) {
        return { ok: false, reason: 'missing_or_released_key_handle' };
      }
      const pt = PLAINTEXTS[id];
      if (!pt) return { ok: false, reason: 'not_found' };
      return { ok: true, title: pt.title, body: pt.body };
    },
    async clearPlaintextCaches() {},
  };

  const biometric: BiometricCapabilityProvider = {
    async probe() {
      if (biometricInvalidated) return 'invalidated';
      return biometricBound ? 'available' : 'unavailable';
    },
  };

  const enrollment: DeviceEnrollmentProvider = {
    async status() {
      return revoked ? 'revoked' : 'enrolled';
    },
    async observeRevocationSignal() {
      return revoked;
    },
  };

  return {
    bundle: { keyProvider, ciphertextRepository, biometric, enrollment },
    controls: {
      invalidateBiometric() {
        biometricInvalidated = true;
      },
      revokeDevice() {
        revoked = true;
      },
      expectedPassphrase: SYNTHETIC_PASSPHRASE,
      expectedRecovery: SYNTHETIC_RECOVERY,
      listTrash: () => FIXTURES.filter((f) => f.trashed),
    },
  };
}
