import crypto from 'node:crypto';

export interface ScanResult {
  isClean: boolean;
  threatName?: string;
  scannedAt: Date;
  scannerEngine: string;
  engineVersion: string;
  scannedBytesCount: number;
  scannedSha256: string;
}

export interface MalwareScannerContract {
  scanBytes(
    bytes: Buffer,
    context: { fileName: string; detectedMime: string }
  ): Promise<ScanResult>;
}

export class MalwareScannerUnavailableError extends Error {
  constructor(message = 'Malware scanner service is temporarily unavailable (connection refused)') {
    super(message);
    this.name = 'MalwareScannerUnavailableError';
  }
}

/**
 * Heuristic/test policy scanner for detecting EICAR and high-risk vectors.
 */
export class PolicyMalwareScanner implements MalwareScannerContract {
  private simulatedFailureMode: 'none' | 'outage' | 'timeout' = 'none';

  // EICAR standard antivirus test signature
  private static readonly EICAR_SIGNATURE =
    'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

  setSimulatedFailureMode(mode: 'none' | 'outage' | 'timeout'): void {
    this.simulatedFailureMode = mode;
  }

  async scanBytes(
    bytes: Buffer,
    _context: { fileName: string; detectedMime: string }
  ): Promise<ScanResult> {
    // 1. Enforce fail-closed on scanner outages/timeouts
    if (this.simulatedFailureMode === 'outage') {
      throw new MalwareScannerUnavailableError();
    }
    if (this.simulatedFailureMode === 'timeout') {
      throw new MalwareScannerUnavailableError('Malware scan timed out after 30000ms');
    }

    const now = new Date();
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

    // 2. EICAR Test Signature Check
    const contentAscii = bytes.toString('ascii');
    if (contentAscii.includes(PolicyMalwareScanner.EICAR_SIGNATURE)) {
      return {
        isClean: false,
        threatName: 'EICAR-Standard-AV-Test-File',
        scannedAt: now,
        scannerEngine: 'Daynori-Policy-Scanner/1.0',
        engineVersion: '1.0.0',
        scannedBytesCount: bytes.length,
        scannedSha256: sha256,
      };
    }

    // 3. Embedded executable or reverse shell payloads in non-executable files
    const checkLen = Math.min(bytes.length, 65536);
    const sample = bytes.subarray(0, checkLen).toString('ascii').toLowerCase();

    const suspiciousPatterns = [
      'eval(base64_decode(',
      'system("/bin/sh',
      'exec("/bin/sh',
      'powershell -enc ',
      'powershell -executionpolicy bypass',
      '/bin/bash -i >& /dev/tcp/',
      'cmd.exe /c start',
    ];

    for (const pattern of suspiciousPatterns) {
      if (sample.includes(pattern)) {
        return {
          isClean: false,
          threatName: `Generic.Exploit.ScriptVector.${pattern.split(' ')[0]}`,
          scannedAt: now,
          scannerEngine: 'Daynori-Policy-Scanner/1.0',
          engineVersion: '1.0.0',
          scannedBytesCount: bytes.length,
          scannedSha256: sha256,
        };
      }
    }

    // Passed all heuristic and signature checks
    return {
      isClean: true,
      scannedAt: now,
      scannerEngine: 'Daynori-Policy-Scanner/1.0',
      engineVersion: '1.0.0',
      scannedBytesCount: bytes.length,
      scannedSha256: sha256,
    };
  }
}

/**
 * External malware scanner client (e.g. ClamAV / ICAP daemon) with bounded execution
 * and strict fail-closed behavior.
 */
export class ExternalMalwareScanner implements MalwareScannerContract {
  private timeoutMs: number;
  private endpoint: string;

  constructor(options?: { endpoint?: string; timeoutMs?: number }) {
    this.endpoint = options?.endpoint || process.env['MALWARE_SCANNER_URL'] || '';
    this.timeoutMs = options?.timeoutMs || 10000;
  }

  async scanBytes(
    bytes: Buffer,
    context: { fileName: string; detectedMime: string }
  ): Promise<ScanResult> {
    const isTestOrDev =
      process.env['NODE_ENV'] === 'test' ||
      process.env['NODE_ENV'] === 'development' ||
      process.env['VITEST'] !== undefined;

    if (!this.endpoint) {
      if (isTestOrDev) {
        // In development/test with unconfigured external endpoint, delegate to PolicyMalwareScanner
        const fallback = new PolicyMalwareScanner();
        return fallback.scanBytes(bytes, context);
      }
      throw new MalwareScannerUnavailableError('External malware scanner URL is not configured');
    }

    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(context.fileName),
          'X-File-Mime': context.detectedMime,
        },
        body: bytes,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new MalwareScannerUnavailableError(`Scanner service returned HTTP ${res.status}`);
      }

      const body = (await res.json()) as {
        isClean?: unknown;
        threatName?: unknown;
        engine?: unknown;
        version?: unknown;
      };

      if (typeof body !== 'object' || body === null || typeof body.isClean !== 'boolean') {
        throw new MalwareScannerUnavailableError(
          'Scanner returned invalid response format: isClean boolean required'
        );
      }

      return {
        isClean: body.isClean,
        threatName: typeof body.threatName === 'string' ? body.threatName : undefined,
        scannedAt: new Date(),
        scannerEngine: typeof body.engine === 'string' ? body.engine : 'External-Scanner',
        engineVersion: typeof body.version === 'string' ? body.version : '1.0.0',
        scannedBytesCount: bytes.length,
        scannedSha256: sha256,
      };
    } catch (err) {
      // Strictly fail-closed: do not allow files to be verified on scanner failures!
      throw new MalwareScannerUnavailableError(
        err instanceof Error ? err.message : 'External scanner connection failed'
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Scanner returned when external scanner service is unconfigured in production.
 * Returns honest 503 unavailable status rather than simulated clean pass.
 */
export class UnavailableMalwareScanner implements MalwareScannerContract {
  async scanBytes(): Promise<never> {
    throw new MalwareScannerUnavailableError(
      'Malware scanner service is not configured or unavailable'
    );
  }
}

const SCANNER_KEY = '__daynoriDefaultMalwareScanner';
type ScannerGlobal = typeof globalThis & {
  [SCANNER_KEY]?: MalwareScannerContract;
};

const isTestOrDev =
  process.env['NODE_ENV'] === 'test' ||
  process.env['NODE_ENV'] === 'development' ||
  process.env['VITEST'] !== undefined;

function ensureDefaultScanner(): MalwareScannerContract {
  const g = globalThis as ScannerGlobal;
  if (!g[SCANNER_KEY]) {
    g[SCANNER_KEY] = isTestOrDev
      ? new PolicyMalwareScanner()
      : new UnavailableMalwareScanner();
  }
  return g[SCANNER_KEY]!;
}

export function getDefaultMalwareScanner(): MalwareScannerContract {
  return ensureDefaultScanner();
}

export function setDefaultMalwareScanner(scanner: MalwareScannerContract): void {
  (globalThis as ScannerGlobal)[SCANNER_KEY] = scanner;
}
