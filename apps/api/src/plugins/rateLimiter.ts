import type { FastifyRequest, FastifyReply } from 'fastify';

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
  maxRequests?: number; // Max requests allowed per window (default 60)
}

interface WindowBucket {
  count: number;
  resetAt: number;
}

/**
 * Process-Local Sliding Window Rate Limiter
 *
 * NOTE ON ARCHITECTURE:
 * This rate limiter maintains counters strictly in local process memory.
 * It provides process-level throttling and brute-force protection without requiring
 * external infrastructure like Redis or managed cache services.
 * In a multi-instance deployment, each process instance enforces its own budget.
 */
export class ProcessLocalRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly buckets = new Map<string, WindowBucket>();
  private lastCleanup = Date.now();

  constructor(options?: RateLimiterOptions) {
    this.windowMs = options?.windowMs ?? 60_000;
    this.maxRequests = options?.maxRequests ?? 60;
  }

  private getKey(request: FastifyRequest): string {
    // Key by verified actor ID if authenticated, else client IP address
    if (request.actor?.userId) {
      return `actor:${request.actor.userId}`;
    }
    return `ip:${request.ip || 'unknown'}`;
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
    this.cleanup();

    const key = this.getKey(request);
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = {
        count: 1,
        resetAt: now + this.windowMs,
      };
      this.buckets.set(key, bucket);
    } else {
      bucket.count += 1;
    }

    const remaining = Math.max(0, this.maxRequests - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    reply.header('X-RateLimit-Limit', this.maxRequests);
    reply.header('X-RateLimit-Remaining', remaining);
    reply.header('X-RateLimit-Reset', resetSeconds);

    if (bucket.count > this.maxRequests) {
      reply.header('Retry-After', resetSeconds);
      throw new RateLimitError(
        `Rate limit exceeded: maximum ${this.maxRequests} requests per minute.`,
        resetSeconds
      );
    }
  }
}
