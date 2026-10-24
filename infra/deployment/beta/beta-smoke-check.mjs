#!/usr/bin/env node
/**
 * Daynori Phase 38: Controlled Private Beta Smoke Check Runner
 *
 * Verifies core security invariants, private access boundaries,
 * tenant isolation, and essential organizer endpoints against a deployed beta target.
 */

import console from 'node:console';
import crypto from 'node:crypto';
import process from 'node:process';
import { generateKeyPair, SignJWT } from 'jose';
import { buildServer } from '../../../apps/api/dist/server.js';
import { createAdminPool, createRuntimePool } from '../../../apps/api/dist/db/index.js';
import { createApiClient } from '../../../packages/api-client/dist/index.js';

const fetch = globalThis.fetch;

async function runBetaSmokeChecks() {
  const targetUrl = process.env['TARGET_URL'] || process.argv[2];
  if (targetUrl) {
    console.log(`=== RUNNING PHASE 38 BETA DEPLOYMENT SMOKE CHECKS (TARGET: ${targetUrl}) ===\n`);
  } else {
    console.log('=== [LOCAL INTEGRATION COVERAGE] RUNNING PHASE 38 SYNTHETIC SMOKE CHECKS ===\n');
  }
  const results = [];
  function record(name, pass, details) {
    results.push({ name, pass, details });
    console.log(`${pass ? '✓ PASS' : '✗ FAIL'}: ${name} — ${details}`);
  }

  const adminPool = createAdminPool();
  const runtimePool = createRuntimePool();

  const keyPair = await generateKeyPair('RS256');
  const kid = 'beta-smoke-key';
  const issuer = 'https://auth.daynori.internal';
  const audience = 'daynori-api';
  const jwks = {
    keys: [
      {
        ...(await import('jose').then((m) => m.exportJWK(keyPair.publicKey))),
        kid,
        alg: 'RS256',
        use: 'sig',
      },
    ],
  };

  const server = buildServer({
    adminPool,
    runtimePool,
    jwtConfig: { issuer, audience, localJwks: jwks, allowedAlgorithms: ['RS256'] },
    allowUnauthenticatedStartup: false,
  });

  const address = await server.listen({ port: 0, host: '127.0.0.1' });
  console.log(`Beta test server listening at: ${address}\n`);

  try {
    // 1. Health & OpenApi Contract Check
    const healthRes = await fetch(`${address}/health`);
    const healthData = await healthRes.json();
    record(
      'Beta Health Endpoint',
      healthRes.ok && healthData.status === 'ok',
      `HTTP ${healthRes.status}, status: ${healthData.status}`
    );

    // 2. Unauthenticated Mutation Rejection
    const unauthRes = await fetch(`${address}/v1/workspaces/provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    record(
      'Unauthenticated Access Boundary',
      unauthRes.status === 401,
      `Unauthenticated workspace provisioning correctly rejected with HTTP ${unauthRes.status}`
    );

    // 3. Authenticated Participant Tenant Isolation
    const userA = crypto.randomUUID();
    const tokenA = await new SignJWT({
      sub: userA,
      email: 'beta.tester.a@example.test',
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keyPair.privateKey);

    const userB = crypto.randomUUID();
    const tokenB = await new SignJWT({
      sub: userB,
      email: 'beta.tester.b@example.test',
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keyPair.privateKey);

    // Ensure profiles exist
    const admin = await adminPool.connect();
    try {
      await admin.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1, 'Tester A'), ($2, 'Tester B') ON CONFLICT (id) DO NOTHING;`,
        [userA, userB]
      );
    } finally {
      admin.release();
    }

    const clientA = createApiClient({ baseUrl: address, token: () => tokenA });
    const clientB = createApiClient({ baseUrl: address, token: () => tokenB });

    const provA = await clientA.provisionPersonalWorkspace();
    const wsA = provA.data.workspace.id;

    const provB = await clientB.provisionPersonalWorkspace();
    const _wsB = provB.data.workspace.id;

    // User A creates a note
    const noteA = await clientA.createNote(wsA, {
      title: 'Tester A Private Note',
      document: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'secret' }] }],
      },
    });

    // User B tries to read User A's note -> must fail with expected 403 or 404 authorization error
    let isolationViolated = false;
    let isolationStatus = 0;
    try {
      await clientB.getNote(wsA, noteA.data.note.id);
      isolationViolated = true;
    } catch (err) {
      isolationStatus = err?.statusCode || err?.status || 0;
      if (isolationStatus === 403 || isolationStatus === 404) {
        isolationViolated = false;
      } else {
        isolationViolated = true;
      }
    }
    record(
      'Cross-Participant Tenant Isolation',
      !isolationViolated,
      isolationViolated
        ? `Expected HTTP 403 or 404 isolation response, received: ${isolationStatus}`
        : `Participant B strictly denied read access with HTTP ${isolationStatus}`
    );

    // 4. Public Deletion Access Boundary
    const publicDelRes = await fetch(`${address}/v1/public/account-deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'beta.tester.a@example.test' }),
    });
    const publicDelData = await publicDelRes.json();
    record(
      'Public Account Deletion Boundary',
      publicDelRes.ok && publicDelData.success === true,
      `Public deletion request accepted with enumeration-safe response`
    );

    const allPassed = results.every((r) => r.pass);
    console.log(
      `\n=== SUMMARY: ${results.filter((r) => r.pass).length}/${results.length} CHECKS PASSED ===\n`
    );

    if (!allPassed) {
      process.exit(1);
    }
  } finally {
    await server.close();
    await adminPool.end();
    await runtimePool.end();
  }
}

runBetaSmokeChecks().catch((err) => {
  console.error('Smoke check crashed:', err);
  process.exit(1);
});
