/**
 * Mobile re-export of the framework-neutral vault session controller.
 * Platform adapters remain in this package; do not import this module from apps/web.
 */

export {
  VaultLifecycleController,
  type VaultControllerConfig,
  type VaultLockResult,
  type VaultUnlockResult,
} from '@daynori/domain';
