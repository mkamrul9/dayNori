import { describe, expect, it } from 'vitest';
import { GET } from './app/api/health/route.js';
import { HealthResponseSchema } from '@daynori/contracts';

describe('Web Health Route', () => {
  it('GET returns valid 200 HealthResponse', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    const parsed = HealthResponseSchema.parse(json);
    expect(parsed.status).toBe('ok');
    expect(parsed.version).toBe('0.1.0');
  });
});
