export { SupabaseObjectStore, createConfiguredObjectStore } from './supabaseStorage.js';
export { ClamAvScanner } from './clamav.js';
import { ClamAvScanner } from './clamav.js';
import {
  ExternalMalwareScanner,
  UnavailableMalwareScanner,
  type MalwareScannerContract,
} from '../modules/files/scanner.js';

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
  return new UnavailableMalwareScanner();
}
