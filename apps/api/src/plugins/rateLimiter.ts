import type { FastifyRequest, FastifyReply } from 'fastify';
import { resolveClientIp } from '../config/trustedProxies.js';

export class RateLimitError extends Error {
  public readonly retryAfterSeconds: number;

  constructor(message = 'Rate limit exceeded. Please retry later.', retryAfterSeconds = 60) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface RateLimiterOptions {
  windowMs?: number; // Time window in milliseconds (default 60,000ms = 1 min)
  maxRequests?: number; // Max requests allowed per window for standard routes (default 60)
  sensitiveWindowMs?: number; // Window for sensitive/brute-force sensitive routes (default 60,000ms)
  sensitiveMaxRequests?: number; // Max requests allowed for sensitive routes (default 10)
  sensitiveRoutePatterns?: (string | RegExp)[]; // Patterns identifying sensitive routes
}

interface WindowBucket {
  count: number;
  resetAt: number;
}

const DEFAULT_SENSITIVE_PATTERNS: (string | RegExp)[] = [
  /^\/v1\/auth\/(login|recovery|reset|register|signup)/i,
  /^\/v1\/deletion\/request/i,
  /^\/v1\/operator\/auth/i,
];

/**
 * Process-Local Sliding Window Rate Limiter with Trusted Proxy Ingress Hardening
 *
 * NOTE ON ARCHITECTURE & MULTI-INSTANCE LIMITATIONS:
 * 1. Counter Storage: Maintained in local Node.js process heap memory (Map).
 *    Provides low-overhead protection without external database/Redis dependencies.
 * 2. Multi-Instance Behavior: In a multi-instance deployment (e.g. N PaaS containers),
 *    each process maintains its own independent window. If traffic is balanced across N
 *    instances, a client could theoretically execute up to N * maxRequests across the cluster.
 * 3. Brute-Force Defense: To mitigate cluster-multiplier effects on sensitive routes (auth, password
 *    recovery, account deletion), sensitive endpoints enforce strict tighter thresholds
 *    (default 10 req/min per resolved IP).
 * 4. Ingress Header Security: Raw client-supplied `CF-Connecting-IP` and leftmost `X-Forwarded-For`
 *    headers are NEVER trusted directly. IP resolution uses strict right-to-left traversal
 *    against verified proxy CIDRs (RFC 1918, CGNAT, Cloudflare).
 */
export class ProcessLocalRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly sensitiveWindowMs: number;
  private readonly sensitiveMaxRequests: number;
  private readonly sensitivePatterns: (string | RegExp)[];
  private readonly buckets = new Map<string, WindowBucket>();
  private lastCleanup = Date.now();

  constructor(options?: RateLimiterOptions) {
    this.windowMs = options?.windowMs ?? 60_000;
    this.maxRequests = options?.maxRequests ?? 60;
    this.sensitiveWindowMs = options?.sensitiveWindowMs ?? 60_000;
    this.sensitiveMaxRequests = options?.sensitiveMaxRequests ?? 10;
    this.sensitivePatterns = options?.sensitiveRoutePatterns ?? DEFAULT_SENSITIVE_PATTERNS;
  }

  private isSensitiveRoute(url?: string): boolean {
    if (!url) return false;
    const cleanUrl = url.split('?')[0] || url;
    return this.sensitivePatterns.some((pattern) =>
      typeof pattern === 'string' ? cleanUrl.startsWith(pattern) : pattern.test(cleanUrl)
    );
  }

  private getKey(request: FastifyRequest, isSensitive: boolean): string {
    const rawUrl = request.url ? (request.url.split('?')[0] || request.url) : '';
    // If actor is authenticated, key by verified user ID
    if (request.actor?.userId) {
      return isSensitive
        ? `actor:sensitive:${request.actor.userId}:${rawUrl}`
        : `actor:${request.actor.userId}`;
    }

    // Securely resolve genuine client IP via right-to-left traversal against trusted proxy CIDRs
    const clientIp = resolveClientIp(request);
    return isSensitive
      ? `ip:sensitive:${clientIp}:${rawUrl}`
      : `ip:${clientIp}`;
  }

  private cleanup(): void {
    const now = Date.now();
    // Periodically remove expired buckets every 2 minutes
    if (now - this.lastCleanup > 120_000) {
      for (const [key, bucket] of this.buckets.entries()) {
        if (now > bucket.resetAt) {
          this.buckets.delete(key);
        }
      }
      this.lastCleanup = now;
    }
  }

  check(request: FastifyRequest, reply: FastifyReply): void {
    const url = request.url ? (request.url.split('?')[0] || request.url) : '';
    // Health probes must never be throttled by rate limiting to prevent false-positive alert flaps
    if (url === '/health' || url === '/api/health' || url === '/v1/health') {
      return;
    }

    this.cleanup();

    const isSensitive = this.isSensitiveRoute(url);
    const effectiveLimit = isSensitive ? this.sensitiveMaxRequests : this.maxRequests;
    const effectiveWindow = isSensitive ? this.sensitiveWindowMs : this.windowMs;

    const key = this.getKey(request, isSensitive);
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = {
        count: 1,
        resetAt: now + effectiveWindow,
      };
      this.buckets.set(key, bucket);
    } else {
      bucket.count += 1;
    }

    const remaining = Math.max(0, effectiveLimit - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    reply.header('X-RateLimit-Limit', effectiveLimit);
    reply.header('X-RateLimit-Remaining', remaining);
    reply.header('X-RateLimit-Reset', resetSeconds);

    if (bucket.count > effectiveLimit) {
      reply.header('Retry-After', resetSeconds);
      throw new RateLimitError(
        isSensitive
          ? `Rate limit exceeded: maximum ${effectiveLimit} attempts per minute for sensitive endpoint.`
          : `Rate limit exceeded: maximum ${effectiveLimit} requests per minute.`,
        resetSeconds
      );
    }
  }
}
