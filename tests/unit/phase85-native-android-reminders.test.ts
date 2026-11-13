import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Notifications from 'expo-notifications';
import {
  setupNotificationChannelsAsync,
  getNotificationCapabilityAsync,
  requestNotificationPermissionAsync,
  scheduleLocalReminderAsync,
  cancelLocalReminderAsync,
  cancelAllLocalRemindersAsync,
  getNotificationPrivacyModeAsync,
  setNotificationPrivacyModeAsync,
  sendLocalTestNotificationAsync,
  optOutNotificationsAsync,
  initNotificationResponseListener,
  resetNotificationResponseState,
  type NotificationCapabilityState,
} from '../../apps/mobile/src/notifications/adapter.js';
import {
  defaultScheduleCoordinator,
  ReminderScheduleCoordinator,
} from '../../apps/mobile/src/notifications/coordinator.js';
import {
  isTimeInQuietHours,
  calculateNextQuietHoursEnd,
  type QuietHoursConfig,
} from '@daynori/domain';
import { __mockNotificationControls } from '@daynori/test-utils';
import { defaultSecureStorage } from '../../apps/mobile/src/auth/secureStorage.js';

describe('Phase 85: Native Android Reminder and Notification Readiness Suite', () => {
  beforeEach(async () => {
    __mockNotificationControls.reset();
    resetNotificationResponseState();
    // Clear relevant secure storage keys
    await defaultSecureStorage.deleteItemAsync('daynori_notification_privacy_mode');
    await defaultSecureStorage.deleteItemAsync('daynori_registered_device_id');
    await defaultSecureStorage.deleteItemAsync('daynori_registered_push_token');
    await defaultSecureStorage.deleteItemAsync('daynori_registered_push_token_type');
    await defaultSecureStorage.deleteItemAsync('daynori_notification_previously_granted');
  });

  describe('1. Permissions, Channels, and Device Settings', () => {
    it('configures native Android notification channels with high importance and private lockscreen', async () => {
      await setupNotificationChannelsAsync();

      const channels = await Notifications.getNotificationChannelsAsync();
      const remindersChannel = channels.find((c) => c['id'] === 'reminders');
      expect(remindersChannel).toBeDefined();
      expect(remindersChannel?.['importance']).toBe(4); // HIGH importance
      expect(remindersChannel?.['enableVibrate']).toBe(true);
      expect(remindersChannel?.['enableLights']).toBe(true);

      const updatesChannel = channels.find((c) => c['id'] === 'updates');
      expect(updatesChannel).toBeDefined();
      expect(updatesChannel?.['importance']).toBe(3); // DEFAULT importance
    });

    it('honestly reflects granted, denied, revoked, and channel_disabled states', async () => {
      // 1. Undetermined
      __mockNotificationControls.setPermission('undetermined');
      let cap = await getNotificationCapabilityAsync();
      expect(cap.status).toBe('undetermined');
      expect(cap.canDeliverLocally).toBe(false);

      // 2. Granted
      __mockNotificationControls.setPermission('granted');
      cap = await getNotificationCapabilityAsync();
      expect(cap.status).toBe('granted');
      expect(cap.canDeliverLocally).toBe(true);

      // 3. Channel Disabled
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Reminders & Alerts',
        importance: Notifications.AndroidImportance.NONE,
      });
      cap = await getNotificationCapabilityAsync();
      expect(cap.status).toBe('channel_disabled');
      expect(cap.details).toContain('Reminders channel is disabled');

      // Reset channel
      await setupNotificationChannelsAsync();

      // 4. Revoked (explicit revoked status in OS settings)
      __mockNotificationControls.setPermission('revoked' as unknown as 'denied');
      cap = await getNotificationCapabilityAsync();
      expect(cap.status).toBe('revoked');
      expect(cap.details).toContain('permission was revoked');

      // 5. Denied
      __mockNotificationControls.setPermission('denied');
      cap = await getNotificationCapabilityAsync();
      expect(cap.status).toBe('denied');
      expect(cap.canDeliverLocally).toBe(false);
      expect(cap.details).toContain('permission was denied');
    });

    it('requests permission contextually without nagging and updates capability', async () => {
      __mockNotificationControls.setPermission('undetermined');

      const cap = await requestNotificationPermissionAsync('Contextual prompt on reminder creation');
      expect(cap.status).toBe('granted');
      expect(cap.canDeliverLocally).toBe(true);
    });

    it('strictly enforces no restricted exact alarms (isExactAlarmPermitted: false)', async () => {
      const cap = await getNotificationCapabilityAsync();
      expect(cap.isExactAlarmPermitted).toBe(false);
    });
  });

  describe('2. Lock-Screen Privacy and Content Redaction', () => {
    it('defaults to generic preview privacy and persists user toggle', async () => {
      expect(await getNotificationPrivacyModeAsync()).toBe('generic');

      await setNotificationPrivacyModeAsync('detailed');
      expect(await getNotificationPrivacyModeAsync()).toBe('detailed');

      await setNotificationPrivacyModeAsync('generic');
      expect(await getNotificationPrivacyModeAsync()).toBe('generic');
    });

    it('redacts task reminder to generic title and body under default generic privacy mode', async () => {
      await setNotificationPrivacyModeAsync('generic');

      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const res = await scheduleLocalReminderAsync(null, {
        instanceId: crypto.randomUUID(),
        workspaceId: crypto.randomUUID(),
        title: 'Confidential client meeting',
        body: 'Review secret merger documents',
        scheduledAt: futureDate,
        ruleRevision: 1,
      });

      expect(res.scheduled).toBe(true);
      expect(res.nativeNotificationId).toBeTruthy();

      const notif = __mockNotificationControls.getScheduledMap().get(res.nativeNotificationId!);
      expect(notif).toBeDefined();
      expect(notif?.content.title).toBe('Daynori Reminder');
      expect(notif?.content.body).toBe('You have a scheduled reminder');
    });

    it('exposes item title when detailed privacy mode is opted-in', async () => {
      await setNotificationPrivacyModeAsync('detailed');

      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const res = await scheduleLocalReminderAsync(null, {
        instanceId: crypto.randomUUID(),
        workspaceId: crypto.randomUUID(),
        title: 'Morning Yoga Routine',
        body: '20 minutes stretching',
        scheduledAt: futureDate,
        ruleRevision: 1,
      });

      expect(res.scheduled).toBe(true);
      const notif = __mockNotificationControls.getScheduledMap().get(res.nativeNotificationId!);
      expect(notif?.content.title).toBe('Morning Yoga Routine');
    });

    it('strictly forces generic redaction on journal records regardless of privacy mode', async () => {
      await setNotificationPrivacyModeAsync('detailed');

      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const res = await scheduleLocalReminderAsync(null, {
        instanceId: crypto.randomUUID(),
        workspaceId: crypto.randomUUID(),
        title: 'Intimate Journal Reflection',
        body: 'Private thoughts about therapy',
        scheduledAt: futureDate,
        destination: 'journal',
        ruleRevision: 1,
        privacyLevel: 'confidential',
      });

      expect(res.scheduled).toBe(true);
      const notif = __mockNotificationControls.getScheduledMap().get(res.nativeNotificationId!);
      expect(notif?.content.title).toBe('Daynori Reminder');
      expect(notif?.content.body).toBe('You have a scheduled reminder');
    });
  });

  describe('3. Quiet Hours and Timezone Policy', () => {
    const quietConfig: QuietHoursConfig = {
      enabled: true,
      start: '22:00',
      end: '07:00',
      timezone: 'UTC',
    };

    it('correctly identifies when an instant falls in quiet hours spanning midnight', () => {
      expect(isTimeInQuietHours('2026-11-06T23:30:00.000Z', quietConfig)).toBe(true);
      expect(isTimeInQuietHours('2026-11-06T04:15:00.000Z', quietConfig)).toBe(true);
      expect(isTimeInQuietHours('2026-11-06T14:00:00.000Z', quietConfig)).toBe(false);
    });

    it('calculates the next quiet hours end instant correctly', () => {
      const lateEvening = '2026-11-06T23:30:00.000Z';
      const nextEnd = calculateNextQuietHoursEnd(lateEvening, quietConfig);
      // Next morning at 07:00 UTC
      expect(nextEnd).toContain('2026-11-07T07:00');
    });

    it('defers reminder scheduling to quiet hours end when quietHoursBehavior is defer', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-06T12:00:00.000Z'));
      try {
        const lateEvening = '2026-11-06T23:30:00.000Z';
        const res = await scheduleLocalReminderAsync(null, {
          instanceId: crypto.randomUUID(),
          workspaceId: crypto.randomUUID(),
          title: 'Deferred Task',
          scheduledAt: lateEvening,
          ruleRevision: 1,
          quietHoursConfig: quietConfig,
          quietHoursBehavior: 'defer',
        });

        expect(res.scheduled).toBe(true);
        const notif = __mockNotificationControls.getScheduledMap().get(res.nativeNotificationId!);
        expect(notif).toBeDefined();
        // Date trigger should match next quiet hours end (07:00 UTC next morning)
        const triggerDate = notif?.trigger as { date?: Date };
        expect(triggerDate?.date?.toISOString()).toContain('2026-11-07T07:00');
      } finally {
        vi.useRealTimers();
      }
    });

    it('drops reminder scheduling when quietHoursBehavior is drop and within quiet hours', async () => {
      const lateEvening = '2026-11-06T23:30:00.000Z';
      const res = await scheduleLocalReminderAsync(null, {
        instanceId: crypto.randomUUID(),
        workspaceId: crypto.randomUUID(),
        title: 'Dropped Task',
        scheduledAt: lateEvening,
        ruleRevision: 1,
        quietHoursConfig: quietConfig,
        quietHoursBehavior: 'drop',
      });

      expect(res.scheduled).toBe(false);
      expect(res.nativeNotificationId).toBeNull();
      expect(res.error).toBe('Dropped by quiet hours policy');
    });
  });

  describe('4. Synthetic Test Notification Action', () => {
    it('schedules an immediate test notification with test payload metadata', async () => {
      const success = await sendLocalTestNotificationAsync({
        privacyMode: 'generic',
      });

      expect(success).toBe(true);
      const scheduled = Array.from(__mockNotificationControls.getScheduledMap().values());
      expect(scheduled.length).toBeGreaterThan(0);
      const testNotif = scheduled[scheduled.length - 1];
      expect(testNotif?.content.title).toBe('Daynori Reminder');
      expect((testNotif?.content.data as { test?: boolean })?.test).toBe(true);
    });
  });

  describe('5. Coordinator Lifecycle, Cancellation, and Multi-Device Isolation', () => {
    it('cancels local alerts when source target is completed or deleted', async () => {
      const coordinator = new ReminderScheduleCoordinator();
      const wsId = crypto.randomUUID();
      await coordinator.initialize('user-1', wsId);

      const futureDate = new Date(Date.now() + 7200 * 1000).toISOString();
      const targetId = crypto.randomUUID();
      const fakeInstances = [
        {
          id: crypto.randomUUID(),
          workspaceId: wsId,
          ruleId: crypto.randomUUID(),
          ruleRevision: 1,
          occurrenceKey: 'occ-10',
          targetType: 'task' as const,
          targetId,
          scheduledAt: futureDate,
          originalScheduledAt: futureDate,
          status: 'scheduled' as const,
          deliveryGeneration: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const res = await coordinator.reconcileInstances(null, fakeInstances);
      expect(res.scheduledCount).toBe(1);
      expect(coordinator.getScheduledRecords().length).toBe(1);

      // Cancel target (simulating task completion or trash)
      await coordinator.cancelForTarget('task', targetId);
      expect(coordinator.getScheduledRecords().length).toBe(0);
    });

    it('isolates user sessions and clears schedules on account logout', async () => {
      const coordinator = new ReminderScheduleCoordinator();
      const wsAId = crypto.randomUUID();
      await coordinator.initialize('user-a', wsAId);

      const futureDate = new Date(Date.now() + 7200 * 1000).toISOString();
      await coordinator.reconcileInstances(null, [
        {
          id: crypto.randomUUID(),
          workspaceId: wsAId,
          ruleId: crypto.randomUUID(),
          ruleRevision: 1,
          occurrenceKey: 'occ-a',
          targetType: 'task' as const,
          targetId: crypto.randomUUID(),
          scheduledAt: futureDate,
          originalScheduledAt: futureDate,
          status: 'scheduled' as const,
          deliveryGeneration: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      expect(coordinator.getScheduledRecords().length).toBe(1);

      // Logout / Cancel all
      await coordinator.cancelAll(null);
      expect(coordinator.getScheduledRecords().length).toBe(0);

      // Initialize new user: must not see previous user records
      const wsBId = crypto.randomUUID();
      await coordinator.initialize('user-b', wsBId);
      expect(coordinator.getScheduledRecords().length).toBe(0);
    });

    it('supports opt-out by cancelling all notifications and clearing registration', async () => {
      await scheduleLocalReminderAsync(null, {
        instanceId: crypto.randomUUID(),
        workspaceId: crypto.randomUUID(),
        title: 'Opt Out Test',
        scheduledAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        ruleRevision: 1,
      });

      expect(__mockNotificationControls.getScheduledCount()).toBe(1);

      await optOutNotificationsAsync(null);
      expect(__mockNotificationControls.getScheduledCount()).toBe(0);
    });
  });

  describe('6. Notification Tap Handling and Deduplication', () => {
    it('deduplicates rapid repeated notification taps within 3 seconds', () => {
      const received: unknown[] = [];
      const cleanup = initNotificationResponseListener((payload) => {
        received.push(payload);
      });

      const responsePayload = {
        type: 'notification',
        destination: 'plan',
        instanceId: crypto.randomUUID(),
        workspaceId: crypto.randomUUID(),
        ruleRevision: 1,
        deliveryGeneration: 1,
        timestamp: Date.now(),
      };

      // Rapid successive taps
      __mockNotificationControls.simulateNotificationResponse({
        notification: {
          request: {
            identifier: 'response-1',
            content: { data: responsePayload },
            trigger: {},
          },
        },
        actionIdentifier: 'default',
      });

      __mockNotificationControls.simulateNotificationResponse({
        notification: {
          request: {
            identifier: 'response-2',
            content: { data: responsePayload },
            trigger: {},
          },
        },
        actionIdentifier: 'default',
      });

      expect(received.length).toBe(1);
      cleanup();
    });
  });
});
