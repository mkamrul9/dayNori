import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import { expect, it } from 'vitest';

it('starts the deployable API process, serves health, and refuses unauthenticated personal data', async () => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('No local port');
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve()))
  );
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/start.ts'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(address.port),
      SUPABASE_JWT_SECRET: crypto.randomUUID(),
      SUPABASE_JWT_ISSUER: 'https://auth.startup.test',
    },
  });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('API exited before becoming ready');
      try {
        ready = (await fetch(`http://127.0.0.1:${address.port}/v1/health`)).ok;
      } catch {
        /* Bounded retry while the process imports its dependencies. */
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(ready).toBe(true);
    expect((await fetch(`http://127.0.0.1:${address.port}/v1/users/me/preferences`)).status).toBe(
      401
    );
  } finally {
    child.kill();
    if (child.exitCode === null) await once(child, 'exit');
  }
}, 20000);
