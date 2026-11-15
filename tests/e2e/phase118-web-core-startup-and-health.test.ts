import { describe, expect, it } from 'vitest';
import { execSync as nodeExecSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GET as getWebHealth } from '../../apps/web/src/app/api/health/route.js';
import { buildServer } from '../../apps/api/src/server.js';
import { JwtVerifier } from '../../apps/api/src/auth/jwt.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 118: Web-Core Production Startup, Health, and Gating Tests', () => {
  it('E2E-01: verifies Next.js web /api/health endpoint handler returns valid production health payload', async () => {
    const response = await getWebHealth();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.version).toBe('0.1.0');
    expect(typeof data.timestamp).toBe('string');
  });

  it('E2E-02: verifies Fastify API server /health and /v1/health endpoints via Fastify inject', async () => {
    const app = buildServer({
      allowUnauthenticatedStartup: true,
      skipDatabaseCheck: true,
    });

    try {
      const rootHealth = await app.inject({
        method: 'GET',
        url: '/health',
      });
      expect(rootHealth.statusCode).toBe(200);
      const rootBody = JSON.parse(rootHealth.payload);
      expect(rootBody.status).toBe('ok');

      const v1Health = await app.inject({
        method: 'GET',
        url: '/v1/health',
      });
      expect(v1Health.statusCode).toBe(200);
      const v1Body = JSON.parse(v1Health.payload);
      expect(v1Body.data.status).toBe('ok');
      expect(v1Body.data.version).toBe('0.1.0');
    } finally {
      await app.close();
    }
  });

  it('E2E-03: verifies unauthenticated requests to protected endpoints fail closed with HTTP 401', async () => {
    const testVerifier = new JwtVerifier({
      issuer: 'https://test.supabase.co/auth/v1',
      audience: 'authenticated',
      secret: 'a-secure-secret-with-at-least-32-characters-for-testing!',
      allowedAlgorithms: ['HS256'],
    });

    const app = buildServer({
      jwtVerifier: testVerifier,
      allowUnauthenticatedStartup: true,
      skipDatabaseCheck: true,
    });

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/users/me/preferences',
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('E2E-04: verifies web-core tarball archive structure excludes .next/cache and includes all required runtime files', () => {
    const webTarballPath = path.join(repoRoot, 'artifacts/release/daynori-web-v2.0.0-rc4.tar.gz');
    expect(fs.existsSync(webTarballPath)).toBe(true);

    const listing = nodeExecSync(`tar -tzf "${webTarballPath}"`, { encoding: 'utf8' }).split('\n');
    expect(listing.length).toBeGreaterThan(100);

    // Verify .next/cache is strictly excluded
    const cacheEntries = listing.filter((entry) => entry.startsWith('.next/cache/') || entry.includes('/cache/webpack'));
    expect(cacheEntries.length).toBe(0);

    // Verify required runtime files exist
    const hasNextServer = listing.some((e) => e.startsWith('.next/server/'));
    const hasNextStatic = listing.some((e) => e.startsWith('.next/static/'));
    const hasBuildId = listing.some((e) => e.includes('BUILD_ID'));
    const hasPublic = listing.some((e) => e.startsWith('public/'));
    const hasPackageJson = listing.some((e) => e.includes('package.json'));

    expect(hasNextServer).toBe(true);
    expect(hasNextStatic).toBe(true);
    expect(hasBuildId).toBe(true);
    expect(hasPublic).toBe(true);
    expect(hasPackageJson).toBe(true);
  });

  it('E2E-05: verifies API tarball archive contains compiled dist ES modules and package.json', () => {
    const apiTarballPath = path.join(repoRoot, 'artifacts/release/daynori-api-v2.0.0-rc4.tar.gz');
    expect(fs.existsSync(apiTarballPath)).toBe(true);

    const listing = nodeExecSync(`tar -tzf "${apiTarballPath}"`, { encoding: 'utf8' }).split('\n');
    expect(listing.length).toBeGreaterThan(20);

    const hasDistStart = listing.some((e) => e.includes('dist/start.js'));
    const hasDistServer = listing.some((e) => e.includes('dist/server.js'));
    const hasPackageJson = listing.some((e) => e.includes('package.json'));

    expect(hasDistStart).toBe(true);
    expect(hasDistServer).toBe(true);
    expect(hasPackageJson).toBe(true);
  });

  it('E2E-06: verifies repository-required Node v24.21.0 engine is present in .tools and matches exact version', () => {
    const nodeExePath = path.join(repoRoot, '.tools/node-v24.21.0-win-x64/node.exe');
    expect(fs.existsSync(nodeExePath)).toBe(true);

    const versionOutput = nodeExecSync(`"${nodeExePath}" -v`, { encoding: 'utf8' }).trim();
    expect(versionOutput).toBe('v24.21.0');
  });
});
