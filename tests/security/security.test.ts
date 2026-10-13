import { describe, expect, it } from 'vitest';
import { parseWorkspaceId, parseUserId } from '@daynori/domain';

describe('Security Baseline Tests', () => {
  it('enforces UUID branded boundaries on workspace and user IDs', () => {
    const maliciousInputs = [
      '../../../etc/passwd',
      "'; DROP TABLE users; --",
      '<script>alert(1)</script>',
      'not-a-uuid',
    ];

    for (const input of maliciousInputs) {
      expect(() => parseWorkspaceId(input)).toThrow();
      expect(() => parseUserId(input)).toThrow();
    }
  });
});
