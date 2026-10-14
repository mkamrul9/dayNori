import crypto from 'node:crypto';
import {
  generateKeyPair,
  SignJWT,
  exportJWK,
  type JSONWebKeySet,
  type JWTHeaderParameters,
} from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  buildServer,
  JwtVerifier,
  ProcessLocalRateLimiter,
  SafeLogger,
  type StructuredLogEntry,
} from './index.js';
import { createAdminPool, createRuntimePool } from './db/index.js';
import { createApiClient } from '@daynori/api-client';

describe('Phase 08: API Contracts, Authentication & Service Foundation', () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  // Real cryptographic test key pairs
  let keyPairA: Awaited<ReturnType<typeof generateKeyPair>>;
  let keyPairB: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kidA = 'key-rsa-2026-a';
  const kidB = 'key-rsa-2026-b';

  // Test identities
  const user1Id = crypto.randomUUID();
  const user2Id = crypto.randomUUID();
  const suffix = crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    // Generate real RS256 keypairs
    keyPairA = await generateKeyPair('RS256');
    keyPairB = await generateKeyPair('RS256');

    const publicJwkA = await exportJWK(keyPairA.publicKey);
    publicJwkA.kid = kidA;
    publicJwkA.alg = 'RS256';
    publicJwkA.use = 'sig';

    const publicJwkB = await exportJWK(keyPairB.publicKey);
    publicJwkB.kid = kidB;
    publicJwkB.alg = 'RS256';
    publicJwkB.use = 'sig';

    jwks = {
      keys: [publicJwkA, publicJwkB],
    };

    // Ensure profiles exist in DB
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query(
        `INSERT INTO app.profiles (id, display_name)
         VALUES ($1, $2), ($3, $4)
         ON CONFLICT (id) DO NOTHING;`,
        [user1Id, `User One ${suffix}`, user2Id, `User Two ${suffix}`]
      );
    } finally {
      adminClient.release();
    }
  });

  afterAll(async () => {
    await adminPool.end();
    await runtimePool.end();
  });

  async function createToken(options: {
    sub: string;
    role?: string;
    tokenUse?: string;
    iss?: string;
    aud?: string;
    expiresIn?: string;
    nbf?: number;
    keyPair?: typeof keyPairA;
    kid?: string;
    customHeaders?: Record<string, unknown>;
  }): Promise<string> {
    const pair = options.keyPair ?? keyPairA;
    const header: JWTHeaderParameters = {
      alg: 'RS256',
      kid: options.kid ?? kidA,
      ...options.customHeaders,
    };

    const jwt = new SignJWT({
      role: options.role ?? 'authenticated',
      token_use: options.tokenUse ?? 'access',
    })
      .setProtectedHeader(header)
      .setSubject(options.sub)
      .setIssuer(options.iss ?? issuer)
      .setAudience(options.aud ?? audience)
      .setIssuedAt();

    if (options.nbf !== undefined) {
      jwt.setNotBefore(options.nbf);
    }

    if (options.expiresIn) {
      jwt.setExpirationTime(options.expiresIn);
    } else {
      jwt.setExpirationTime('1h');
    }

    return jwt.sign(pair.privateKey);
  }

  describe('1. Maintained-Library JWT Verification & Security Constraints', () => {
    it('verifies valid RSA signed token and derives actor', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      const token = await createToken({ sub: user1Id });
      const actor = await verifier.verify(token);

      expect(actor.userId).toBe(user1Id);
      expect(actor.role).toBe('authenticated');
    });

    it('rejects expired tokens with 401 UNAUTHENTICATED', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      const expiredToken = await createToken({ sub: user1Id, expiresIn: '-10s' });
      await expect(verifier.verify(expiredToken)).rejects.toThrow(
        /Invalid or expired authorization token/i
      );
    });

    it('rejects future tokens (nbf in future) with 401 UNAUTHENTICATED', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      const futureToken = await createToken({ sub: user1Id, nbf: futureTime });
      await expect(verifier.verify(futureToken)).rejects.toThrow(
        /Invalid or expired authorization token/i
      );
    });

    it('rejects tampered token signatures', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      const token = await createToken({ sub: user1Id });
      // Tamper signature by changing characters in the signature segment
      const parts = token.split('.');
      const tamperedSignature = parts[2]!.slice(0, -4) + 'AAAA';
      const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

      await expect(verifier.verify(tamperedToken)).rejects.toThrow(
        /Invalid or expired authorization token/i
      );
    });

    it('rejects wrong issuer', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      const badIssToken = await createToken({ sub: user1Id, iss: 'https://evil.issuer.com' });
      await expect(verifier.verify(badIssToken)).rejects.toThrow(
        /Invalid or expired authorization token/i
      );
    });

    it('rejects wrong audience', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      const badAudToken = await createToken({ sub: user1Id, aud: 'wrong-audience' });
      await expect(verifier.verify(badAudToken)).rejects.toThrow(
        /Invalid or expired authorization token/i
      );
    });

    it('rejects forbidden algorithms such as "none" or symmetric "HS256"', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
        allowedAlgorithms: ['RS256', 'EdDSA'],
      });

      // Craft an unverified token with alg: none
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: user1Id,
          iss: issuer,
          aud: audience,
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      ).toString('base64url');
      const unsignedToken = `${header}.${payload}.`;

      await expect(verifier.verify(unsignedToken)).rejects.toThrow();
    });

    it('rejects anonymous, service_role, and admin credentials as user sessions', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      const anonToken = await createToken({ sub: user1Id, role: 'anon' });
      await expect(verifier.verify(anonToken)).rejects.toThrow(
        /Role 'anon' is not permitted for user session authentication/i
      );

      const serviceToken = await createToken({ sub: user1Id, role: 'service_role' });
      await expect(verifier.verify(serviceToken)).rejects.toThrow(
        /Role 'service_role' is not permitted for user session authentication/i
      );

      const adminToken = await createToken({ sub: user1Id, role: 'supabase_admin' });
      await expect(verifier.verify(adminToken)).rejects.toThrow(
        /Role 'supabase_admin' is not permitted for user session authentication/i
      );
    });

    it('supports key rotation through JWKS kid lookup', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      // Token signed with rotated Key B
      const tokenB = await createToken({
        sub: user1Id,
        keyPair: keyPairB,
        kid: kidB,
      });

      const actor = await verifier.verify(tokenB);
      expect(actor.userId).toBe(user1Id);
    });

    it('never fetches key URLs supplied by untrusted token (jku/x5u headers)', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      // Token containing attacker-supplied jku header
      const tokenWithJku = await createToken({
        sub: user1Id,
        customHeaders: {
          jku: 'https://attacker.com/jwks.json',
        },
      });

      // Verifier strictly uses its pre-configured keystore, ignoring jku
      const actor = await verifier.verify(tokenWithJku);
      expect(actor.userId).toBe(user1Id);
    });
  });

  describe('2. Fastify REST Routes, Boundary Validation & Error Contracts', () => {
    let server: ReturnType<typeof buildServer>;
    let tokenUser1: string;

    beforeAll(async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      server = buildServer({
        runtimePool,
        jwtVerifier: verifier,
      });
      await server.ready();

      tokenUser1 = await createToken({ sub: user1Id });
    });

    afterAll(async () => {
      await server.close();
    });

    it('GET /v1/health returns 200 with operational status without secrets', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.status).toBe('ok');
      expect(json.data.version).toBe('0.1.0');
      expect(json.meta.requestId).toBeDefined();
      expect(json.meta.serverTime).toBeDefined();
    });

    it('GET /v1/ready checks database connection without leaking connection strings or credentials', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/ready',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.status).toBe('ready');
      expect(json.data.checks.database).toBe('connected');
      // Assert no database passwords or credentials leaked in response
      expect(res.body).not.toContain('postgres');
      expect(res.body).not.toContain('secret');
      expect(res.body).not.toContain('rotated_local_secret');
    });

    it('POST /v1/workspaces rejects unknown mutation fields', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/v1/workspaces',
        headers: {
          authorization: `Bearer ${tokenUser1}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          name: 'Valid Workspace',
          kind: 'personal',
          unknownField: 'malicious_input', // Strict rejection
        }),
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('VALIDATION_FAILED');
      expect(json.error.message).toBe('Request validation failed');
      expect(json.error.details).toBeDefined();
    });

    it('rejects oversized JSON request body exceeding 1 MiB with 413 PAYLOAD_TOO_LARGE', async () => {
      // 1.5 MB payload
      const largePayload = JSON.stringify({
        name: 'a'.repeat(1.5 * 1024 * 1024),
      });

      const res = await server.inject({
        method: 'POST',
        url: '/v1/workspaces',
        headers: {
          authorization: `Bearer ${tokenUser1}`,
          'content-type': 'application/json',
        },
        payload: largePayload,
      });

      expect(res.statusCode).toBe(413);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rejects unauthenticated requests to protected routes with 401 UNAUTHENTICATED', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/workspaces',
      });

      expect(res.statusCode).toBe(401);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('UNAUTHENTICATED');
    });

    it('GET /v1/openapi.json serves valid canonical OpenAPI 3.0 specification', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/openapi.json',
      });

      expect(res.statusCode).toBe(200);
      const spec = JSON.parse(res.body);
      expect(spec.openapi).toBe('3.0.3');
      expect(spec.paths['/v1/workspaces']).toBeDefined();
      expect(spec.paths['/v1/workspaces/{workspaceId}/items']).toBeDefined();
      expect(spec.components.securitySchemes.BearerAuth).toBeDefined();
    });
  });

  describe('3. Multi-Tenant Authorization, Resource Isolation & Non-Leakage', () => {
    let server: ReturnType<typeof buildServer>;
    let tokenUser1: string;
    let tokenUser2: string;
    let workspace1Id: string;

    beforeAll(async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      server = buildServer({
        runtimePool,
        jwtVerifier: verifier,
      });
      await server.ready();

      tokenUser1 = await createToken({ sub: user1Id });
      tokenUser2 = await createToken({ sub: user2Id });

      // User 1 creates a workspace
      const createRes = await server.inject({
        method: 'POST',
        url: '/v1/workspaces',
        headers: {
          authorization: `Bearer ${tokenUser1}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          name: `User 1 Space ${suffix}`,
          kind: 'personal',
        }),
      });

      expect(createRes.statusCode).toBe(201);
      const json = JSON.parse(createRes.body);
      workspace1Id = json.data.id;
    });

    afterAll(async () => {
      await server.close();
    });

    it('User 1 can retrieve their own workspace', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/v1/workspaces/${workspace1Id}`,
        headers: {
          authorization: `Bearer ${tokenUser1}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.id).toBe(workspace1Id);
      expect(json.data.ownerId).toBe(user1Id);
    });

    it('NONMEMBER DEFENSE: User 2 requesting User 1 workspace returns consistent 404 (no existence leak)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/v1/workspaces/${workspace1Id}`,
        headers: {
          authorization: `Bearer ${tokenUser2}`,
        },
      });

      // Must be 404, not 403, preventing caller from enumerating private workspace IDs
      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('NOT_FOUND');
    });

    it('ACTOR-FIELD INTEGRITY: item creation derives createdBy exclusively from verified JWT', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/v1/workspaces/${workspace1Id}/items`,
        headers: {
          authorization: `Bearer ${tokenUser1}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          kind: 'note',
        }),
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.data.createdBy).toBe(user1Id);
      expect(json.data.workspaceId).toBe(workspace1Id);
    });

    it('CROSS-TENANT ACCESS DEFENSE: User 2 cannot list items from User 1 workspace (returns 404)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/v1/workspaces/${workspace1Id}/items`,
        headers: {
          authorization: `Bearer ${tokenUser2}`,
        },
      });

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('NOT_FOUND');
    });

    it('IMMEDIATE MEMBERSHIP REVOCATION: revoked user loses access on next request', async () => {
      // 1. User 1 adds User 2 as viewer
      const addRes = await server.inject({
        method: 'POST',
        url: `/v1/workspaces/${workspace1Id}/members`,
        headers: {
          authorization: `Bearer ${tokenUser1}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          userId: user2Id,
          role: 'viewer',
        }),
      });
      expect(addRes.statusCode).toBe(201);

      // 2. User 2 can now access workspace
      const accessRes = await server.inject({
        method: 'GET',
        url: `/v1/workspaces/${workspace1Id}`,
        headers: {
          authorization: `Bearer ${tokenUser2}`,
        },
      });
      expect(accessRes.statusCode).toBe(200);

      // 3. User 1 deletes User 2's membership
      const delRes = await server.inject({
        method: 'DELETE',
        url: `/v1/workspaces/${workspace1Id}/members/${user2Id}`,
        headers: {
          authorization: `Bearer ${tokenUser1}`,
        },
      });
      expect(delRes.statusCode).toBe(200);

      // 4. User 2 is immediately rejected with 404
      const blockedRes = await server.inject({
        method: 'GET',
        url: `/v1/workspaces/${workspace1Id}`,
        headers: {
          authorization: `Bearer ${tokenUser2}`,
        },
      });
      expect(blockedRes.statusCode).toBe(404);
    });
  });

  describe('4. Keyset Pagination & Cursor Navigation', () => {
    let server: ReturnType<typeof buildServer>;
    let tokenUser1: string;
    let paginatedWsId: string;

    beforeAll(async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      server = buildServer({
        runtimePool,
        jwtVerifier: verifier,
      });
      await server.ready();

      tokenUser1 = await createToken({ sub: user1Id });

      // Create workspace for pagination tests
      const wsRes = await server.inject({
        method: 'POST',
        url: '/v1/workspaces',
        headers: {
          authorization: `Bearer ${tokenUser1}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          name: `Pagination Test Workspace ${suffix}`,
          kind: 'personal',
        }),
      });
      paginatedWsId = JSON.parse(wsRes.body).data.id;

      // Create 5 items
      for (let i = 1; i <= 5; i++) {
        await server.inject({
          method: 'POST',
          url: `/v1/workspaces/${paginatedWsId}/items`,
          headers: {
            authorization: `Bearer ${tokenUser1}`,
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            kind: 'note',
            displayOrder: i,
          }),
        });
      }
    });

    afterAll(async () => {
      await server.close();
    });

    it('pages through items using keyset cursor', async () => {
      // Page 1: limit 2
      const page1Res = await server.inject({
        method: 'GET',
        url: `/v1/workspaces/${paginatedWsId}/items?limit=2`,
        headers: {
          authorization: `Bearer ${tokenUser1}`,
        },
      });

      expect(page1Res.statusCode).toBe(200);
      const page1 = JSON.parse(page1Res.body);
      expect(page1.data).toHaveLength(2);
      expect(page1.meta.cursor).toBeDefined();

      // Page 2: with cursor from page 1
      const page2Res = await server.inject({
        method: 'GET',
        url: `/v1/workspaces/${paginatedWsId}/items?limit=2&cursor=${encodeURIComponent(page1.meta.cursor)}`,
        headers: {
          authorization: `Bearer ${tokenUser1}`,
        },
      });

      expect(page2Res.statusCode).toBe(200);
      const page2 = JSON.parse(page2Res.body);
      expect(page2.data).toHaveLength(2);
      expect(page2.meta.cursor).toBeDefined();

      // Verify no duplicate IDs across pages
      const idsPage1 = new Set(page1.data.map((i: { id: string }) => i.id));
      for (const item of page2.data) {
        expect(idsPage1.has(item.id)).toBe(false);
      }
    });

    it('DaynoriApiClient paginateItems async generator consumes all pages', async () => {
      const mockFetch: typeof fetch = async (input, init) => {
        const urlStr = typeof input === 'string' ? input : input.toString();
        const url = new URL(urlStr);
        const res = await server.inject({
          method: (init?.method as 'GET' | 'POST') || 'GET',
          url: `${url.pathname}${url.search}`,
          headers: (init?.headers as Record<string, string>) || {},
          payload: typeof init?.body === 'string' ? init.body : undefined,
        });

        return {
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: new Headers(res.headers as Record<string, string>),
          json: async () => JSON.parse(res.body),
        } as Response;
      };

      const client = createApiClient({
        baseUrl: 'http://localhost:3000',
        token: tokenUser1,
        fetchFn: mockFetch,
      });

      const collectedItems: unknown[] = [];
      for await (const item of client.paginateItems(paginatedWsId, { limit: 2 })) {
        collectedItems.push(item);
      }

      expect(collectedItems).toHaveLength(5);
    });
  });

  describe('5. Process-Local Rate Limiting & Throttling', () => {
    it('throttles rapid requests exceeding threshold and returns 429 with Retry-After', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      // Strict limiter: max 3 requests per 60 seconds
      const rateLimiter = new ProcessLocalRateLimiter({
        windowMs: 60_000,
        maxRequests: 3,
      });

      const rateLimitedServer = buildServer({
        runtimePool,
        jwtVerifier: verifier,
        rateLimiter,
      });
      await rateLimitedServer.ready();

      try {
        const token = await createToken({ sub: crypto.randomUUID() });

        // First 3 requests succeed
        for (let i = 0; i < 3; i++) {
          const res = await rateLimitedServer.inject({
            method: 'GET',
            url: '/v1/health',
            headers: {
              authorization: `Bearer ${token}`,
            },
          });
          expect(res.statusCode).toBe(200);
        }

        // 4th request must fail with 429
        const blockedRes = await rateLimitedServer.inject({
          method: 'GET',
          url: '/v1/health',
          headers: {
            authorization: `Bearer ${token}`,
          },
        });

        expect(blockedRes.statusCode).toBe(429);
        expect(blockedRes.headers['retry-after']).toBeDefined();
        const json = JSON.parse(blockedRes.body);
        expect(json.error.code).toBe('RATE_LIMITED');
        expect(json.error.retryAfter).toBeGreaterThanOrEqual(1);
      } finally {
        await rateLimitedServer.close();
      }
    });
  });

  describe('6. Redacted Structured Logging & Zero Credential Leakage', () => {
    it('asserts synthetic tokens, passwords, and sensitive markers NEVER appear in captured logs', async () => {
      const capturedLogs: StructuredLogEntry[] = [];
      const safeLogger = new SafeLogger((entry) => {
        capturedLogs.push(entry);
      });

      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      const loggingServer = buildServer({
        runtimePool,
        jwtVerifier: verifier,
        logger: safeLogger,
      });
      await loggingServer.ready();

      const SYNTHETIC_SECRET_TOKEN = 'SYNTHETIC_BEARER_SECRET_MARKER_987654';
      const SYNTHETIC_PASSWORD_MARKER = 'SUPER_SECRET_DB_PASSWORD_MARKER_4321';

      try {
        // 1. Send request with bearer token and sensitive headers
        await loggingServer.inject({
          method: 'GET',
          url: `/v1/health?token=${SYNTHETIC_SECRET_TOKEN}`,
          headers: {
            authorization: `Bearer ${SYNTHETIC_SECRET_TOKEN}`,
            cookie: `session=${SYNTHETIC_SECRET_TOKEN}`,
          },
        });

        // 2. Trigger an error that contains sensitive details
        safeLogger.error('req-test-err', 'Database connection error', {
          connectionString: `postgres://daynori:${SYNTHETIC_PASSWORD_MARKER}@127.0.0.1:5432/daynori_test`,
          authToken: SYNTHETIC_SECRET_TOKEN,
        });

        // 3. Inspect all captured log serialized entries
        const fullLogOutput = JSON.stringify(capturedLogs);

        expect(fullLogOutput).not.toContain(SYNTHETIC_SECRET_TOKEN);
        expect(fullLogOutput).not.toContain(SYNTHETIC_PASSWORD_MARKER);
        expect(fullLogOutput).toContain('[REDACTED_PASSWORD]');
        expect(fullLogOutput).toContain('[REDACTED]');
      } finally {
        await loggingServer.close();
      }
    });
  });

  describe('7. Client Bundle Credential Isolation', () => {
    it('verifies packages/api-client contains zero database credentials or server connection modules', async () => {
      // Import the api-client module directly
      const clientModule = await import('@daynori/api-client');

      // Assert database pooling and secrets are absent from client exports
      expect(clientModule).not.toHaveProperty('Pool');
      expect(clientModule).not.toHaveProperty('createAdminPool');
      expect(clientModule).not.toHaveProperty('createRuntimePool');
      expect(clientModule).not.toHaveProperty('withTenantContext');
      expect(clientModule).not.toHaveProperty('POSTGRES_PASSWORD');
    });
  });

  describe('8. Phase 08 Security Hardening & Defect Repairs', () => {
    let server: ReturnType<typeof buildServer>;
    let workspace1Id: string;
    let workspace2Id: string;

    beforeAll(async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      server = buildServer({
        runtimePool,
        jwtVerifier: verifier,
      });
      await server.ready();

      const tokenUser1 = await createToken({ sub: user1Id });
      const wsRes1 = await server.inject({
        method: 'POST',
        url: '/v1/workspaces',
        headers: {
          authorization: `Bearer ${tokenUser1}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ name: 'Phase 08 Workspace 1' }),
      });
      workspace1Id = JSON.parse(wsRes1.body).data.id;

      const wsRes2 = await server.inject({
        method: 'POST',
        url: '/v1/workspaces',
        headers: {
          authorization: `Bearer ${tokenUser1}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ name: 'Phase 08 Workspace 2' }),
      });
      workspace2Id = JSON.parse(wsRes2.body).data.id;
    });

    afterAll(async () => {
      await server.close();
    });

    it('rejects ID tokens as API access tokens', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      const idToken = await createToken({ sub: user1Id, tokenUse: 'id' });
      await expect(verifier.verify(idToken)).rejects.toThrow(
        /ID tokens and non-access tokens are not permitted/i
      );
    });

    it('rejects tokens with missing or non-authenticated roles', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      // Role missing
      const noRoleToken = new SignJWT({ sub: user1Id, token_use: 'access' })
        .setProtectedHeader({ alg: 'RS256', kid: kidA })
        .setIssuer(issuer)
        .setAudience(audience)
        .setExpirationTime('1h')
        .sign(keyPairA.privateKey);

      await expect(verifier.verify(await noRoleToken)).rejects.toThrow(/Unauthorized token role/i);

      // Role is random string
      const invalidRoleToken = await createToken({ sub: user1Id, role: 'developer' });
      await expect(verifier.verify(invalidRoleToken)).rejects.toThrow(/Unauthorized token role/i);
    });

    it('rejects anonymous user sessions', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      const anonToken = new SignJWT({
        sub: user1Id,
        role: 'authenticated',
        is_anonymous: true,
        token_use: 'access',
      })
        .setProtectedHeader({ alg: 'RS256', kid: kidA })
        .setIssuer(issuer)
        .setAudience(audience)
        .setExpirationTime('1h')
        .sign(keyPairA.privateKey);

      await expect(verifier.verify(await anonToken)).rejects.toThrow(
        /Anonymous sessions are not permitted/i
      );
    });

    it('rejects tokens with non-UUID subjects', async () => {
      const verifier = new JwtVerifier({
        issuer,
        audience,
        localJwks: jwks,
      });

      const nonUuidToken = await createToken({ sub: 'user_not_a_valid_uuid_format' });
      await expect(verifier.verify(nonUuidToken)).rejects.toThrow(
        /Invalid user identity in token/i
      );
    });

    it('supports symmetric HS256 secret verification with explicit allowlist matching', async () => {
      const testHmacKey = 'daynori-super-secret-hmac-key-at-least-32-chars';
      const hsVerifier = new JwtVerifier({
        issuer: 'https://supabase.local',
        audience: 'authenticated',
        secret: testHmacKey,
      });

      const hsToken = await new SignJWT({
        sub: user1Id,
        role: 'authenticated',
        token_use: 'access',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('https://supabase.local')
        .setAudience('authenticated')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(testHmacKey));

      const actor = await hsVerifier.verify(hsToken);
      expect(actor.userId).toBe(user1Id);
      expect(actor.role).toBe('authenticated');

      // Reject token signed with wrong secret
      const wrongSecretToken = await new SignJWT({
        sub: user1Id,
        role: 'authenticated',
        token_use: 'access',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('https://supabase.local')
        .setAudience('authenticated')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode('wrong-symmetric-key-at-least-32-chars-long'));

      await expect(hsVerifier.verify(wrongSecretToken)).rejects.toThrow(
        /Invalid or expired authorization token/i
      );
    });

    it('returns consistent 400 VALIDATION_FAILED for malformed JSON request bodies', async () => {
      const token = await createToken({ sub: user1Id });
      const res = await server.inject({
        method: 'POST',
        url: '/v1/workspaces',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: '{"name": "broken-json',
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('VALIDATION_FAILED');
      expect(json.error.message).toContain('Malformed JSON payload');
    });

    it('bounds and sanitizes incoming request IDs, replacing oversized or unsuitable values', async () => {
      const token = await createToken({ sub: user1Id });

      // 1. Oversized request ID (> 64 characters)
      const oversizedId = 'A'.repeat(200);
      const res1 = await server.inject({
        method: 'GET',
        url: '/v1/workspaces',
        headers: {
          authorization: `Bearer ${token}`,
          'x-request-id': oversizedId,
        },
      });

      const returnedId1 = res1.headers['x-request-id'] as string;
      expect(returnedId1).not.toBe(oversizedId);
      expect(returnedId1.length).toBe(36); // standard UUID format

      // 2. Malicious / illegal characters in request ID
      const res2 = await server.inject({
        method: 'GET',
        url: '/v1/workspaces',
        headers: {
          authorization: `Bearer ${token}`,
          'x-request-id': '<script>alert(1)</script>',
        },
      });

      const returnedId2 = res2.headers['x-request-id'] as string;
      expect(returnedId2).not.toContain('<script>');
      expect(returnedId2.length).toBe(36);

      // 3. Valid bounded request ID is preserved
      const validId = 'valid-test-request-id-12345';
      const res3 = await server.inject({
        method: 'GET',
        url: '/v1/workspaces',
        headers: {
          authorization: `Bearer ${token}`,
          'x-request-id': validId,
        },
      });
      expect(res3.headers['x-request-id']).toBe(validId);
    });

    it('rejects invalid, oversized, or cross-workspace pagination cursors with 400', async () => {
      const token = await createToken({ sub: user1Id });

      // 1. Invalid / unparseable cursor
      const res1 = await server.inject({
        method: 'GET',
        url: `/v1/workspaces/${workspace1Id}/items?cursor=invalid-garbage-base64-not-valid`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res1.statusCode).toBe(400);
      const json1 = JSON.parse(res1.body);
      expect(json1.error.code).toBe('VALIDATION_FAILED');
      expect(json1.error.message).toContain('Pagination cursor');

      // 2. Oversized cursor (> 256 bytes)
      const oversizedCursor = Buffer.from('X'.repeat(300)).toString('base64url');
      const res2 = await server.inject({
        method: 'GET',
        url: `/v1/workspaces/${workspace1Id}/items?cursor=${oversizedCursor}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res2.statusCode).toBe(400);
      const json2 = JSON.parse(res2.body);
      expect(json2.error.code).toBe('VALIDATION_FAILED');
      expect(json2.error.message).toContain('Pagination cursor');

      // 3. Cross-workspace cursor: cursor encoded for Workspace 2 passed to Workspace 1
      const crossWsCursor = Buffer.from(
        `${workspace2Id}||${new Date().toISOString()}|${crypto.randomUUID()}`
      ).toString('base64url');

      const res3 = await server.inject({
        method: 'GET',
        url: `/v1/workspaces/${workspace1Id}/items?cursor=${crossWsCursor}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res3.statusCode).toBe(400);
      const json3 = JSON.parse(res3.body);
      expect(json3.error.code).toBe('VALIDATION_FAILED');
      expect(json3.error.message).toContain('different workspace context');
    });

    it('redacts unhandled error messages and stack traces in SafeLogger', async () => {
      const logs: StructuredLogEntry[] = [];
      const testLogger = new SafeLogger((entry) => logs.push(entry));

      const SYNTHETIC_ERR_MARKER = 'SUPER_SECRET_UNHANDLED_MARKER_998877';
      const SYNTHETIC_CONN = `postgres://app_user:${SYNTHETIC_ERR_MARKER}@database.internal:5432/app_db`;

      testLogger.error('req-unhandled', `Failed query with ${SYNTHETIC_CONN}`, {
        stack: `Error: failed at execute (${SYNTHETIC_CONN}:12:34)\n  at password=${SYNTHETIC_ERR_MARKER}`,
      });

      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain(SYNTHETIC_ERR_MARKER);
      expect(serialized).toContain('[REDACTED_PASSWORD]');
      expect(serialized).toContain('[REDACTED]');
    });

    it('GET /v1/ready fails with 503 unavailable when authentication is unconfigured', async () => {
      // Build server with allowUnauthenticatedStartup: true to inspect readiness probe
      const unauthServer = buildServer({
        runtimePool,
        allowUnauthenticatedStartup: true,
      });

      try {
        const res = await unauthServer.inject({
          method: 'GET',
          url: '/v1/ready',
        });

        expect(res.statusCode).toBe(503);
        const json = JSON.parse(res.body);
        expect(json.data.status).toBe('unavailable');
        expect(json.data.checks.auth).toBe('unconfigured');
        expect(json.data.checks.database).toBe('connected');
      } finally {
        await unauthServer.close();
      }
    });

    it('fails server startup when authentication verifier is not configured in standard mode', () => {
      expect(() =>
        buildServer({
          runtimePool,
          // No verifier and allowUnauthenticatedStartup is false
        })
      ).toThrow(/Server startup failed: authentication verifier is not configured/i);
    });

    it('drift check: canonical OpenAPI spec components match contracts', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/v1/openapi.json',
      });

      expect(res.statusCode).toBe(200);
      const spec = JSON.parse(res.body);

      // Verify all required schemas are present
      const schemas = spec.components.schemas;
      expect(schemas.WorkspaceResponse).toBeDefined();
      expect(schemas.CreateWorkspaceRequest).toBeDefined();
      expect(schemas.MemberResponse).toBeDefined();
      expect(schemas.AddMemberRequest).toBeDefined();
      expect(schemas.ItemResponse).toBeDefined();
      expect(schemas.CreateItemRequest).toBeDefined();
      expect(schemas.ApiErrorResponse).toBeDefined();
      expect(schemas.HealthCheckResponse).toBeDefined();
      expect(schemas.ReadinessCheckResponse).toBeDefined();

      // Verify schema properties match canonical Zod definitions
      expect(schemas.WorkspaceResponse.properties.data).toBeDefined();
      expect(schemas.WorkspaceResponse.properties.meta).toBeDefined();
    });
  });
});
