import type { DaynoriApiClient } from '@daynori/api-client';
import type { ReminderInstance } from '@daynori/contracts';
import { defaultSecureStorage } from '../auth/secureStorage.js';
import {
  scheduleLocalReminderAsync,
  cancelLocalReminderAsync,
  cancelAllLocalRemindersAsync,
  deactivateDeviceAsync,
} from './adapter.js';

export interface LocalScheduledReminder {
  instanceId: string;
  workspaceId: string;
  ruleRevision: number;
  deliveryGeneration: number;
  nativeNotificationId: string;
  scheduledAt: string;
  targetType: string;
  targetId: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

export class ReminderScheduleCoordinator {
  private userId: string | null = null;
  private workspaceId: string | null = null;
  private memorySchedules = new Map<string, LocalScheduledReminder>();
  private isInitialized = false;

  private getStorageKey(): string {
    return `daynori_local_schedules_${this.userId || 'anon'}`;
  }

  async initialize(userId: string, workspaceId: string): Promise<void> {
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.memorySchedules.clear();

    try {
      const raw = await defaultSecureStorage.getItemAsync(this.getStorageKey());
      if (raw) {
        const records = JSON.parse(raw) as LocalScheduledReminder[];
        for (const r of records) {
          this.memorySchedules.set(r.instanceId, r);
        }
      }
    } catch {
      // Graceful fallback to empty map
    }
    this.isInitialized = true;
  }

  private async persist(): Promise<void> {
    if (!this.userId) return;
    try {
      const records = Array.from(this.memorySchedules.values());
      await defaultSecureStorage.setItemAsync(this.getStorageKey(), JSON.stringify(records));
    } catch {
      // Ignore storage write failures
    }
  }

  /**
   * Reconcile reminder instances against local native notifications.
   * Schedules new upcoming occurrences, cancels terminal/outdated alerts,
   * and retries pending server acknowledgments.
   */
  async reconcileInstances(
    apiClient: DaynoriApiClient | null,
    instances: ReminderInstance[],
    itemTitles?: Map<string, string>
  ): Promise<{ scheduledCount: number; cancelledCount: number; acknowledgedCount: number }> {
    if (!this.isInitialized || !this.workspaceId) {
      return { scheduledCount: 0, cancelledCount: 0, acknowledgedCount: 0 };
    }

    let scheduledCount = 0;
    let cancelledCount = 0;
    let acknowledgedCount = 0;
    const now = Date.now();

    const activeInstanceIds = new Set<string>();

    for (const inst of instances) {
      if (inst.workspaceId !== this.workspaceId) continue;

      const isUpcoming =
        ['scheduled', 'snoozed'].includes(inst.status) &&
        new Date(inst.snoozeUntil || inst.scheduledAt).getTime() > now;

      if (!isUpcoming) {
        // If it was previously scheduled locally but is now terminal or in the past, cancel native alert
        const existing = this.memorySchedules.get(inst.id);
        if (existing) {
          await cancelLocalReminderAsync(existing.nativeNotificationId);
          this.memorySchedules.delete(inst.id);
          cancelledCount++;
        }
        continue;
      }

      activeInstanceIds.add(inst.id);
      const existing = this.memorySchedules.get(inst.id);
      const targetInstant = inst.snoozeUntil || inst.scheduledAt;

      const needsReschedule =
        !existing ||
        existing.ruleRevision !== inst.ruleRevision ||
        existing.deliveryGeneration !== inst.deliveryGeneration ||
        existing.scheduledAt !== targetInstant;

      if (needsReschedule) {
        if (existing) {
          await cancelLocalReminderAsync(existing.nativeNotificationId);
          cancelledCount++;
        }

        const title = itemTitles?.get(inst.targetId) || 'Daynori Reminder';
        const scheduleResult = await scheduleLocalReminderAsync(apiClient, {
          instanceId: inst.id,
          workspaceId: inst.workspaceId,
          title,
          scheduledAt: targetInstant,
          destination: 'plan',
          itemId: inst.targetId,
          ruleRevision: inst.ruleRevision,
          deliveryGeneration: inst.deliveryGeneration,
          privacyLevel: 'normal', // Default generic redaction applied by adapter
        });

        if (scheduleResult.scheduled && scheduleResult.nativeNotificationId) {
          this.memorySchedules.set(inst.id, {
            instanceId: inst.id,
            workspaceId: inst.workspaceId,
            ruleRevision: inst.ruleRevision,
            deliveryGeneration: inst.deliveryGeneration,
            nativeNotificationId: scheduleResult.nativeNotificationId,
            scheduledAt: targetInstant,
            targetType: inst.targetType,
            targetId: inst.targetId,
            acknowledged: Boolean(apiClient),
            acknowledgedAt: apiClient ? new Date().toISOString() : null,
          });
          scheduledCount++;
          if (apiClient) acknowledgedCount++;
        }
      } else if (!existing.acknowledged && apiClient) {
        // Retry pending acknowledgment
        try {
          const deviceId = await defaultSecureStorage.getItemAsync('daynori_registered_device_id');
          if (deviceId) {
            await apiClient.acknowledgeDeviceSchedule(inst.workspaceId, {
              instanceId: inst.id,
              deviceId,
              ruleRevision: existing.ruleRevision,
              deliveryGeneration: existing.deliveryGeneration,
              nativeNotificationId: existing.nativeNotificationId,
              deliveryMode: 'local',
              acknowledged: true,
            });
            existing.acknowledged = true;
            existing.acknowledgedAt = new Date().toISOString();
            acknowledgedCount++;
          }
        } catch {
          // Retry will occur on next reconciliation cycle
        }
      }
    }

    // Clean up any stored records that are no longer part of the workspace dataset
    for (const [id, record] of Array.from(this.memorySchedules.entries())) {
      if (!activeInstanceIds.has(id)) {
        await cancelLocalReminderAsync(record.nativeNotificationId);
        this.memorySchedules.delete(id);
        cancelledCount++;
      }
    }

    await this.persist();
    return { scheduledCount, cancelledCount, acknowledgedCount };
  }

  /**
   * Cancel local reminders for a specific source target (e.g. Completed or deleted task).
   */
  async cancelForTarget(targetType: string, targetId: string): Promise<void> {
    for (const [id, record] of Array.from(this.memorySchedules.entries())) {
      if (record.targetType === targetType && record.targetId === targetId) {
        await cancelLocalReminderAsync(record.nativeNotificationId);
        this.memorySchedules.delete(id);
      }
    }
    await this.persist();
  }

  /**
   * Cancel all local alerts, clear storage, and optionally deactivate device on logout.
   */
  async cancelAll(apiClient?: DaynoriApiClient | null): Promise<void> {
    await cancelAllLocalRemindersAsync();
    this.memorySchedules.clear();
    await this.persist();

    if (apiClient) {
      await deactivateDeviceAsync(apiClient);
    }
    this.isInitialized = false;
    this.userId = null;
    this.workspaceId = null;
  }

  getScheduledRecords(): LocalScheduledReminder[] {
    return Array.from(this.memorySchedules.values());
  }
}

export const defaultScheduleCoordinator = new ReminderScheduleCoordinator();
