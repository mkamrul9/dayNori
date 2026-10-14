/**
 * Mobile Authentication Adapter
 *
 * Implements the security contract for the mobile organizer shell:
 * - Backed by MobileProviderAuthAdapter and OS-backed secure storage.
 * - Defaults strictly to unauthenticated (`isAuthenticated === false`).
 * - Protects private destinations (e.g., Journal, private items, vault records).
 * - Queues pending destinations when an unauthenticated user attempts to access protected routes.
 * - Supports synthetic authentication context strictly for testing and development review.
 */

export {
  MobileProviderAuthAdapter as MobileAuthAdapter,
  defaultProviderAuthAdapter as defaultAuthAdapter,
  type MobileUser,
  type AuthResult,
} from './providerAdapter.js';
