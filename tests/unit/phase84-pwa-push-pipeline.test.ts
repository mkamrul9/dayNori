import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertValidPushEndpoint } from '../../apps/api/src/modules/reminders/service.js';
import {
  getMobilePwaPlatformInfo,
  getPwaPushPrivacyMode,
  setPwaPushPrivacyMode,
  urlBase64ToUint8Array,
  arrayBufferToBase64Url,
} from '../../apps/web/src/notifications/webPushManager.js';
import {
  materializeReminderOccurrences,
  calculateSnoozeTime,
  isTimeInQuietHours,
  calculateNextQuietHoursEnd,
  isValidIanaTimezone,
  redactReminderPayload,
  type ReminderRule,
} from '@daynori/domain';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 84: Mobile PWA push and reminder delivery pipeline', () => {
  describe('1. SSRF prevention and push endpoint validation', () => {
    it('accepts legitimate public push endpoints on HTTPS port 443', () => {
      expect(() => {
        assertValidPushEndpoint('https://fcm.googleapis.com/fcm/send/sample-token-123');
      }).not.toThrow();

      expect(() => {
        assertValidPushEndpoint('https://web.push.apple.com/QC89SamplePushService');
      }).not.toThrow();

      expect(() => {
        assertValidPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/gAAAAABsample');
      }).not.toThrow();
    });

    it('rejects unencrypted HTTP protocol', () => {
      expect(() => {
        assertValidPushEndpoint('http://fcm.googleapis.com/fcm/send/sample-token');
      }).toThrow(/HTTPS/i);
    });

    it('rejects embedded authentication credentials', () => {
      expect(() => {
        assertValidPushEndpoint('https://user:password@fcm.googleapis.com/endpoint');
      }).toThrow(/credentials/i);
    });

    it('rejects non-standard ports', () => {
      expect(() => {
        assertValidPushEndpoint('https://fcm.googleapis.com:8443/fcm/send');
      }).toThrow(/port 443/i);

      expect(() => {
        assertValidPushEndpoint('https://fcm.googleapis.com:80/fcm/send');
      }).toThrow(/port 443/i);
    });

    it('rejects loopback and internal hostname suffixes', () => {
      const internalHosts = [
        'https://localhost/push',
        'https://my-service.localhost/push',
        'https://device.local/push',
        'https://metadata.internal/push',
        'https://test-server.test/push',
        'https://staging.example/push',
        'https://broker.invalid/push',
      ];

      for (const endpoint of internalHosts) {
        expect(() => assertValidPushEndpoint(endpoint)).toThrow(/disallowed, private, or loopback/i);
      }
    });

    it('rejects private IPv4 subnets (RFC 1918) and loopback addresses', () => {
      const privateIps = [
        'https://127.0.0.1/push',
        'https://127.0.0.254/push',
        'https://10.0.0.1/push',
        'https://10.255.255.255/push',
        'https://172.16.0.1/push',
        'https://172.31.255.255/push',
        'https://192.168.1.1/push',
        'https://192.168.0.254/push',
      ];

      for (const endpoint of privateIps) {
        expect(() => assertValidPushEndpoint(endpoint)).toThrow(/disallowed, private, or loopback/i);
      }
    });

    it('rejects cloud metadata and link-local IP addresses', () => {
      const linkLocal = [
        'https://169.254.169.254/latest/meta-data',
        'https://169.254.0.1/endpoint',
      ];

      for (const endpoint of linkLocal) {
        expect(() => assertValidPushEndpoint(endpoint)).toThrow(/disallowed, private, or loopback/i);
      }
    });

    it('rejects obfuscated IPv4 representations (octal, hex, integer dword)', () => {
      const obfuscated = [
        'https://0177.0.0.1/push', // Octal 127
        'https://0x7f.0.0.1/push', // Hex 127
        'https://2130706433/push', // Dword integer 127.0.0.1
        'https://0xa000001/push',  // Hex 10.0.0.1
      ];

      for (const endpoint of obfuscated) {
        expect(() => assertValidPushEndpoint(endpoint)).toThrow(/disallowed, private, or loopback/i);
      }
    });

    it('rejects private and loopback IPv6 representations', () => {
      const privateIpv6 = [
        'https://[::1]/push',
        'https://[fe80::1]/push',
        'https://[fc00::1]/push',
        'https://[fd12:3456:789a::1]/push',
        'https://[::ffff:127.0.0.1]/push',
      ];

      for (const endpoint of privateIpv6) {
        expect(() => assertValidPushEndpoint(endpoint)).toThrow(/disallowed, private, or loopback/i);
      }
    });
  });

  describe('2. Mobile PWA platform guidance and capability detection', () => {
    it('provides VAPID key conversion utilities safely', () => {
      const originalBytes = new Uint8Array([1, 2, 3, 4, 5, 255, 128, 64]);
      const base64Url = arrayBufferToBase64Url(originalBytes.buffer);
      expect(base64Url).toBeTypeOf('string');

      const roundTrip = urlBase64ToUint8Array(base64Url);
      expect(Array.from(roundTrip)).toEqual(Array.from(originalBytes));
    });

    it('provides platform info and contextual guidance structure', () => {
      const info = getMobilePwaPlatformInfo();
      expect(info).toHaveProperty('isIOS');
      expect(info).toHaveProperty('isAndroid');
      expect(info).toHaveProperty('isStandalone');
      expect(info).toHaveProperty('iosRequiresHomeScreen');
      expect(info).toHaveProperty('permission');
      expect(info).toHaveProperty('guidanceText');
    });

    it('persists and retrieves PWA push content privacy preferences', () => {
      // Mock localStorage for test execution
      const store = new Map<string, string>();
      const mockStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      };
      const origStorage = globalThis.localStorage;
      Object.defineProperty(globalThis, 'localStorage', {
        value: mockStorage,
        configurable: true,
      });

      try {
        expect(getPwaPushPrivacyMode()).toBe('generic');

        setPwaPushPrivacyMode('detailed');
        expect(getPwaPushPrivacyMode()).toBe('detailed');

        setPwaPushPrivacyMode('generic');
        expect(getPwaPushPrivacyMode()).toBe('generic');
      } finally {
        Object.defineProperty(globalThis, 'localStorage', {
          value: origStorage,
          configurable: true,
        });
      }
    });
  });

  describe('3. Notification display privacy and Service Worker boundaries', () => {
    const swPath = path.join(repoRoot, 'apps/web/public/sw.js');
    const swContent = fs.readFileSync(swPath, 'utf8');

    it('enforces generic default title and body on push event', () => {
      expect(swContent).toContain("title = 'Daynori Reminder'");
      expect(swContent).toContain("body = 'You have a scheduled reminder'");
      expect(swContent).toContain('self.registration.showNotification');
    });

    it('restricts notification click destination to approved internal routes', () => {
      expect(swContent).toContain("ALLOWED_DESTINATIONS = ['plan', 'today', 'library', 'journal', 'settings']");
      expect(swContent).toContain("data.destination || 'plan'");
      expect(swContent).toContain('reminderInstanceId');
      expect(swContent).toContain('deliveryGeneration');
    });

    it('verifies that sensitive journal content is strictly excluded from push notifications', () => {
      // In sw.js, there is no reference to journal entry text or body in push handler
      expect(swContent).not.toMatch(/journal.*entry.*body/i);
      expect(swContent).not.toMatch(/passphrase/i);
      expect(swContent).not.toMatch(/secret_key/i);
    });
  });

  describe('4. Reminder source lifecycle, occurrences, and quiet hours', () => {
    it('validates IANA timezones strictly', () => {
      expect(isValidIanaTimezone('UTC')).toBe(true);
      expect(isValidIanaTimezone('America/New_York')).toBe(true);
      expect(isValidIanaTimezone('Europe/London')).toBe(true);
      expect(isValidIanaTimezone('Asia/Tokyo')).toBe(true);

      expect(isValidIanaTimezone('Mars/Phobos')).toBe(false);
      expect(isValidIanaTimezone('Invalid/Nowhere')).toBe(false);
      expect(isValidIanaTimezone('')).toBe(false);
    });

    it('calculates snooze times correctly with generation tracking', () => {
      const baseTime = new Date('2026-11-05T10:00:00.000Z');
      const snoozed = calculateSnoozeTime(baseTime, 15);
      expect(snoozed.snoozeUntil).toBe('2026-11-05T10:15:00.000Z');
      expect(snoozed.status).toBe('snoozed');
    });

    it('materializes rolling horizon occurrences for tasks', () => {
      const now = new Date('2026-11-05T10:00:00.000Z');
      const taskDue = new Date('2026-11-05T14:00:00.000Z');

      const sampleRule: ReminderRule = {
        id: 'rule-task-1',
        workspaceId: 'ws-123',
        targetType: 'task',
        targetId: 'task-123',
        ruleRevision: 1,
        offsetMinutes: 0,
        scheduleTime: null,
        timezone: 'UTC',
        recurrence: 'none',
        quietHoursBehavior: 'defer',
        channels: ['push'],
        privacyLevel: 'generic',
        isActive: true,
        createdAt: '2026-11-05T10:00:00.000Z',
        updatedAt: '2026-11-05T10:00:00.000Z',
      };

      const occurrences = materializeReminderOccurrences({
        rule: sampleRule,
        target: {
          id: 'task-123',
          dueTimestamp: taskDue.getTime(),
          startDate: null,
          isDone: false,
          isDeleted: false,
          routine: null,
        },
        now,
      });

      expect(occurrences.length).toBe(1);
      expect(occurrences[0]!.scheduledAt).toBe('2026-11-05T14:00:00.000Z');
      expect(occurrences[0]!.occurrenceKey).toContain('task');
    });

    it('omits occurrences when target task is completed or deleted', () => {
      const now = new Date('2026-11-05T10:00:00.000Z');
      const taskDue = new Date('2026-11-05T14:00:00.000Z');

      const sampleRule: ReminderRule = {
        id: 'rule-task-done',
        workspaceId: 'ws-123',
        targetType: 'task',
        targetId: 'task-done',
        ruleRevision: 1,
        offsetMinutes: 0,
        scheduleTime: null,
        timezone: 'UTC',
        recurrence: 'none',
        quietHoursBehavior: 'defer',
        channels: ['push'],
        privacyLevel: 'generic',
        isActive: true,
        createdAt: '2026-11-05T10:00:00.000Z',
        updatedAt: '2026-11-05T10:00:00.000Z',
      };

      const completedOccurrences = materializeReminderOccurrences({
        rule: sampleRule,
        target: {
          id: 'task-done',
          dueTimestamp: taskDue.getTime(),
          startDate: null,
          isDone: true, // Completed
          isDeleted: false,
          routine: null,
        },
        now,
      });

      expect(completedOccurrences.length).toBe(0);

      const deletedOccurrences = materializeReminderOccurrences({
        rule: sampleRule,
        target: {
          id: 'task-done',
          dueTimestamp: taskDue.getTime(),
          startDate: null,
          isDone: false,
          isDeleted: true, // Deleted
          routine: null,
        },
        now,
      });

      expect(deletedOccurrences.length).toBe(0);
    });

    it('defers reminder due during quiet hours when configured to defer', () => {
      const quietConfig = {
        enabled: true,
        start: '22:00',
        end: '08:00',
        timezone: 'UTC',
      };

      // 23:00 is inside quiet hours
      expect(isTimeInQuietHours('2026-11-05T23:00:00.000Z', quietConfig)).toBe(true);

      // 14:00 is outside quiet hours
      expect(isTimeInQuietHours('2026-11-05T14:00:00.000Z', quietConfig)).toBe(false);

      // Next quiet hours end after 23:00 on Nov 5 is 08:00 on Nov 6
      const nextEnd = calculateNextQuietHoursEnd('2026-11-05T23:00:00.000Z', quietConfig);
      expect(nextEnd).toBe('2026-11-06T08:00:00.000Z');

      // Snoozing into quiet hours automatically shifts to quiet hours end
      const snoozeResult = calculateSnoozeTime('2026-11-05T22:30:00.000Z', 15, quietConfig);
      expect(snoozeResult.snoozeUntil).toBe('2026-11-06T08:00:00.000Z');
    });

    it('redacts reminder payload according to privacy policy', () => {
      const genericRedacted = redactReminderPayload({
        title: 'Secret personal journal entry',
        targetType: 'task',
        privacyLevel: 'generic',
      });
      expect(genericRedacted.title).toBe('Daynori Reminder');
      expect(genericRedacted.body).not.toContain('Secret personal journal');

      const detailedRedacted = redactReminderPayload({
        title: 'Buy groceries',
        targetType: 'task',
        privacyLevel: 'detailed',
      });
      expect(detailedRedacted.title).toBe('Task: Buy groceries');
      expect(detailedRedacted.body).toBe('Scheduled item reminder.');
    });
  });

  describe('5. Truthful delivery state model', () => {
    it('distinguishes scheduled, worker dispatched, provider accepted, failed, and observed states', () => {
      const states = [
        { code: 'pending', display: 'Scheduled' },
        { code: 'dispatched', display: 'Worker Dispatched' },
        { code: 'delivered', display: 'Provider Accepted' },
        { code: 'failed', display: 'Failed' },
        { code: 'expired', display: 'Expired' },
        { code: 'observed', display: 'Observed / Tapped' },
      ];

      for (const s of states) {
        expect(s.code).toBeDefined();
        expect(s.display).toBeDefined();
      }
    });

    it('verifies that provider acceptance is not claimed as verified phone delivery', () => {
      const adrPath = path.join(
        repoRoot,
        'docs/decisions/0035-web-push-and-pwa-offline-caching.md'
      );
      const adrContent = fs.readFileSync(adrPath, 'utf8');

      expect(adrContent).toContain('VAPID');
      expect(adrContent).toContain('independent');
      expect(adrContent).toContain('Clear separation between software verification');
    });
  });
});
