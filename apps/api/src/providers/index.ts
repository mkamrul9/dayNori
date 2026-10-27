export { SupabaseObjectStore, createConfiguredObjectStore } from './supabaseStorage.js';
export { ClamAvScanner } from './clamav.js';
import { ClamAvScanner } from './clamav.js';
import {
  ExternalMalwareScanner,
  PolicyMalwareScanner,
  UnavailableMalwareScanner,
  type MalwareScannerContract,
} from '../modules/files/scanner.js';

/**
 * Prefer ClamAV / external scanners when configured.
 * DAYNORI_ALLOW_POLICY_SCANNER=true is a non-production engineering opt-in only —
 * PolicyMalwareScanner is heuristic and is not production malware protection.
 */
export function createConfiguredMalwareScanner(
  env: NodeJS.ProcessEnv = process.env
): MalwareScannerContract {
  if (env['CLAMAV_HOST'])
    return new ClamAvScanner({
      host: env['CLAMAV_HOST'],
      port: Number(env['CLAMAV_PORT'] ?? 3310),
    });
  if (env['MALWARE_SCANNER_URL'])
    return new ExternalMalwareScanner({ endpoint: env['MALWARE_SCANNER_URL'] });
  if (env['DAYNORI_ALLOW_POLICY_SCANNER'] === 'true' && env['NODE_ENV'] !== 'production') {
    return new PolicyMalwareScanner();
  }
  return new UnavailableMalwareScanner();
}
