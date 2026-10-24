import net from 'node:net';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { ClamAvScanner } from './clamav.js';

it.each([
  'stream: OK\0',
  'stream: Eicar-Test-Signature FOUND\0',
  'INSTREAM size limit exceeded ERROR\0',
  'invalid\0',
])('streams bytes and fails closed for daemon response %s', async (reply) => {
  const payload = Buffer.alloc(150000, 65);
  let received = Buffer.alloc(0);
  const server = net.createServer((socket) => {
    let pending = Buffer.alloc(0);
    let commandRead = false;
    socket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      if (!commandRead) {
        if (pending.length < 10) return;
        expect(pending.subarray(0, 10).toString()).toBe('zINSTREAM\0');
        pending = pending.subarray(10);
        commandRead = true;
      }
      while (pending.length >= 4) {
        const size = pending.readUInt32BE();
        if (pending.length < size + 4) return;
        if (size === 0) {
          socket.end(reply);
          return;
        }
        received = Buffer.concat([received, pending.subarray(4, 4 + size)]);
        pending = pending.subarray(4 + size);
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  try {
    const scan = new ClamAvScanner({ host: '127.0.0.1', port: address.port }).scanBytes(payload);
    if (reply === 'stream: OK\0') expect((await scan).isClean).toBe(true);
    else if (reply.includes('FOUND')) expect((await scan).isClean).toBe(false);
    else await expect(scan).rejects.toThrow('ClamAV scan unavailable');
    expect(received).toEqual(payload);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
