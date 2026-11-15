import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  isCloudflareIp,
  isTrustedProxy,
  ipInCidr,
  resolveClientIp,
  CLOUDFLARE_IPV4_CIDRS,
  CLOUDFLARE_IPV6_CIDRS,
  PRIVATE_PROXY_CIDRS,
  TRUSTED_PROXY_CIDRS,
} from '../../apps/api/src/config/trustedProxies.js';
import {
  ProcessLocalRateLimiter,
  RateLimitError,
} from '../../apps/api/src/plugins/rateLimiter.js';

function createMockReply(): { reply: FastifyReply; headers: Record<string, unknown> } {
  const headers: Record<string, unknown> = {};
  const reply = {
    header: (k: string, v: unknown) => {
      headers[k] = v;
      return reply;
    },
  } as unknown as FastifyReply;
  return { reply, headers };
}

function createMockRequest(options: {
  socketIp?: string;
  ip?: string;
  headers?: Record<string, string>;
  url?: string;
  actor?: { userId: string };
}): FastifyRequest {
  const socketIp = options.socketIp ?? options.ip ?? '127.0.0.1';
  return {
    url: options.url ?? '/v1/notes',
    ip: options.ip ?? socketIp,
    headers: options.headers ?? {},
    raw: {
      socket: {
        remoteAddress: socketIp,
      },
    },
    actor: options.actor,
  } as unknown as FastifyRequest;
}

