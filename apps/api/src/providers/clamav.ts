import net from 'node:net';
import crypto from 'node:crypto';
import { once } from 'node:events';
import {
  MalwareScannerUnavailableError,
  type MalwareScannerContract,
  type ScanResult,
} from '../modules/files/scanner.js';

/** INSTREAM sends bytes, never paths. clamd must be on a trusted private network. */
export class ClamAvScanner implements MalwareScannerContract {
  constructor(private readonly config: { host: string; port?: number; timeoutMs?: number }) {
    if (
      !config.host ||
      !Number.isInteger(config.port ?? 3310) ||
      (config.port ?? 3310) < 1 ||
      (config.port ?? 3310) > 65535
    ) {
      throw new Error('Invalid ClamAV configuration');
    }
  }

  async scanBytes(bytes: Buffer): Promise<ScanResult> {
    if (bytes.length > 52_428_800)
      throw new MalwareScannerUnavailableError('Scan exceeds byte limit');
    const socket = net.createConnection({ host: this.config.host, port: this.config.port ?? 3310 });
    const timeout = setTimeout(
      () => socket.destroy(new Error('Scanner timeout')),
      this.config.timeoutMs ?? 30_000
    );
    let total = 0;
    let reply = '';
    const result = new Promise<string>((resolve, reject) => {
      socket.on('error', reject);
      socket.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > 4096) {
          socket.destroy(new Error('Scanner response exceeds limit'));
          return;
        }
        reply += chunk.toString('utf8');
        const end = reply.indexOf('\0');
        if (end >= 0) resolve(reply.slice(0, end));
      });
      socket.on('end', () => {
        if (!reply.includes('\0')) reject(new Error('Incomplete scanner response'));
      });
    });
    // Attach the rejection handler before streaming so early socket errors are handled.
    const sending = (async () => {
      await once(socket, 'connect');
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < bytes.length; offset += 65536) {
        const chunk = bytes.subarray(offset, offset + 65536);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        if (!socket.write(chunk)) await once(socket, 'drain');
      }
      socket.write(Buffer.alloc(4));
    })();
    try {
      const [response] = await Promise.all([result, sending]);
      const threat = /^stream: (.{1,200}) FOUND$/.exec(response)?.[1];
      if (response !== 'stream: OK' && !threat) throw new Error('Scanner rejected stream');
      return {
        isClean: !threat,
        threatName: threat,
        scannedAt: new Date(),
        scannerEngine: 'ClamAV',
        engineVersion: 'daemon-managed',
        scannedBytesCount: bytes.length,
        scannedSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      };
    } catch {
      throw new MalwareScannerUnavailableError('ClamAV scan unavailable or invalid response');
    } finally {
      clearTimeout(timeout);
      socket.destroy();
    }
  }
}
