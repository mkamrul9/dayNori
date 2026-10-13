import { describe, expect, it } from 'vitest';
import { HealthResponseSchema, SmokeResponseSchema } from '@daynori/contracts';

describe('Cross-Workspace Contract Verification', () => {
  it('validates contract compatibility between API and client schemas', () => {
    const apiHealthSample = {
      status: 'ok',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      environment: 'development',
    };

    const validated = HealthResponseSchema.safeParse(apiHealthSample);
    expect(validated.success).toBe(true);
  });

  it('validates smoke route contract schema', () => {
    const apiSmokeSample = {
      status: 'ready',
      phase: '01',
      service: 'daynori-api',
      timestamp: new Date().toISOString(),
    };

    const validated = SmokeResponseSchema.safeParse(apiSmokeSample);
    expect(validated.success).toBe(true);
  });
});
