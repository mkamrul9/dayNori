/**
 * Mobile re-export of shared synthetic vault harness providers (domain).
 * Development harness only — never a production fallback.
 */

export {
  createSyntheticVaultProviders,
  SYNTHETIC_PASSPHRASE,
  SYNTHETIC_RECOVERY,
  type SyntheticHarnessControls,
  type SyntheticHarnessOptions,
} from '@daynori/domain';
