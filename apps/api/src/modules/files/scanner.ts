export interface ScanResult {
  isClean: boolean;
  threatName?: string;
  scannedAt: Date;
  scannerEngine: string;
}

export interface MalwareScannerContract {
  scanBytes(
    bytes: Buffer,
    context: { fileName: string; detectedMime: string }
  ): Promise<ScanResult>;
}

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
      throw new Error('Malware scanner service is temporarily unavailable (connection refused)');
    }
    if (this.simulatedFailureMode === 'timeout') {
      throw new Error('Malware scan timed out after 30000ms');
    }

    const now = new Date();

    // 2. EICAR Test Signature Check
    const contentAscii = bytes.toString('ascii');
    if (contentAscii.includes(PolicyMalwareScanner.EICAR_SIGNATURE)) {
      return {
        isClean: false,
        threatName: 'EICAR-Standard-AV-Test-File',
        scannedAt: now,
        scannerEngine: 'Daynori-Policy-Scanner/1.0',
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
        };
      }
    }

    // Passed all heuristic and signature checks
    return {
      isClean: true,
      scannedAt: now,
      scannerEngine: 'Daynori-Policy-Scanner/1.0',
    };
  }
}

let defaultScanner: MalwareScannerContract = new PolicyMalwareScanner();

export function getDefaultMalwareScanner(): MalwareScannerContract {
  return defaultScanner;
}

export function setDefaultMalwareScanner(scanner: MalwareScannerContract): void {
  defaultScanner = scanner;
}
