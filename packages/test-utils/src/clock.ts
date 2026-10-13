/**
 * Deterministic clock for testing time-dependent domain logic
 */
export class DeterministicClock {
  private currentTimeMs: number;

  constructor(initialIsoString: string = '2026-10-13T20:00:00.000Z') {
    this.currentTimeMs = new Date(initialIsoString).getTime();
  }

  now(): Date {
    return new Date(this.currentTimeMs);
  }

  nowIso(): string {
    return new Date(this.currentTimeMs).toISOString();
  }

  advanceSeconds(seconds: number): void {
    this.currentTimeMs += seconds * 1000;
  }

  advanceDays(days: number): void {
    this.currentTimeMs += days * 24 * 60 * 60 * 1000;
  }
}
