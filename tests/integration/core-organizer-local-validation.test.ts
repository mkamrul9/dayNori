/**
 * Consolidate & validate the existing Android/web core organizer (local).
 * Production API gates + production Next web proxy (account-deletion).
 * Does not claim Phase 37–38 device/beta evidence or launch authorization.
 */
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createApiClient } from '@daynori/api-client';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const WEB_PORT = Number(process.env.CORE_VAL_WEB_PORT || 3061);
const results: Array<{ name: string; status: string; detail?: string }> = [];

function record(name: string, status: string, detail = '') {
  results.push({ name, status, detail });
}

async function waitForHttp(url: string, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status > 0) return;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error(`not ready: ${url}`);
}

describe('Core organizer local validation (consolidation)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl = '';
  let token = '';
  let workspaceId = '';
  let email = '';
  let web: { stop: () => Promise<void> } | null = null;
  const prevNodeEnv = process.env['NODE_ENV'];

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['DAYNORI_ROOMS_LOCAL_ENABLED'];
    delete process.env['DAYNORI_AI_LOCAL_ENABLED'];
    delete process.env['DAYNORI_BILLING_LOCAL_ENABLED'];

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();
    await new Migrator().migrate();

    const keyPair = await generateKeyPair('RS256');
    const kid = 'core-val-key';
    const issuer = 'https://auth.daynori.test';
    const audience = 'daynori-api';
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    const jwks: JSONWebKeySet = { keys: [publicJwk] };

    server = buildServer({
      jwtVerifier: new JwtVerifier({ issuer, audience, localJwks: jwks }),
      runtimePool,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
      enableChatPublicationRecovery: false,
    });
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const userId = crypto.randomUUID();
    email = `core-val-${userId.slice(0, 8)}@example.test`;
    await adminPool.query(`INSERT INTO app.profiles (id, display_name) VALUES ($1,'CoreVal')`, [
      userId,
    ]);
    try {
      await adminPool.query(`UPDATE app.profiles SET email = $1 WHERE id = $2`, [email, userId]);
    } catch {
      /* optional */
    }

    token = await new SignJWT({
      sub: userId,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
      email,
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);

    const client = createApiClient({ baseUrl, token });
    workspaceId = (await client.provisionPersonalWorkspace()).data.workspace.id;

    const webRoot = path.join(REPO_ROOT, 'apps', 'web');
    if (!fs.existsSync(path.join(webRoot, '.next'))) {
      throw new Error('Missing apps/web/.next — run pnpm --filter @daynori/web build');
    }
    const nextBin = path.join(webRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
    const child = spawn(process.execPath, [nextBin, 'start', '-p', String(WEB_PORT)], {
      cwd: webRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DAYNORI_API_URL: baseUrl,
        NEXT_PUBLIC_API_URL: baseUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    web = {
      async stop() {
        if (child.exitCode !== null) return;
        child.kill('SIGTERM');
        await sleep(400);
        if (child.exitCode === null) child.kill('SIGKILL');
      },
    };
    await waitForHttp(`http://127.0.0.1:${WEB_PORT}/privacy`);
  }, 180_000);

  afterAll(async () => {
    if (web) await web.stop();
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
    if (prevNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = prevNodeEnv;

    const out = path.join(REPO_ROOT, 'artifacts', 'release', 'core-organizer-local-validation.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          node: process.version,
          notLaunchAuthorization: true,
          results,
        },
        null,
        2
      ) + '\n'
    );
  });

  it('exercises notes, tasks, routines, journal, sync, and gated modules', async () => {
    const client = createApiClient({ baseUrl, token });
    const note = await client.createNote(workspaceId, {
      title: 'core-val-note',
      plainText: 'synthetic note',
    });
    expect(note.data.id).toBeTruthy();
    record('notes-create', 'PASS', note.data.id);

    const updated = await client.updateNote(workspaceId, note.data.id, {
      title: 'core-val-note-edited',
      plainText: 'edited',
      baseRevision: note.data.revision,
    });
    expect(updated.data.id).toBe(note.data.id);
    record('notes-update', 'PASS');

    const task = await client.createTask(workspaceId, { title: 'core-val-task' });
    expect(task.data.id).toBeTruthy();
    record('tasks-create', 'PASS', task.data.id);

    const routine = await client.createRoutine(workspaceId, {
      title: 'core-val-routine',
      timezone: 'UTC',
      frequency: 'daily',
    });
    expect(routine.data.id).toBeTruthy();
    record('routines-create', 'PASS', routine.data.id);

    const journal = await client.createJournalEntry(workspaceId, {
      title: 'core-val-journal',
      plainText: 'synthetic journal',
      entryDate: '2026-10-21',
      timezone: 'UTC',
    });
    expect(journal.data.id).toBeTruthy();
    record('journal-create', 'PASS', journal.data.id);

    const filesQuota = await fetch(`${baseUrl}/v1/workspaces/${workspaceId}/files/quota`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(filesQuota.status).toBe(200);
    record('files-quota', 'PASS', `status=${filesQuota.status}`);

    const pull = await client.syncPull({ workspaceId });
    expect(pull).toBeTruthy();
    record('sync-pull', 'PASS');

    const auth = { Authorization: `Bearer ${token}` };
    expect((await fetch(`${baseUrl}/v1/vault/status`, { headers: auth })).status).toBe(403);
    expect((await fetch(`${baseUrl}/v1/rooms`, { headers: auth })).status).toBe(403);
    expect((await fetch(`${baseUrl}/v1/ai/consent`, { headers: auth })).status).toBe(403);
    expect((await fetch(`${baseUrl}/v1/billing/catalog`, { headers: auth })).status).toBe(403);
    record('optional-modules-denied', 'PASS');
  });

  it('serves legal pages and account-deletion via web proxy with enumeration-safe acks', async () => {
    for (const p of ['/privacy', '/terms', '/support', '/account-deletion']) {
      const res = await fetch(`http://127.0.0.1:${WEB_PORT}${p}`);
      expect(res.status).toBe(200);
      record(`web-page ${p}`, 'PASS');
    }

    const unknown = await fetch(
      `http://127.0.0.1:${WEB_PORT}/api/v1/public/account-deletion-request`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: `http://127.0.0.1:${WEB_PORT}`,
        },
        body: JSON.stringify({ email: 'synthetic-unknown-core-val@example.test' }),
      }
    );
    const known = await fetch(
      `http://127.0.0.1:${WEB_PORT}/api/v1/public/account-deletion-request`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: `http://127.0.0.1:${WEB_PORT}`,
        },
        body: JSON.stringify({ email }),
      }
    );
    expect([200, 202]).toContain(unknown.status);
    expect([200, 202]).toContain(known.status);
    const u = (await unknown.json()) as { message?: string };
    const k = (await known.json()) as { message?: string };
    expect(u.message).toBe(k.message);
    record('web-proxy-account-deletion', 'PASS', `unknown=${unknown.status} known=${known.status}`);

    const verify = await fetch(
      `http://127.0.0.1:${WEB_PORT}/api/v1/public/account-deletion-request/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: `http://127.0.0.1:${WEB_PORT}`,
        },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          verificationToken: 'not-real',
        }),
      }
    );
    expect(verify.status).toBeGreaterThanOrEqual(400);
    record('web-proxy-deletion-verify-required', 'PASS', `status=${verify.status}`);
  });
});
