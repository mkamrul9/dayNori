import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  simulateBangladeshNetworkDelay,
  computePercentiles,
  USER_CAPACITY_MODELS,
  assertHttpsStagingUrl,
} from '../../scripts/run-phase121-load-testing.mjs';
import { ProcessLocalRateLimiter, RateLimitError } from '../../apps/api/src/plugins/rateLimiter';
import type { FastifyRequest, FastifyReply } from 'fastify';

describe('Phase 121: Production-Scale Capacity and Load Verification Suite', () => {
  describe('Bangladesh Network Delay Simulation', () => {
    it('enforces lower bound and models realistic RTT and packet loss distribution', () => {
      const delays: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const delay = simulateBangladeshNetworkDelay();
        expect(delay).toBeGreaterThanOrEqual(40);
        delays.push(delay);
      }

      const mean = delays.reduce((acc, v) => acc + v, 0) / delays.length;
      expect(mean).toBeGreaterThanOrEqual(80);
      expect(mean).toBeLessThanOrEqual(120);

      // Verify occasional TCP retransmission spike from 1.5% packet loss
      const maxDelay = Math.max(...delays);
      expect(maxDelay).toBeGreaterThanOrEqual(200);
    });
  });

  describe('Percentile Computation Engine', () => {
    it('handles empty input gracefully', () => {
      const emptyStats = computePercentiles([]);
      expect(emptyStats).toEqual({
        min: 0,
        max: 0,
        mean: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      });
    });

    it('accurately computes p50, p95, and p99 on monotonic distributions', () => {
      const sequence = Array.from({ length: 100 }, (_, i) => i + 1); // 1 to 100
      const stats = computePercentiles(sequence);

      expect(stats.min).toBe(1);
      expect(stats.max).toBe(100);
      expect(stats.mean).toBe(51);
      expect(stats.p50).toBe(51);
      expect(stats.p95).toBe(96);
      expect(stats.p99).toBe(100);
    });
  });

  describe('User Capacity Scenarios and Invariants', () => {
    it('validates 1,000, 5,000, and 10,000 user model invariants', () => {
      const models = ['1000_users', '5000_users', '10000_users'] as const;

      for (const key of models) {
        const model = USER_CAPACITY_MODELS[key];
        expect(model).toBeDefined();
        expect(model.registeredUsers).toBeGreaterThan(0);
        expect(model.estimatedDau).toBeGreaterThan(0);
        expect(model.peakConcurrentUsers).toBeGreaterThan(0);
        expect(model.peakRequestsPerSecond).toBeGreaterThan(0);

        // Read/Write mix invariant: must sum to exactly 100%
        expect(model.readWriteMix.readPercent + model.readWriteMix.writePercent).toBe(100);
        expect(model.readWriteMix.readPercent).toBe(75);
        expect(model.readWriteMix.writePercent).toBe(25);

        // Concurrency ratio invariant: PCU must be ~10-12% of DAU
        const pcuRatio = model.peakConcurrentUsers / model.estimatedDau;
        expect(pcuRatio).toBeGreaterThanOrEqual(0.09);
        expect(pcuRatio).toBeLessThanOrEqual(0.15);
      }

      // Monotonic scaling invariant
      expect(USER_CAPACITY_MODELS['1000_users'].peakRequestsPerSecond).toBeLessThan(
        USER_CAPACITY_MODELS['5000_users'].peakRequestsPerSecond
      );
      expect(USER_CAPACITY_MODELS['5000_users'].peakRequestsPerSecond).toBeLessThan(
        USER_CAPACITY_MODELS['10000_users'].peakRequestsPerSecond
      );
    });
  });

  describe('Fail-Closed Staging URL Verification', () => {
    it('rejects localhost, loopback, and non-HTTPS URLs immediately', () => {
      expect(() => assertHttpsStagingUrl('http://api.daynori.com', 'Test')).toThrow(/must strictly use HTTPS/);
      expect(() => assertHttpsStagingUrl('https://localhost:4000', 'Test')).toThrow(/cannot target localhost or loopback/);
      expect(() => assertHttpsStagingUrl('https://127.0.0.1:4000', 'Test')).toThrow(/cannot target localhost or loopback/);
      expect(() => assertHttpsStagingUrl('https://0.0.0.0:4000', 'Test')).toThrow(/cannot target localhost or loopback/);
      expect(() => assertHttpsStagingUrl('https://[::1]:4000', 'Test')).toThrow(/cannot target localhost or loopback/);
    });

    it('accepts valid HTTPS staging URLs', () => {
      expect(() =>
        assertHttpsStagingUrl('https://daynori-api-preview.onrender.com', 'Staging API')
      ).not.toThrow();
    });
  });

  describe('ProcessLocalRateLimiter Remediations and Reverse-Proxy Header Support', () => {
    it('exempts health check routes from rate limiting to prevent monitoring alert flaps', () => {
      const limiter = new ProcessLocalRateLimiter({ maxRequests: 2, windowMs: 60_000 });
      const mockReply = {
        header: () => mockReply,
      } as unknown as FastifyReply;

      // Even with 200 requests to /health, none should be throttled
      for (let i = 0; i < 200; i++) {
        const req = {
          url: '/health',
          headers: {},
          ip: '103.205.132.1',
        } as unknown as FastifyRequest;

        expect(() => limiter.check(req, mockReply)).not.toThrow();
      }

      // /api/health and /v1/health are also exempt
      const apiHealthReq = {
        url: '/api/health',
        headers: {},
        ip: '103.205.132.1',
      } as unknown as FastifyRequest;
      expect(() => limiter.check(apiHealthReq, mockReply)).not.toThrow();

      const v1HealthReq = {
        url: '/v1/health',
        headers: {},
        ip: '103.205.132.1',
      } as unknown as FastifyRequest;
      expect(() => limiter.check(v1HealthReq, mockReply)).not.toThrow();
    });

    it('extracts CF-Connecting-IP and isolates client buckets', () => {
      const limiter = new ProcessLocalRateLimiter({ maxRequests: 2, windowMs: 60_000 });
      const mockReply = {
        header: () => mockReply,
      } as unknown as FastifyReply;

      const reqClientA = {
        url: '/v1/notes',
        headers: {
          'cf-connecting-ip': '103.205.132.1',
          'x-forwarded-for': '103.205.132.1, 172.64.10.1',
        },
        ip: '10.0.0.1', // Internal proxy socket IP with Cloudflare in chain
      } as unknown as FastifyRequest;

      const reqClientB = {
        url: '/v1/notes',
        headers: {
          'cf-connecting-ip': '103.205.132.2',
          'x-forwarded-for': '103.205.132.2, 172.64.10.1',
        },
        ip: '10.0.0.1', // Same proxy socket IP with Cloudflare in chain
      } as unknown as FastifyRequest;

      // Client A exhausts their 2 requests
      limiter.check(reqClientA, mockReply);
      limiter.check(reqClientA, mockReply);
      expect(() => limiter.check(reqClientA, mockReply)).toThrow(RateLimitError);

      // Client B from different CF-Connecting-IP still has their own budget
      expect(() => limiter.check(reqClientB, mockReply)).not.toThrow();
      expect(() => limiter.check(reqClientB, mockReply)).not.toThrow();
      expect(() => limiter.check(reqClientB, mockReply)).toThrow(RateLimitError);
    });

    it('extracts leftmost client IP from X-Forwarded-For subnet chains', () => {
      const limiter = new ProcessLocalRateLimiter({ maxRequests: 1, windowMs: 60_000 });
      const mockReply = {
        header: () => mockReply,
      } as unknown as FastifyReply;

      const req1 = {
        url: '/v1/tasks',
        headers: { 'x-forwarded-for': '203.112.80.5, 172.68.10.1, 10.0.0.1' },
        ip: '10.0.0.1',
      } as unknown as FastifyRequest;

      const req2 = {
        url: '/v1/tasks',
        headers: { 'x-forwarded-for': '203.112.80.6, 172.68.10.1, 10.0.0.1' },
        ip: '10.0.0.1',
      } as unknown as FastifyRequest;

      limiter.check(req1, mockReply);
      expect(() => limiter.check(req1, mockReply)).toThrow(RateLimitError);

      // req2 has a different client IP in X-Forwarded-For
      expect(() => limiter.check(req2, mockReply)).not.toThrow();
    });

    it('prioritizes verified actor userId over IP address', () => {
      const limiter = new ProcessLocalRateLimiter({ maxRequests: 1, windowMs: 60_000 });
      const mockReply = {
        header: () => mockReply,
      } as unknown as FastifyReply;

      const reqUserA = {
        url: '/v1/tasks',
        actor: { userId: 'usr-alice' },
        headers: { 'cf-connecting-ip': '103.205.132.1' },
        ip: '103.205.132.1',
      } as unknown as FastifyRequest;

      const reqUserB = {
        url: '/v1/tasks',
        actor: { userId: 'usr-bob' },
        headers: { 'cf-connecting-ip': '103.205.132.1' }, // Same IP, different actor
        ip: '103.205.132.1',
      } as unknown as FastifyRequest;

      limiter.check(reqUserA, mockReply);
      expect(() => limiter.check(reqUserA, mockReply)).toThrow(RateLimitError);

      // User B has independent budget despite sharing IP
      expect(() => limiter.check(reqUserB, mockReply)).not.toThrow();
    });
  });

  describe('Capacity Envelope Artifacts Verification', () => {
    it('verifies artifacts/phase121/capacity-envelope-matrix.json exists and conforms to schema', () => {
      const matrixPath = path.resolve(__dirname, '../../artifacts/phase121/capacity-envelope-matrix.json');
      expect(fs.existsSync(matrixPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
      expect(content.schemaVersion).toBe(1);
      expect(content.phase).toBe('121');
      expect(content.tiers.tier_1000_users).toBeDefined();
      expect(content.tiers.tier_5000_users).toBeDefined();
      expect(content.tiers.tier_10000_users).toBeDefined();
      expect(content.bottlenecksAndRemediations.length).toBeGreaterThanOrEqual(3);
      expect(content.noExtrapolationPrinciple.rule).toBeDefined();
    });

    it('verifies artifacts/phase121/operational-envelope-and-thresholds.md exists and contains runbook sections', () => {
      const docPath = path.resolve(__dirname, '../../artifacts/phase121/operational-envelope-and-thresholds.md');
      expect(fs.existsSync(docPath)).toBe(true);

      const content = fs.readFileSync(docPath, 'utf8');
      expect(content).toContain('Empirical Safe Operating Envelope');
      expect(content).toContain('No-Extrapolation Principle');
      expect(content).toContain('Operational Monitoring & Alert Thresholds');
      expect(content).toContain('Step-by-Step Scaling Runbook');
      expect(content).toContain('Automated & Manual Rollback Triggers');
    });
  });
});
