import { describe, expect, it } from 'vitest';
import { DeterministicClock, createSyntheticWorkspaceFixture } from './index.js';

describe('Test Utilities', () => {
  it('DeterministicClock advances time consistently', () => {
    const clock = new DeterministicClock('2026-10-13T20:00:00.000Z');
    expect(clock.nowIso()).toBe('2026-10-13T20:00:00.000Z');

    clock.advanceSeconds(30);
    expect(clock.nowIso()).toBe('2026-10-13T20:00:30.000Z');

    clock.advanceDays(1);
    expect(clock.nowIso()).toBe('2026-10-14T20:00:30.000Z');
  });

  it('creates valid synthetic fixtures with valid UUID brands', () => {
    const workspace = createSyntheticWorkspaceFixture();
    expect(workspace.id).toBe('00000000-0000-4000-8000-000000000001');
    expect(workspace.tier).toBe('free');
  });
});
