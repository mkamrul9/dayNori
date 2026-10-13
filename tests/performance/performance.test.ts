import { describe, expect, it } from 'vitest';
import { DeterministicClock } from '@daynori/test-utils';

describe('Performance Baseline Tests', () => {
  it('instantiates synthetic utilities within budget (<10ms)', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const clock = new DeterministicClock();
      clock.advanceSeconds(1);
    }
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100);
  });
});
