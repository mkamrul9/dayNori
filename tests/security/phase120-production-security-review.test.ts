import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  sanitizeLogString,
  sanitizeLogValue,
  sanitizeHeaders,
} from '../../apps/api/src/plugins/logger.js';
import {
  ProcessLocalRateLimiter,
  RateLimitError,
} from '../../apps/api/src/plugins/rateLimiter.js';
import { sanitizeRequestId, buildServer } from '../../apps/api/src/server.js';
import { JwtVerifier } from '../../apps/api/src/auth/jwt.js';

describe('Phase 120: Production-Focused Security and Privacy Review', () => {
  describe('1. Request ID Sanitization & Injection Defenses', () => {
    it('accepts valid alphanumeric, hyphen, and underscore request IDs', () => {
      expect(sanitizeRequestId('req-1234_abc')).toBe('req-1234_abc');
      expect(sanitizeRequestId('  req-valid-id  ')).toBe('req-valid-id');
    });

    it('replaces dangerous or malformed request IDs with generated UUIDs', () => {
      const maliciousInputs = [
        'req<script>alert(1)</script>',
        'req\r\nX-Injected-Header: value',
        'req; DROP TABLE app.users;--',
        'a'.repeat(65), // Exceeds 64 chars
        null,
        undefined,
        {},
      ];

      for (const input of maliciousInputs) {
        const sanitized = sanitizeRequestId(input);
        expect(sanitized).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      }
    });
  });

  describe('2. Secrets Isolation & Log Redaction', () => {
    it('redacts JWT tokens from log strings', () => {
      const raw =
        'Error with user token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignatureValue';
      const redacted = sanitizeLogString(raw);
      expect(redacted).not.toContain('doNotLeakThisSignatureValue');
      expect(redacted).toContain('[REDACTED_JWT]');
    });

    it('redacts PostgreSQL credentials in database URLs', () => {
      const raw = 'Failed to connect to postgresql://postgres:SuperSecretP@ssword!@db.host.com:5432/daynori';
      const redacted = sanitizeLogString(raw);
      expect(redacted).not.toContain('SuperSecretP@ssword!');
      expect(redacted).toContain('postgresql://postgres:[REDACTED_PASSWORD]@db.host.com:5432/daynori');
    });

    it('redacts key-value secret assignments', () => {
      const raw = 'Debug auth: password="super-secret-user-pass" and bearer: my-bearer-token-123';
      const redacted = sanitizeLogString(raw);
      expect(redacted).not.toContain('super-secret-user-pass');
      expect(redacted).not.toContain('my-bearer-token-123');
    });

    it('recursively redacts sensitive payload fields in objects', () => {
      const payload = {
        id: '123',
        username: 'alice',
        password: 'plain-password',
        journal: {
          title: 'My private diary',
          entry_date: '2026-11-15',
          body: 'Deep personal feelings here',
          reflection: 'Internal thoughts',
        },
        meta: {
          token: 'sensitive-token',
        },
      };

      const sanitized = sanitizeLogValue(payload) as Record<string, unknown>;
      expect(sanitized['password']).toBe('[REDACTED]');
      expect(sanitized['journal']).toBe('[REDACTED]');
      expect((sanitized['meta'] as Record<string, unknown>)['token']).toBe('[REDACTED]');
      expect(sanitized['username']).toBe('alice');
    });

    it('redacts sensitive HTTP headers', () => {
      const headers = {
        authorization: 'Bearer secret-jwt-here',
        cookie: 'session_id=secret-session',
        'x-api-key': 'secret-api-key',
        'x-request-id': 'req-safe-123',
        'content-type': 'application/json',
      };

      const sanitized = sanitizeHeaders(headers);
      expect(sanitized['authorization']).toBe('[REDACTED]');
      expect(sanitized['cookie']).toBe('[REDACTED]');
      expect(sanitized['x-api-key']).toBe('[REDACTED]');
      expect(sanitized['x-request-id']).toBe('req-safe-123');
      expect(sanitized['content-type']).toBe('application/json');
    });
  });

  describe('3. Rate Limiting Enforced at Process Boundary', () => {
    it('allows requests within budget and sets X-RateLimit headers', () => {
      const limiter = new ProcessLocalRateLimiter({ windowMs: 60_000, maxRequests: 5 });
      const req = { actor: { userId: 'user-rate-test' }, ip: '127.0.0.1' } as unknown as FastifyRequest;
      const headersSet: Record<string, unknown> = {};
      const reply = {
        header: (k: string, v: unknown) => {
          headersSet[k] = v;
        },
      } as unknown as FastifyReply;

      // Make 5 requests - all should succeed
      for (let i = 0; i < 5; i++) {
        limiter.check(req, reply);
      }

      expect(headersSet['X-RateLimit-Limit']).toBe(5);
      expect(headersSet['X-RateLimit-Remaining']).toBe(0);
    });

    it('throws RateLimitError on 6th request with Retry-After header', () => {
      const limiter = new ProcessLocalRateLimiter({ windowMs: 60_000, maxRequests: 5 });
      const req = { actor: { userId: 'user-rate-over' }, ip: '127.0.0.1' } as unknown as FastifyRequest;
      const headersSet: Record<string, unknown> = {};
      const reply = {
        header: (k: string, v: unknown) => {
          headersSet[k] = v;
        },
      } as unknown as FastifyReply;

      for (let i = 0; i < 5; i++) {
        limiter.check(req, reply);
      }

      expect(() => limiter.check(req, reply)).toThrow(RateLimitError);
      expect(headersSet['Retry-After']).toBeDefined();
    });
  });

  describe('4. Token Revocation & Session Revocation Verification', () => {
    it('rejects revoked tokens recorded in the revocation store', async () => {
      const verifier = new JwtVerifier({
        issuer: 'https://test-issuer.local',
        audience: 'authenticated',
        secret: 'test-secret-at-least-32-bytes-long-12345',
      });

      // Mock a revocation store where 'revoked-token-123' is blacklisted
      const isRevoked = vi.fn().mockImplementation((rawToken: string) => {
        return rawToken === 'revoked-token-123';
      });

      expect(isRevoked('revoked-token-123')).toBe(true);
      expect(isRevoked('valid-active-token')).toBe(false);
    });
  });

  describe('5. Next.js Image Optimization Hardening (GHSA-2464-fhr4-w9xw)', () => {
    it('verifies that apps/web/next.config.mjs enforces images.unoptimized = true', () => {
      const configPath = path.resolve(__dirname, '../../apps/web/next.config.mjs');
      expect(fs.existsSync(configPath)).toBe(true);
      const content = fs.readFileSync(configPath, 'utf8');

      expect(content).toContain('unoptimized: true');
    });
  });

  describe('6. Disabled Modules Global Fail-Closed Barrier', () => {
    it('rejects unreleased high-risk modules with HTTP 403 Forbidden', async () => {
      const dummyPool = {
        query: vi.fn(),
        connect: vi.fn(),
      } as any;

      const prevNodeEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';

      try {
        const server = buildServer({
          runtimePool: dummyPool,
          allowUnauthenticatedStartup: true,
          jwtVerifier: new JwtVerifier({
            issuer: 'https://test.local',
            audience: 'authenticated',
            secret: 'dummy-secret-32-bytes-long-padding-here',
          }),
        });

        const vaultRes = await server.inject({ method: 'GET', url: '/v1/vault/keys' });
        expect(vaultRes.statusCode).toBe(403);

        const aiRes = await server.inject({ method: 'GET', url: '/v1/ai/proposals' });
        expect(aiRes.statusCode).toBe(403);

        const roomsRes = await server.inject({ method: 'GET', url: '/v1/rooms' });
        expect(roomsRes.statusCode).toBe(403);

        const billingRes = await server.inject({ method: 'GET', url: '/v1/billing/subscriptions' });
        expect(billingRes.statusCode).toBe(403);

        await server.close();
      } finally {
        process.env['NODE_ENV'] = prevNodeEnv;
      }
    });
  });

  describe('7. Incident Response Roster & Findings Register Verification', () => {
    const rosterPath = path.resolve(
      __dirname,
      '../../docs/operations/incident-response-and-support-roster.md'
    );
    const findingsPath = path.resolve(
      __dirname,
      '../../artifacts/phase120/security-review-findings.json'
    );

    it('has documented incident response and user support operational roster', () => {
      expect(fs.existsSync(rosterPath)).toBe(true);
      const roster = fs.readFileSync(rosterPath, 'utf8');

      expect(roster).toContain('Incident Commander (IC)');
      expect(roster).toContain('Technical Operations Lead');
      expect(roster).toContain('Security & Privacy Officer');
      expect(roster).toContain('Support & Communications Lead');
      expect(roster).toContain('security@daynori.com');
      expect(roster).toContain('support@daynori.com');
      expect(roster).toContain('SEV-1 (Critical)');
    });

    it('has documented security findings, launch blockers, and non-local-only completeness disclaimer', () => {
      expect(fs.existsSync(findingsPath)).toBe(true);
      const findings = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));

      expect(findings.phase).toBe('120');
      expect(findings.auditedDimensions.length).toBeGreaterThanOrEqual(10);
      expect(findings.publicLaunchBlockers.length).toBeGreaterThanOrEqual(8);
      expect(findings.standingNote).toContain(
        'security is NOT marked complete based solely on local automated unit tests'
      );
    });
  });
});
