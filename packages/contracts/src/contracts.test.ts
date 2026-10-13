import { describe, expect, it } from 'vitest';
import { HealthResponseSchema, SmokeResponseSchema, ErrorResponseSchema } from './index.js';

describe('Contracts Schema Validation', () => {
  it('validates compliant HealthResponse payloads', () => {
    const valid = {
      status: 'ok',
      version: '0.1.0',
      timestamp: '2026-10-13T20:00:00.000Z',
    };
    const parsed = HealthResponseSchema.parse(valid);
    expect(parsed.status).toBe('ok');
    expect(parsed.version).toBe('0.1.0');
  });

  it('rejects non-compliant HealthResponse payloads', () => {
    const invalid = {
      status: 'not_ok',
      version: 123,
      timestamp: 'invalid-time',
    };
    expect(() => HealthResponseSchema.parse(invalid)).toThrow();
  });

  it('validates compliant SmokeResponse payloads', () => {
    const valid = {
      status: 'ready',
      phase: '01',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
    expect(SmokeResponseSchema.parse(valid).phase).toBe('01');
  });

  it('validates standard ErrorResponse payloads', () => {
    const valid = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid input parameters',
      },
    };
    expect(ErrorResponseSchema.parse(valid).error.code).toBe('VALIDATION_FAILED');
  });
});