describe('Phase 124: Proxy Trust, Rate Limiter Ingress Hardening & Spoofing Defense', () => {
  describe('1. CIDR Matching & Trusted Proxy Identification', () => {
    it('accurately identifies Cloudflare IPv4 ranges', () => {
      expect(isCloudflareIp('173.245.48.1')).toBe(true);
      expect(isCloudflareIp('103.21.244.50')).toBe(true);
      expect(isCloudflareIp('141.101.64.1')).toBe(true);
      expect(isCloudflareIp('108.162.192.200')).toBe(true);
      expect(isCloudflareIp('190.93.240.15')).toBe(true);
      expect(isCloudflareIp('188.114.96.10')).toBe(true);
      expect(isCloudflareIp('197.234.240.1')).toBe(true);
      expect(isCloudflareIp('198.41.128.5')).toBe(true);
      expect(isCloudflareIp('162.158.0.99')).toBe(true);
      expect(isCloudflareIp('104.16.0.1')).toBe(true);
      expect(isCloudflareIp('104.24.0.1')).toBe(true);
      expect(isCloudflareIp('172.64.0.1')).toBe(true);
      expect(isCloudflareIp('131.0.72.1')).toBe(true);
      // Non-Cloudflare public IPs
      expect(isCloudflareIp('8.8.8.8')).toBe(false);
      expect(isCloudflareIp('1.1.1.1')).toBe(false); // 1.1.1.1 is public recursive DNS, not an edge reverse-proxy ingress range
      expect(isCloudflareIp('203.0.113.195')).toBe(false);
      expect(isCloudflareIp('198.51.100.1')).toBe(false);
    });

    it('accurately identifies private and CGNAT proxy ranges (Render & internal)', () => {
      // Loopback
      expect(isTrustedProxy('127.0.0.1')).toBe(true);
      expect(isTrustedProxy('::1')).toBe(true);
      // RFC 1918 Private
      expect(isTrustedProxy('10.0.1.25')).toBe(true);
      expect(isTrustedProxy('172.16.0.5')).toBe(true);
      expect(isTrustedProxy('172.31.255.254')).toBe(true);
      expect(isTrustedProxy('192.168.1.100')).toBe(true);
      // RFC 6598 CGNAT (Render internal load balancers)
      expect(isTrustedProxy('100.64.0.1')).toBe(true);
      expect(isTrustedProxy('100.127.255.254')).toBe(true);
      // Public untrusted IP
      expect(isTrustedProxy('203.0.113.50')).toBe(false);
    });

    it('exports complete CIDR list for Fastify trustProxy configuration', () => {
      expect(TRUSTED_PROXY_CIDRS.length).toBeGreaterThan(20);
      expect(TRUSTED_PROXY_CIDRS).toContain('127.0.0.1');
      expect(TRUSTED_PROXY_CIDRS).toContain('10.0.0.0/8');
      expect(TRUSTED_PROXY_CIDRS).toContain('100.64.0.0/10');
      expect(TRUSTED_PROXY_CIDRS).toContain('172.64.0.0/13');
    });
  });

  describe('2. Client IP Resolution: Spoofing Defense & Ingress Invariants', () => {
    it('discards forged CF-Connecting-IP and X-Forwarded-For when connecting directly from untrusted peer', () => {
      const untrustedPeerIp = '198.51.100.42'; // Public client connecting directly
      const req = createMockRequest({
        socketIp: untrustedPeerIp,
        ip: untrustedPeerIp,
        headers: {
          'cf-connecting-ip': '203.0.113.1', // Attacker attempting to claim a fake IP
          'x-forwarded-for': '192.0.2.1, 192.0.2.2',
        },
      });

      const resolved = resolveClientIp(req);
      // Must NOT trust the forged headers, must resolve directly to the untrusted socket IP!
      expect(resolved).toBe(untrustedPeerIp);
      expect(resolved).not.toBe('203.0.113.1');
      expect(resolved).not.toBe('192.0.2.1');
    });

    it('rejects forged CF-Connecting-IP when connecting via internal proxy (Render) without Cloudflare hop', () => {
      const renderProxyIp = '10.0.1.2'; // Render internal proxy
      const attackerRealIp = '203.0.113.55';
      const req = createMockRequest({
        socketIp: renderProxyIp,
        headers: {
          'cf-connecting-ip': '1.2.3.4', // Forged CF header sent directly to Render
          'x-forwarded-for': `${attackerRealIp}, ${renderProxyIp}`,
        },
      });

      const resolved = resolveClientIp(req);
      // Because no Cloudflare IP is in the proxy chain, CF-Connecting-IP is untrusted
      expect(resolved).toBe(attackerRealIp);
      expect(resolved).not.toBe('1.2.3.4');
    });

    it('ignores attacker-prepended leftmost IPs in X-Forwarded-For via right-to-left traversal', () => {
      const renderProxyIp = '10.0.1.2';
      const genuineClientIp = '198.51.100.77';
      // Attacker sends header: "1.1.1.1, 2.2.2.2, 3.3.3.3"
      // Render proxy appends client IP and its own IP: "1.1.1.1, 2.2.2.2, 3.3.3.3, 198.51.100.77, 10.0.1.2"
      const forgedXff = `1.1.1.1, 2.2.2.2, 3.3.3.3, ${genuineClientIp}, ${renderProxyIp}`;
      const req = createMockRequest({
        socketIp: renderProxyIp,
        headers: {
          'x-forwarded-for': forgedXff,
        },
      });

      const resolved = resolveClientIp(req);
      // Right-to-left traversal:
      // hop[4] = 10.0.1.2 (trusted proxy) -> continue
      // hop[3] = 198.51.100.77 (untrusted client) -> genuine client IP!
      // leftmost hops 1.1.1.1, 2.2.2.2, 3.3.3.3 are ignored!
      expect(resolved).toBe(genuineClientIp);
    });

    it('trusts CF-Connecting-IP only when verified Cloudflare edge IP is present in ingress chain', () => {
      const renderProxyIp = '10.0.1.2';
      const cloudflareEdgeIp = '172.64.10.1'; // Official Cloudflare CIDR (172.64.0.0/13)
      const endUserIp = '203.0.113.88';

      const req = createMockRequest({
        socketIp: renderProxyIp,
        headers: {
          'cf-connecting-ip': endUserIp,
          'x-forwarded-for': `${endUserIp}, ${cloudflareEdgeIp}, ${renderProxyIp}`,
        },
      });

      const resolved = resolveClientIp(req);
      // Cloudflare hop verified -> CF-Connecting-IP is authoritative
      expect(resolved).toBe(endUserIp);
    });
  });

  describe('3. Unauthenticated Rate Limiting & Header Forgery Resistance', () => {
    let limiter: ProcessLocalRateLimiter;

    beforeEach(() => {
      limiter = new ProcessLocalRateLimiter({
        windowMs: 60_000,
        maxRequests: 5,
        sensitiveMaxRequests: 3,
      });
    });

    it('prevents attacker from bypassing rate limit by randomizing CF-Connecting-IP on direct connection', () => {
      const attackerSocketIp = '198.51.100.99';
      const { reply, headers } = createMockReply();

      // Attacker fires 5 requests, each with a different forged CF-Connecting-IP
      for (let i = 1; i <= 5; i++) {
        const req = createMockRequest({
          socketIp: attackerSocketIp,
          headers: {
            'cf-connecting-ip': `103.21.244.${i}`, // Rotating forged CF IPs
          },
        });
        limiter.check(req, reply);
      }

      expect(headers['X-RateLimit-Limit']).toBe(5);
      expect(headers['X-RateLimit-Remaining']).toBe(0);

      // 6th request with yet another forged CF-Connecting-IP MUST be blocked!
      const blockedReq = createMockRequest({
        socketIp: attackerSocketIp,
        headers: {
          'cf-connecting-ip': '103.21.244.99',
        },
      });

      expect(() => limiter.check(blockedReq, reply)).toThrow(RateLimitError);
      expect(headers['Retry-After']).toBeDefined();
    });

    it('prevents attacker from bypassing rate limit by randomizing leftmost X-Forwarded-For IP through Render', () => {
      const renderProxyIp = '10.0.1.2';
      const attackerClientIp = '198.51.100.123';
      const { reply, headers } = createMockReply();

      // Attacker fires 5 requests, randomizing their fake leftmost XFF header
      for (let i = 1; i <= 5; i++) {
        const req = createMockRequest({
          socketIp: renderProxyIp,
          headers: {
            'x-forwarded-for': `1.2.3.${i}, ${attackerClientIp}, ${renderProxyIp}`,
          },
        });
        limiter.check(req, reply);
      }

      expect(headers['X-RateLimit-Remaining']).toBe(0);

      // 6th request with another fake leftmost IP MUST be blocked
      const blockedReq = createMockRequest({
        socketIp: renderProxyIp,
        headers: {
          'x-forwarded-for': `9.9.9.9, ${attackerClientIp}, ${renderProxyIp}`,
        },
      });

      expect(() => limiter.check(blockedReq, reply)).toThrow(RateLimitError);
    });

    it('allows distinct genuine clients behind the same proxy to have separate rate limit buckets', () => {
      const renderProxyIp = '10.0.1.2';
      const clientA = '198.51.100.10';
      const clientB = '198.51.100.20';
      const { reply } = createMockReply();

      // Client A exhausts their limit
      for (let i = 0; i < 5; i++) {
        const reqA = createMockRequest({
          socketIp: renderProxyIp,
          headers: { 'x-forwarded-for': `${clientA}, ${renderProxyIp}` },
        });
        limiter.check(reqA, reply);
      }

      // Client A is throttled
      const reqABlocked = createMockRequest({
        socketIp: renderProxyIp,
        headers: { 'x-forwarded-for': `${clientA}, ${renderProxyIp}` },
      });
      expect(() => limiter.check(reqABlocked, reply)).toThrow(RateLimitError);

      // Client B from different IP should still succeed
      const reqB = createMockRequest({
        socketIp: renderProxyIp,
        headers: { 'x-forwarded-for': `${clientB}, ${renderProxyIp}` },
      });
      expect(() => limiter.check(reqB, reply)).not.toThrow();
    });
  });

  describe('4. Sensitive Route Brute-Force Protection', () => {
    let limiter: ProcessLocalRateLimiter;

    beforeEach(() => {
      limiter = new ProcessLocalRateLimiter({
        windowMs: 60_000,
        maxRequests: 50,
        sensitiveMaxRequests: 3, // Strict limit for sensitive routes
      });
    });

    it('enforces strict lower rate limit on auth/login routes', () => {
      const clientIp = '198.51.100.15';
      const { reply, headers } = createMockReply();

      for (let i = 0; i < 3; i++) {
        const req = createMockRequest({
          socketIp: clientIp,
          url: '/v1/auth/login',
        });
        limiter.check(req, reply);
      }

      expect(headers['X-RateLimit-Limit']).toBe(3);
      expect(headers['X-RateLimit-Remaining']).toBe(0);

      // 4th login attempt is immediately throttled
      const reqBlocked = createMockRequest({
        socketIp: clientIp,
        url: '/v1/auth/login',
      });
      expect(() => limiter.check(reqBlocked, reply)).toThrow(RateLimitError);
    });

    it('enforces strict limit on password recovery and account deletion routes', () => {
      const clientIp = '198.51.100.16';
      const { reply } = createMockReply();

      // Test recovery route
      for (let i = 0; i < 3; i++) {
        const req = createMockRequest({
          socketIp: clientIp,
          url: '/v1/auth/recovery',
        });
        limiter.check(req, reply);
      }
      expect(() =>
        limiter.check(createMockRequest({ socketIp: clientIp, url: '/v1/auth/recovery' }), reply)
      ).toThrow(RateLimitError);

      // Test account deletion route
      const clientIp2 = '198.51.100.17';
      for (let i = 0; i < 3; i++) {
        const req = createMockRequest({
          socketIp: clientIp2,
          url: '/v1/deletion/request',
        });
        limiter.check(req, reply);
      }
      expect(() =>
        limiter.check(createMockRequest({ socketIp: clientIp2, url: '/v1/deletion/request' }), reply)
      ).toThrow(RateLimitError);
    });

    it('exempts health check routes from rate limiting to prevent uptime false alarms', () => {
      const clientIp = '198.51.100.18';
      const { reply } = createMockReply();

      // 20 health checks in rapid succession should all succeed
      for (let i = 0; i < 20; i++) {
        const req = createMockRequest({
          socketIp: clientIp,
          url: '/v1/health',
        });
        expect(() => limiter.check(req, reply)).not.toThrow();
      }
    });
  });

  describe('5. Multi-Instance Rate Limiting Behavior Simulation & Limitations', () => {
    it('demonstrates cluster-multiplier effect across N process instances', () => {
      // In a multi-instance deployment (e.g. 2 Render instances behind round-robin load balancer),
      // each Node.js process maintains an independent in-memory Map.
      const instance1 = new ProcessLocalRateLimiter({ windowMs: 60_000, maxRequests: 5 });
      const instance2 = new ProcessLocalRateLimiter({ windowMs: 60_000, maxRequests: 5 });

      const clientIp = '198.51.100.200';
      const { reply } = createMockReply();

      // Client sends 5 requests routed to Instance 1
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({ socketIp: clientIp });
        instance1.check(req, reply);
      }

      // Instance 1 is exhausted
      expect(() =>
        instance1.check(createMockRequest({ socketIp: clientIp }), reply)
      ).toThrow(RateLimitError);

      // Because instance 2 has a separate in-memory bucket, it still allows requests
      // This proves that effective cluster throughput is N * maxRequests
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({ socketIp: clientIp });
        expect(() => instance2.check(req, reply)).not.toThrow();
      }

      // After 5 requests on instance 2, it is also exhausted
      expect(() =>
        instance2.check(createMockRequest({ socketIp: clientIp }), reply)
      ).toThrow(RateLimitError);
    });
  });
});
