/**
 * Mobile vault provider surface — re-exports domain contracts + production unavailable bundle.
 */

export {
  createProductionUnavailableVaultProviders,
  type BiometricCapabilityProvider,
  type DeviceEnrollmentProvider,
  type ProviderAvailability,
  type VaultCiphertextRecord,
  type VaultCiphertextRepository,
  type VaultKeyProvider,
  type VaultKeyUnwrapFailure,
  type VaultKeyUnwrapOutcome,
  type VaultKeyUnwrapResult,
  type VaultProviderBundle,
} from '@daynori/domain';
