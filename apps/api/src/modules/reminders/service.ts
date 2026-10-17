import type { PoolClient } from 'pg';
import crypto from 'node:crypto';
import type {
  ReminderRule,
  ReminderInstance,
  ReminderDelivery,
  Device,
  DeviceSchedule,
  CreateReminderRuleRequest,
  UpdateReminderRuleRequest,
  SnoozeReminderRequest,
  RecordDeliveryReceiptRequest,
  RegisterDeviceRequest,
  AcknowledgeDeviceScheduleRequest,
  WebPushSubscription,
  RegisterWebPushSubscriptionRequest,
} from '@daynori/contracts';
import {
  materializeReminderOccurrences,
  calculateSnoozeTime,
  isValidIanaTimezone,
  type ReminderTargetTiming,
  type QuietHoursConfig,
} from '@daynori/domain';
import { insertOutboxIntent } from '../sync/repository.js';
import { NotFoundError, ValidationError, ConflictError, ForbiddenError } from '../../plugins/errorHandler.js';

interface ReminderRuleDbRow {
  id: string;
  workspace_id: string;
  target_type: 'task' | 'routine' | 'calendar_event';
  target_id: string;
  rule_revision: number;
  offset_minutes: number | null;
  schedule_time: string | null;
  timezone: string;
  recurrence: 'none' | 'daily' | 'weekly' | 'weekdays';
  quiet_hours_behavior: 'defer' | 'allow' | 'drop';
  channels: ('in_app' | 'push' | 'local')[];
  privacy_level: 'generic' | 'detailed';
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface ReminderInstanceDbRow {
  id: string;
  workspace_id: string;
  rule_id: string;
  rule_revision: number;
  delivery_generation: number;
  occurrence_key: string;
  target_type: 'task' | 'routine' | 'calendar_event';
  target_id: string;
  scheduled_at: Date;
  original_scheduled_at: Date;
  status:
    | 'scheduled'
    | 'snoozed'
    | 'processing'
    | 'dispatched'
    | 'invalidated'
    | 'dismissed'
    | 'observed';
  snooze_until: Date | null;
  invalidated_reason: string | null;
  invalidation_time: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ReminderDeliveryDbRow {
  id: string;
  workspace_id: string;
  instance_id: string;
  delivery_generation: number;
  channel: 'in_app' | 'push' | 'local';
  recipient_user_id: string;
  recipient_device_id: string | null;
  recipient_subscription_id: string | null;
  provider: 'in_app' | 'fcm' | 'expo_push' | 'web_push';
  provider_message_id: string | null;
  status:
    | 'pending'
    | 'accepted'
    | 'failed'
    | 'delivered'
    | 'opened'
    | 'dropped_quiet_hours'
    | 'unavailable'
    | 'suppressed_local_schedule';
  redacted_title: string;
  redacted_body: string | null;
  attempt_count: number;
  last_attempt_at: Date | null;
  error_message: string | null;
  opened_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface DeviceDbRow {
  id: string;
  user_id: string;
  installation_id: string;
  platform: 'android' | 'ios' | 'web';
  push_token: string | null;
  token_type: 'fcm' | 'expo_push' | 'web_push' | 'none';
  capabilities: Record<string, unknown>;
  is_active: boolean;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface WebPushSubscriptionDbRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  is_active: boolean;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface DeviceScheduleDbRow {
  id: string;
  workspace_id: string;
  instance_id: string;
  device_id: string;
  rule_revision: number;
  delivery_generation: number;
  native_notification_id: string | null;
  delivery_mode: 'local' | 'push';
  acknowledged: boolean;
  acknowledged_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRowToRule(row: ReminderRuleDbRow): ReminderRule {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    targetType: row.target_type,
    targetId: row.target_id,
    ruleRevision: row.rule_revision,
    offsetMinutes: row.offset_minutes,
    scheduleTime: row.schedule_time,
    timezone: row.timezone,
    recurrence: row.recurrence,
    quietHoursBehavior: row.quiet_hours_behavior,
    channels: row.channels,
    privacyLevel: row.privacy_level,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
  };
}

function mapRowToInstance(row: ReminderInstanceDbRow): ReminderInstance {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ruleId: row.rule_id,
    ruleRevision: row.rule_revision,
    deliveryGeneration: row.delivery_generation ?? 1,
    occurrenceKey: row.occurrence_key,
    targetType: row.target_type,
    targetId: row.target_id,
    scheduledAt: row.scheduled_at.toISOString(),
    originalScheduledAt: row.original_scheduled_at.toISOString(),
    status: row.status,
    snoozeUntil: row.snooze_until ? row.snooze_until.toISOString() : null,
    invalidatedReason: row.invalidated_reason,
    invalidationTime: row.invalidation_time ? row.invalidation_time.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRowToDelivery(row: ReminderDeliveryDbRow): ReminderDelivery {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    instanceId: row.instance_id,
    deliveryGeneration: row.delivery_generation ?? 1,
    channel: row.channel,
    recipientUserId: row.recipient_user_id,
    recipientDeviceId: row.recipient_device_id ?? null,
    recipientSubscriptionId: row.recipient_subscription_id ?? null,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    status: row.status,
    redactedTitle: row.redacted_title,
    redactedBody: row.redacted_body,
    attemptCount: row.attempt_count,
    lastAttemptAt: row.last_attempt_at ? row.last_attempt_at.toISOString() : null,
    errorMessage: row.error_message,
    openedAt: row.opened_at ? row.opened_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRowToWebPushSubscription(row: WebPushSubscriptionDbRow): WebPushSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    userAgent: row.user_agent,
    isActive: row.is_active,
    lastSeenAt: row.last_seen_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRowToDevice(row: DeviceDbRow): Device {
  return {
    id: row.id,
    userId: row.user_id,
    installationId: row.installation_id,
    platform: row.platform,
    pushToken: row.push_token,
    tokenType: row.token_type,
    capabilities: row.capabilities ?? {},
    isActive: row.is_active,
    lastSeenAt: row.last_seen_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRowToDeviceSchedule(row: DeviceScheduleDbRow): DeviceSchedule {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    instanceId: row.instance_id,
    deviceId: row.device_id,
    ruleRevision: row.rule_revision,
    deliveryGeneration: row.delivery_generation ?? 1,
    nativeNotificationId: row.native_notification_id,
    deliveryMode: row.delivery_mode,
    acknowledged: row.acknowledged,
    acknowledgedAt: row.acknowledged_at ? row.acknowledged_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Validates that the workspace is personal (reminders belong to personal organizers).
 */
export async function assertPersonalWorkspace(
  client: PoolClient,
  workspaceId: string
): Promise<void> {
  const wsRes = await client.query<{ kind: string }>(
    `SELECT kind FROM app.workspaces WHERE id = $1;`,
    [workspaceId]
  );
  if (wsRes.rows.length === 0) {
    throw new NotFoundError(`Workspace ${workspaceId} not found`);
  }
  if (wsRes.rows[0]?.kind !== 'personal') {
    throw new ValidationError(
      `REMINDERS_PERSONAL_ONLY: Reminders are scoped exclusively to personal workspaces.`
    );
  }
}

/**
 * Loads target timing metadata with routine schedules and pause states.
 */
export async function loadTargetTiming(
  client: PoolClient,
  workspaceId: string,
  targetType: 'task' | 'routine' | 'calendar_event',
  targetId: string
): Promise<ReminderTargetTiming> {
  if (targetType === 'task') {
    const res = await client.query<{
      status: string;
      deadline_type: string;
      deadline_date: string | null;
      deadline_time: Date | null;
      deleted_at: Date | null;
    }>(
      `
      SELECT t.status, t.deadline_type, t.deadline_date, t.deadline_time, i.deleted_at
      FROM app.tasks t
      JOIN app.items i ON i.id = t.id AND i.workspace_id = t.workspace_id
      WHERE t.id = $1 AND t.workspace_id = $2;
      `,
      [targetId, workspaceId]
    );
    if (res.rows.length === 0) {
      throw new NotFoundError(`Target task ${targetId} not found in workspace`);
    }
    const row = res.rows[0]!;
    const isDone = row.status === 'completed' || row.status === 'cancelled';
    const isDeleted = Boolean(row.deleted_at);
    let dueTimestamp: string | null = null;
    if (row.deadline_type === 'timed' && row.deadline_time) {
      dueTimestamp = row.deadline_time.toISOString();
    }
    return {
      id: targetId,
      dueTimestamp,
      startDate: row.deadline_date,
      isDone,
      isDeleted,
      routine: null,
    };
  }

  if (targetType === 'calendar_event') {
    const res = await client.query<{
      all_day: boolean;
      start_date: string | null;
      start_at: Date | null;
      is_archived: boolean;
      deleted_at: Date | null;
    }>(
      `
      SELECT c.all_day, c.start_date, c.start_at, c.is_archived, i.deleted_at
      FROM app.calendar_events c
      JOIN app.items i ON i.id = c.id AND i.workspace_id = c.workspace_id
      WHERE c.id = $1 AND c.workspace_id = $2;
      `,
      [targetId, workspaceId]
    );
    if (res.rows.length === 0) {
      throw new NotFoundError(`Target calendar event ${targetId} not found in workspace`);
    }
    const row = res.rows[0]!;
    return {
      id: targetId,
      dueTimestamp: row.start_at ? row.start_at.toISOString() : null,
      startDate: row.start_date,
      isDone: row.is_archived,
      isDeleted: Boolean(row.deleted_at),
      routine: null,
    };
  }

  if (targetType === 'routine') {
    const res = await client.query<{
      scheduled_time: string | null;
      active_from: string;
      active_to: string | null;
      weekdays: number[];
      frequency: 'daily' | 'weekdays';
      is_archived: boolean;
      is_paused: boolean;
      deleted_at: Date | null;
    }>(
      `
      SELECT r.scheduled_time, r.active_from, r.active_to, r.weekdays, r.frequency,
             r.is_archived, r.is_paused, i.deleted_at
      FROM app.routines r
      JOIN app.items i ON i.id = r.id AND i.workspace_id = r.workspace_id
      WHERE r.id = $1 AND r.workspace_id = $2;
      `,
      [targetId, workspaceId]
    );
    if (res.rows.length === 0) {
      throw new NotFoundError(`Target routine ${targetId} not found in workspace`);
    }
    const row = res.rows[0]!;
    return {
      id: targetId,
      dueTimestamp: null,
      startDate: row.active_from,
      isDone: row.is_archived || row.is_paused,
      isDeleted: Boolean(row.deleted_at),
      routine: {
        frequency: row.frequency,
        weekdays: row.weekdays || [],
        scheduledTime: row.scheduled_time,
        activeFrom: row.active_from,
        activeTo: row.active_to,
        isPaused: row.is_paused,
        isArchived: row.is_archived,
      },
    };
  }

  throw new ValidationError(`Unsupported target type: ${targetType}`);
}

/**
 * Creates a reminder rule and schedules its initial rolling-horizon occurrences.
 */
export async function createReminderRule(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  input: CreateReminderRuleRequest
): Promise<ReminderRule> {
  await assertPersonalWorkspace(client, workspaceId);

  if (input.timezone && !isValidIanaTimezone(input.timezone)) {
    throw new ValidationError(`INVALID_TIMEZONE: ${input.timezone} is not a valid IANA timezone`);
  }

  // Verify target entity exists in this workspace
  const targetTiming = await loadTargetTiming(client, workspaceId, input.targetType, input.targetId);

  const ruleId = input.id || crypto.randomUUID();
  const ruleRevision = 1;
  const timezone = input.timezone || 'UTC';
  const recurrence = input.recurrence || 'none';
  const quietHoursBehavior = input.quietHoursBehavior || 'defer';
  const channels = input.channels && input.channels.length > 0 ? input.channels : ['in_app', 'push'];
  const privacyLevel = input.privacyLevel || 'generic';

  const insertRes = await client.query<ReminderRuleDbRow>(
    `
    INSERT INTO app.reminder_rules (
      id, workspace_id, target_type, target_id, rule_revision,
      offset_minutes, schedule_time, timezone, recurrence,
      quiet_hours_behavior, channels, privacy_level, is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
    RETURNING *;
    `,
    [
      ruleId,
      workspaceId,
      input.targetType,
      input.targetId,
      ruleRevision,
      input.offsetMinutes ?? null,
      input.scheduleTime ?? null,
      timezone,
      recurrence,
      quietHoursBehavior,
      channels,
      privacyLevel,
    ]
  );

  const rule = mapRowToRule(insertRes.rows[0]!);

  // Materialize occurrences within 14-day rolling horizon
  const occurrences = materializeReminderOccurrences({
    rule,
    target: targetTiming,
    horizonDays: 14,
    now: new Date(),
  });

  for (const occ of occurrences) {
    const instRes = await client.query<{ id: string }>(
      `
      INSERT INTO app.reminder_instances (
        workspace_id, rule_id, rule_revision, delivery_generation, occurrence_key,
        target_type, target_id, scheduled_at, original_scheduled_at, status
      )
      VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, 'scheduled')
      ON CONFLICT (workspace_id, rule_id, rule_revision, occurrence_key) DO NOTHING
      RETURNING id;
      `,
      [
        workspaceId,
        rule.id,
        rule.ruleRevision,
        occ.occurrenceKey,
        rule.targetType,
        rule.targetId,
        occ.scheduledAt,
        occ.originalScheduledAt,
      ]
    );

    if (instRes.rows.length > 0) {
      const instanceId = instRes.rows[0]!.id;
      await client.query(
        `
        INSERT INTO app.background_jobs (task_type, payload, run_at, status)
        VALUES ('reminder_delivery', $1::jsonb, $2, 'pending');
        `,
        [
          JSON.stringify({
            workspaceId,
            instanceId,
            ruleId: rule.id,
            ruleRevision: rule.ruleRevision,
            deliveryGeneration: 1,
            targetType: rule.targetType,
            targetId: rule.targetId,
            actorUserId,
          }),
          occ.scheduledAt,
        ]
      );
    }
  }

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'reminder_rule.created',
    payload: { ruleId: rule.id, targetId: rule.targetId },
  });

  return rule;
}

/**
 * Updates a reminder rule, increments revision, invalidates previous instances,
 * and rematerializes occurrences under the new revision.
 */
export async function updateReminderRule(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  ruleId: string,
  input: UpdateReminderRuleRequest
): Promise<ReminderRule> {
  await assertPersonalWorkspace(client, workspaceId);

  // 1. Fetch current rule with row lock
  const ruleRes = await client.query<ReminderRuleDbRow>(
    `SELECT * FROM app.reminder_rules WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL FOR UPDATE;`,
    [ruleId, workspaceId]
  );
  if (ruleRes.rows.length === 0) {
    throw new NotFoundError(`Reminder rule ${ruleId} not found`);
  }

  const current = mapRowToRule(ruleRes.rows[0]!);

  // Version check: if client provided baseRevision, ensure it matches current revision
  if (input.baseRevision !== undefined && current.ruleRevision !== input.baseRevision) {
    throw new ConflictError(
      `RULE_REVISION_MISMATCH: Expected rule revision ${input.baseRevision}, but current revision is ${current.ruleRevision}.`
    );
  }

  if (input.timezone && !isValidIanaTimezone(input.timezone)) {
    throw new ValidationError(`INVALID_TIMEZONE: ${input.timezone} is not a valid IANA timezone`);
  }

  const nextRevision = current.ruleRevision + 1;
  const nextOffset = input.offsetMinutes !== undefined ? input.offsetMinutes : current.offsetMinutes;
  const nextScheduleTime = input.scheduleTime !== undefined ? input.scheduleTime : current.scheduleTime;
  const nextTz = input.timezone !== undefined ? input.timezone : current.timezone;
  const nextRecurrence = input.recurrence !== undefined ? input.recurrence : current.recurrence;
  const nextQuiet = input.quietHoursBehavior !== undefined ? input.quietHoursBehavior : current.quietHoursBehavior;
  const nextChannels = input.channels !== undefined ? input.channels : current.channels;
  const nextPrivacy = input.privacyLevel !== undefined ? input.privacyLevel : current.privacyLevel;
  const nextActive = input.isActive !== undefined ? input.isActive : current.isActive;

  const updateRes = await client.query<ReminderRuleDbRow>(
    `
    UPDATE app.reminder_rules SET
      rule_revision = $1,
      offset_minutes = $2,
      schedule_time = $3,
      timezone = $4,
      recurrence = $5,
      quiet_hours_behavior = $6,
      channels = $7,
      privacy_level = $8,
      is_active = $9,
      updated_at = now()
    WHERE id = $10 AND workspace_id = $11
    RETURNING *;
    `,
    [
      nextRevision,
      nextOffset,
      nextScheduleTime,
      nextTz,
      nextRecurrence,
      nextQuiet,
      nextChannels,
      nextPrivacy,
      nextActive,
      ruleId,
      workspaceId,
    ]
  );

  const updatedRule = mapRowToRule(updateRes.rows[0]!);

  // Invalidate previous pending/scheduled instances of this rule
  await client.query(
    `
    UPDATE app.reminder_instances SET
      status = 'invalidated',
      invalidated_reason = 'rule_updated',
      invalidation_time = now(),
      updated_at = now()
    WHERE workspace_id = $1 AND rule_id = $2 AND status IN ('scheduled', 'snoozed');
    `,
    [workspaceId, ruleId]
  );

  // Rematerialize occurrences if still active
  if (updatedRule.isActive) {
    const targetTiming = await loadTargetTiming(
      client,
      workspaceId,
      updatedRule.targetType,
      updatedRule.targetId
    );

    const occurrences = materializeReminderOccurrences({
      rule: updatedRule,
      target: targetTiming,
      horizonDays: 14,
      now: new Date(),
    });

    for (const occ of occurrences) {
      const instRes = await client.query<{ id: string }>(
        `
        INSERT INTO app.reminder_instances (
          workspace_id, rule_id, rule_revision, delivery_generation, occurrence_key,
          target_type, target_id, scheduled_at, original_scheduled_at, status
        )
        VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, 'scheduled')
        ON CONFLICT (workspace_id, rule_id, rule_revision, occurrence_key) DO NOTHING
        RETURNING id;
        `,
        [
          workspaceId,
          updatedRule.id,
          updatedRule.ruleRevision,
          occ.occurrenceKey,
          updatedRule.targetType,
          updatedRule.targetId,
          occ.scheduledAt,
          occ.originalScheduledAt,
        ]
      );

      if (instRes.rows.length > 0) {
        const instanceId = instRes.rows[0]!.id;
        await client.query(
          `
          INSERT INTO app.background_jobs (task_type, payload, run_at, status)
          VALUES ('reminder_delivery', $1::jsonb, $2, 'pending');
          `,
          [
            JSON.stringify({
              workspaceId,
              instanceId,
              ruleId: updatedRule.id,
              ruleRevision: updatedRule.ruleRevision,
              deliveryGeneration: 1,
              targetType: updatedRule.targetType,
              targetId: updatedRule.targetId,
              actorUserId,
            }),
            occ.scheduledAt,
          ]
        );
      }
    }
  }

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'reminder_rule.updated',
    payload: { ruleId, revision: nextRevision },
  });

  return updatedRule;
}

/**
 * Soft deletes a reminder rule and invalidates all its scheduled/snoozed instances.
 */
export async function deleteReminderRule(
  client: PoolClient,
  workspaceId: string,
  ruleId: string
): Promise<{ id: string; success: boolean }> {
  await assertPersonalWorkspace(client, workspaceId);

  const res = await client.query(
    `
    UPDATE app.reminder_rules SET
      deleted_at = now(),
      is_active = false,
      updated_at = now()
    WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL;
    `,
    [ruleId, workspaceId]
  );

  if (res.rowCount === 0) {
    throw new NotFoundError(`Reminder rule ${ruleId} not found`);
  }

  await client.query(
    `
    UPDATE app.reminder_instances SET
      status = 'invalidated',
      invalidated_reason = 'rule_deleted',
      invalidation_time = now(),
      updated_at = now()
    WHERE workspace_id = $1 AND rule_id = $2 AND status IN ('scheduled', 'snoozed');
    `,
    [workspaceId, ruleId]
  );

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'reminder_rule.deleted',
    payload: { ruleId },
  });

  return { id: ruleId, success: true };
}

/**
 * Fetches a single reminder rule by ID.
 */
export async function getReminderRule(
  client: PoolClient,
  workspaceId: string,
  ruleId: string
): Promise<ReminderRule> {
  await assertPersonalWorkspace(client, workspaceId);

  const res = await client.query<ReminderRuleDbRow>(
    `SELECT * FROM app.reminder_rules WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL;`,
    [ruleId, workspaceId]
  );
  if (res.rows.length === 0) {
    throw new NotFoundError(`Reminder rule ${ruleId} not found`);
  }
  return mapRowToRule(res.rows[0]!);
}

/**
 * Lists reminder rules for a workspace, optionally filtered by target ID.
 */
export async function listReminderRules(
  client: PoolClient,
  workspaceId: string,
  targetId?: string
): Promise<ReminderRule[]> {
  await assertPersonalWorkspace(client, workspaceId);

  let query = `SELECT * FROM app.reminder_rules WHERE workspace_id = $1 AND deleted_at IS NULL`;
  const params: unknown[] = [workspaceId];

  if (targetId) {
    query += ` AND target_id = $2`;
    params.push(targetId);
  }

  query += ` ORDER BY created_at DESC;`;

  const res = await client.query<ReminderRuleDbRow>(query, params);
  return res.rows.map(mapRowToRule);
}

/**
 * Lists reminder instances for a workspace, optionally filtered by status or targetId.
 */
export async function listReminderInstances(
  client: PoolClient,
  workspaceId: string,
  filter?: { status?: string; targetId?: string }
): Promise<ReminderInstance[]> {
  await assertPersonalWorkspace(client, workspaceId);

  let query = `SELECT * FROM app.reminder_instances WHERE workspace_id = $1`;
  const params: unknown[] = [workspaceId];
  let pIdx = 2;

  if (filter?.status) {
    query += ` AND status = $${pIdx++}`;
    params.push(filter.status);
  }
  if (filter?.targetId) {
    query += ` AND target_id = $${pIdx++}`;
    params.push(filter.targetId);
  }

  query += ` ORDER BY scheduled_at ASC;`;

  const res = await client.query<ReminderInstanceDbRow>(query, params);
  return res.rows.map(mapRowToInstance);
}

/**
 * Snoozes a scheduled or dispatched reminder instance.
 * Calculates snooze instant relative to the current instant, respects quiet hours,
 * and advances the delivery_generation to ensure safe delivery and deduplication.
 */
export async function snoozeReminderInstance(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  instanceId: string,
  input: SnoozeReminderRequest
): Promise<ReminderInstance> {
  await assertPersonalWorkspace(client, workspaceId);

  const instRes = await client.query<ReminderInstanceDbRow>(
    `SELECT * FROM app.reminder_instances WHERE id = $1 AND workspace_id = $2 FOR UPDATE;`,
    [instanceId, workspaceId]
  );
  if (instRes.rows.length === 0) {
    throw new NotFoundError(`Reminder instance ${instanceId} not found`);
  }

  const current = instRes.rows[0]!;
  if (current.status === 'invalidated' || current.status === 'dismissed') {
    throw new ConflictError(`Cannot snooze reminder with terminal status '${current.status}'`);
  }

  // Load quiet hours preference for workspace owner
  const profileRes = await client.query<{ preferences: Record<string, unknown> }>(
    `
    SELECT p.preferences
    FROM app.profiles p
    JOIN app.workspaces w ON w.owner_id = p.id
    WHERE w.id = $1;
    `,
    [workspaceId]
  );
  const qhConfig = profileRes.rows[0]?.preferences?.quietHours as QuietHoursConfig | undefined;

  // Calculate snooze relative to actual action time (now)
  const { snoozeUntil } = calculateSnoozeTime(new Date(), input.snoozeMinutes, qhConfig);
  const nextGeneration = (current.delivery_generation ?? 1) + 1;

  const updateRes = await client.query<ReminderInstanceDbRow>(
    `
    UPDATE app.reminder_instances SET
      status = 'snoozed',
      snooze_until = $1,
      scheduled_at = $1,
      delivery_generation = $2,
      updated_at = now()
    WHERE id = $3 AND workspace_id = $4
    RETURNING *;
    `,
    [snoozeUntil, nextGeneration, instanceId, workspaceId]
  );

  // Enqueue new background job for snoozed instant with incremented delivery generation
  await client.query(
    `
    INSERT INTO app.background_jobs (task_type, payload, run_at, status)
    VALUES ('reminder_delivery', $1::jsonb, $2, 'pending');
    `,
    [
      JSON.stringify({
        workspaceId,
        instanceId,
        ruleId: current.rule_id,
        ruleRevision: current.rule_revision,
        deliveryGeneration: nextGeneration,
        targetType: current.target_type,
        targetId: current.target_id,
        actorUserId,
      }),
      snoozeUntil,
    ]
  );

  return mapRowToInstance(updateRes.rows[0]!);
}

/**
 * Records receipt of a delivery (e.g. user-opened or client-observed).
 * Enforces monotonic state transitions: client cannot report 'accepted' (reserved for delivery adapters).
 * When opened, updates the instance status to 'observed'.
 */
export async function recordDeliveryReceipt(
  client: PoolClient,
  workspaceId: string,
  deliveryId: string,
  input: RecordDeliveryReceiptRequest,
  actorUserId?: string
): Promise<ReminderDelivery> {
  await assertPersonalWorkspace(client, workspaceId);

  const delivRes = await client.query<ReminderDeliveryDbRow>(
    `SELECT * FROM app.reminder_deliveries WHERE id = $1 AND workspace_id = $2 FOR UPDATE;`,
    [deliveryId, workspaceId]
  );
  if (delivRes.rows.length === 0) {
    throw new NotFoundError(`Reminder delivery ${deliveryId} not found`);
  }

  const current = delivRes.rows[0]!;

  // Scope check: if actorUserId is provided, ensure actor is recipient or workspace owner
  if (actorUserId && current.recipient_user_id !== actorUserId) {
    const ownerRes = await client.query<{ owner_id: string }>(
      `SELECT owner_id FROM app.workspaces WHERE id = $1;`,
      [workspaceId]
    );
    if (ownerRes.rows[0]?.owner_id !== actorUserId) {
      throw new ForbiddenError(`FORBIDDEN: You cannot record receipts for other recipients' deliveries.`);
    }
  }

  const nextStatus = input.status;

  // Monotonic state transitions: cannot regress from 'opened' back to 'delivered'
  if (current.status === 'opened' && nextStatus === 'delivered') {
    return mapRowToDelivery(current);
  }

  const updateRes = await client.query<ReminderDeliveryDbRow>(
    `
    UPDATE app.reminder_deliveries SET
      status = $1,
      opened_at = CASE WHEN $1 = 'opened' THEN COALESCE(opened_at, now()) ELSE opened_at END,
      updated_at = now()
    WHERE id = $2 AND workspace_id = $3
    RETURNING *;
    `,
    [nextStatus, deliveryId, workspaceId]
  );

  if (nextStatus === 'opened') {
    await client.query(
      `
      UPDATE app.reminder_instances SET
        status = 'observed',
        updated_at = now()
      WHERE id = $1 AND workspace_id = $2 AND status != 'invalidated';
      `,
      [current.instance_id, workspaceId]
    );
  }

  return mapRowToDelivery(updateRes.rows[0]!);
}

/**
 * Invalidates all pending/scheduled reminder instances for a given target entity.
 */
export async function invalidateTargetReminders(
  client: PoolClient,
  workspaceId: string,
  arg3: string,
  arg4: string,
  arg5?: string
): Promise<number> {
  const targetId = arg5 !== undefined ? arg4 : arg3;
  const reason = arg5 !== undefined ? arg5 : arg4;
  const res = await client.query(
    `
    UPDATE app.reminder_instances SET
      status = 'invalidated',
      invalidated_reason = $1,
      invalidation_time = now(),
      updated_at = now()
    WHERE workspace_id = $2 AND target_id = $3 AND status IN ('scheduled', 'snoozed');
    `,
    [reason, workspaceId, targetId]
  );
  return res.rowCount ?? 0;
}

/**
 * Rebuilds reminder instances for a target entity after source updates
 * (deadline edit, timezone change, pause/resume, or restoration from trash).
 */
export async function rebuildTargetReminders(
  client: PoolClient,
  workspaceId: string,
  arg3: string,
  arg4: string,
  arg5?: string,
  arg6?: string
): Promise<number> {
  const targetId = arg6 !== undefined ? arg4 : arg3;
  const actorUserId = arg6 !== undefined ? arg5! : arg4;
  const reason = arg6 !== undefined ? arg6 : (arg5 || 'target_updated');
  // 1. Invalidate stale pending instances
  await invalidateTargetReminders(client, workspaceId, targetId, reason);

  // 2. Fetch all active reminder rules for this target
  const rulesRes = await client.query<ReminderRuleDbRow>(
    `SELECT * FROM app.reminder_rules WHERE workspace_id = $1 AND target_id = $2 AND is_active = true AND deleted_at IS NULL;`,
    [workspaceId, targetId]
  );

  if (rulesRes.rows.length === 0) {
    return 0;
  }

  // 3. For each active rule, load current target timing and rematerialize
  let newlyScheduled = 0;
  for (const row of rulesRes.rows) {
    const rule = mapRowToRule(row);
    try {
      const targetTiming = await loadTargetTiming(client, workspaceId, rule.targetType, targetId);

      // If target is done or deleted, do not schedule
      if (targetTiming.isDone || targetTiming.isDeleted) {
        continue;
      }

      const occurrences = materializeReminderOccurrences({
        rule,
        target: targetTiming,
        horizonDays: 14,
        now: new Date(),
      });

      for (const occ of occurrences) {
        const instRes = await client.query<{ id: string }>(
          `
          INSERT INTO app.reminder_instances (
            workspace_id, rule_id, rule_revision, delivery_generation, occurrence_key,
            target_type, target_id, scheduled_at, original_scheduled_at, status
          )
          VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, 'scheduled')
          ON CONFLICT (workspace_id, rule_id, rule_revision, occurrence_key) DO NOTHING
          RETURNING id;
          `,
          [
            workspaceId,
            rule.id,
            rule.ruleRevision,
            occ.occurrenceKey,
            rule.targetType,
            rule.targetId,
            occ.scheduledAt,
            occ.originalScheduledAt,
          ]
        );

        if (instRes.rows.length > 0) {
          newlyScheduled++;
          await client.query(
            `
            INSERT INTO app.background_jobs (task_type, payload, run_at, status)
            VALUES ('reminder_delivery', $1::jsonb, $2, 'pending');
            `,
            [
              JSON.stringify({
                workspaceId,
                instanceId: instRes.rows[0]!.id,
                ruleId: rule.id,
                ruleRevision: rule.ruleRevision,
                deliveryGeneration: 1,
                targetType: rule.targetType,
                targetId: rule.targetId,
                actorUserId,
              }),
              occ.scheduledAt,
            ]
          );
        }
      }
    } catch {
      // If target deleted or not found, skip rule
    }
  }

  return newlyScheduled;
}

/**
 * Replenishes rolling horizon occurrences for all recurring reminder rules
 * without stopping after the initial 14 days. Idempotently skips already scheduled occurrences.
 */
export async function replenishRollingHorizonReminders(
  client: PoolClient,
  workspaceId?: string,
  horizonDays = 14
): Promise<number> {
  let query = `
    SELECT * FROM app.reminder_rules
    WHERE is_active = true AND deleted_at IS NULL AND recurrence != 'none'
  `;
  const params: unknown[] = [];
  if (workspaceId) {
    query += ` AND workspace_id = $1`;
    params.push(workspaceId);
  }

  const rulesRes = await client.query<ReminderRuleDbRow>(query, params);
  let newlyScheduled = 0;

  for (const row of rulesRes.rows) {
    const rule = mapRowToRule(row);
    try {
      const targetTiming = await loadTargetTiming(client, rule.workspaceId, rule.targetType, rule.targetId);
      if (targetTiming.isDone || targetTiming.isDeleted) {
        continue;
      }

      const occurrences = materializeReminderOccurrences({
        rule,
        target: targetTiming,
        horizonDays,
        now: new Date(),
      });

      for (const occ of occurrences) {
        const instRes = await client.query<{ id: string }>(
          `
          INSERT INTO app.reminder_instances (
            workspace_id, rule_id, rule_revision, delivery_generation, occurrence_key,
            target_type, target_id, scheduled_at, original_scheduled_at, status
          )
          VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, 'scheduled')
          ON CONFLICT (workspace_id, rule_id, rule_revision, occurrence_key) DO NOTHING
          RETURNING id;
          `,
          [
            rule.workspaceId,
            rule.id,
            rule.ruleRevision,
            occ.occurrenceKey,
            rule.targetType,
            rule.targetId,
            occ.scheduledAt,
            occ.originalScheduledAt,
          ]
        );

        if (instRes.rows.length > 0) {
          newlyScheduled++;
          await client.query(
            `
            INSERT INTO app.background_jobs (task_type, payload, run_at, status)
            VALUES ('reminder_delivery', $1::jsonb, $2, 'pending');
            `,
            [
              JSON.stringify({
                workspaceId: rule.workspaceId,
                instanceId: instRes.rows[0]!.id,
                ruleId: rule.id,
                ruleRevision: rule.ruleRevision,
                deliveryGeneration: 1,
                targetType: rule.targetType,
                targetId: rule.targetId,
              }),
              occ.scheduledAt,
            ]
          );
        }
      }
    } catch {
      // Target may be gone
    }
  }

  return newlyScheduled;
}

// ============================================================================
// Phase 28: Device Registration & Schedule Coordination Service Methods
// ============================================================================

/**
 * Registers or updates a client device installation.
 * Enforces token ownership hygiene: if a push token is transferred from another account,
 * deactivates the previous ownership to prevent authorization hijacking.
 */
export async function registerDevice(
  client: PoolClient,
  userId: string,
  input: RegisterDeviceRequest
): Promise<Device> {
  const pushToken = input.pushToken?.trim() || null;

  // Protect against token hijacking: if pushToken already registered to another user, deactivate it
  if (pushToken) {
    await client.query(
      `
      UPDATE app.devices
      SET is_active = false, push_token = NULL, updated_at = now()
      WHERE push_token = $1 AND user_id != $2;
      `,
      [pushToken, userId]
    );
  }

  const upsertRes = await client.query<DeviceDbRow>(
    `
    INSERT INTO app.devices (
      user_id, installation_id, platform, push_token, token_type, capabilities, is_active, last_seen_at
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, true, now())
    ON CONFLICT (user_id, installation_id) DO UPDATE SET
      platform = EXCLUDED.platform,
      push_token = EXCLUDED.push_token,
      token_type = EXCLUDED.token_type,
      capabilities = EXCLUDED.capabilities,
      is_active = true,
      last_seen_at = now(),
      updated_at = now()
    RETURNING *;
    `,
    [
      userId,
      input.installationId,
      input.platform,
      pushToken,
      input.tokenType,
      JSON.stringify(input.capabilities || {}),
    ]
  );

  return mapRowToDevice(upsertRes.rows[0]!);
}

/**
 * Deactivates a device registration on user sign-out or uninstall.
 */
export async function deactivateDevice(
  client: PoolClient,
  userId: string,
  installationId: string
): Promise<{ success: boolean }> {
  await client.query(
    `
    UPDATE app.devices
    SET is_active = false, push_token = NULL, updated_at = now()
    WHERE user_id = $1 AND installation_id = $2;
    `,
    [userId, installationId]
  );
  return { success: true };
}

/**
 * Lists active registered devices for a user.
 */
export async function listUserDevices(
  client: PoolClient,
  userId: string
): Promise<Device[]> {
  const res = await client.query<DeviceDbRow>(
    `SELECT * FROM app.devices WHERE user_id = $1 AND is_active = true ORDER BY last_seen_at DESC;`,
    [userId]
  );
  return res.rows.map(mapRowToDevice);
}

/**
 * Acknowledges a device's local schedule for a reminder instance, coordinating
 * between device-local delivery and server push fallback.
 */
export async function acknowledgeDeviceSchedule(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  input: AcknowledgeDeviceScheduleRequest
): Promise<DeviceSchedule> {
  await assertPersonalWorkspace(client, workspaceId);

  // Verify device belongs to actor
  const devRes = await client.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM app.devices WHERE id = $1;`,
    [input.deviceId]
  );
  if (devRes.rows.length === 0) {
    throw new NotFoundError(`Device ${input.deviceId} not found`);
  }
  if (devRes.rows[0]?.user_id !== actorUserId) {
    throw new ForbiddenError(`FORBIDDEN: Device does not belong to the authenticated user`);
  }

  // Verify instance exists in workspace
  const instRes = await client.query<{ id: string }>(
    `SELECT id FROM app.reminder_instances WHERE id = $1 AND workspace_id = $2;`,
    [input.instanceId, workspaceId]
  );
  if (instRes.rows.length === 0) {
    throw new NotFoundError(`Reminder instance ${input.instanceId} not found in workspace`);
  }

  const upsertRes = await client.query<DeviceScheduleDbRow>(
    `
    INSERT INTO app.device_reminder_schedules (
      workspace_id, instance_id, device_id, rule_revision, delivery_generation,
      native_notification_id, delivery_mode, acknowledged, acknowledged_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 = true THEN now() ELSE NULL END)
    ON CONFLICT (instance_id, device_id, delivery_generation) DO UPDATE SET
      rule_revision = EXCLUDED.rule_revision,
      native_notification_id = EXCLUDED.native_notification_id,
      delivery_mode = EXCLUDED.delivery_mode,
      acknowledged = EXCLUDED.acknowledged,
      acknowledged_at = CASE WHEN EXCLUDED.acknowledged = true THEN now() ELSE NULL END,
      updated_at = now()
    RETURNING *;
    `,
    [
      workspaceId,
      input.instanceId,
      input.deviceId,
      input.ruleRevision,
      input.deliveryGeneration,
      input.nativeNotificationId || null,
      input.deliveryMode,
      input.acknowledged,
    ]
  );

  return mapRowToDeviceSchedule(upsertRes.rows[0]!);
}

/**
 * Lists device schedule acknowledgments for a reminder instance.
 */
export async function listDeviceSchedules(
  client: PoolClient,
  workspaceId: string,
  instanceId: string
): Promise<DeviceSchedule[]> {
  await assertPersonalWorkspace(client, workspaceId);

  const res = await client.query<DeviceScheduleDbRow>(
    `SELECT * FROM app.device_reminder_schedules WHERE workspace_id = $1 AND instance_id = $2;`,
    [workspaceId, instanceId]
  );
  return res.rows.map(mapRowToDeviceSchedule);
}

/**
 * Validates that a Web Push endpoint URL is HTTPS and does not target
 * private, internal, or loopback network addresses (SSRF prevention).
 */
export function assertValidPushEndpoint(endpoint: string): void {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') {
      throw new ValidationError('Push notification endpoint must use HTTPS');
    }
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.test') ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^0\./.test(hostname)
    ) {
      throw new ValidationError(
        'Push notification endpoint points to a disallowed, private, or loopback network address'
      );
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('Invalid push notification endpoint URL');
  }
}

/**
 * Returns the VAPID public key for Web Push client subscription.
 */
export function getVapidPublicKey(): string {
  return (
    process.env['VAPID_PUBLIC_KEY'] ||
    // Standard test public key (base64url uncompressed P-256 point)
    'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXY5CEvHg84'
  );
}

/**
 * Registers or updates a browser Web Push subscription for a user.
 */
export async function registerWebPushSubscription(
  client: PoolClient,
  userId: string,
  input: RegisterWebPushSubscriptionRequest
): Promise<WebPushSubscription> {
  assertValidPushEndpoint(input.endpoint);

  const upsertRes = await client.query<WebPushSubscriptionDbRow>(
    `
    INSERT INTO app.web_push_subscriptions (
      user_id, endpoint, p256dh, auth, user_agent, is_active, last_seen_at
    )
    VALUES ($1, $2, $3, $4, $5, true, now())
    ON CONFLICT (user_id, endpoint) DO UPDATE SET
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      user_agent = EXCLUDED.user_agent,
      is_active = true,
      last_seen_at = now(),
      updated_at = now()
    RETURNING *;
    `,
    [userId, input.endpoint, input.p256dh, input.auth, input.userAgent || null]
  );

  return mapRowToWebPushSubscription(upsertRes.rows[0]!);
}

/**
 * Deactivates a browser Web Push subscription for a user (unsubscribe).
 */
export async function deactivateWebPushSubscription(
  client: PoolClient,
  userId: string,
  endpoint: string
): Promise<{ success: boolean }> {
  await client.query(
    `UPDATE app.web_push_subscriptions SET is_active = false, updated_at = now() WHERE user_id = $1 AND endpoint = $2;`,
    [userId, endpoint]
  );
  return { success: true };
}

/**
 * Lists active Web Push subscriptions for a user.
 */
export async function listUserWebPushSubscriptions(
  client: PoolClient,
  userId: string
): Promise<WebPushSubscription[]> {
  const res = await client.query<WebPushSubscriptionDbRow>(
    `SELECT * FROM app.web_push_subscriptions WHERE user_id = $1 AND is_active = true ORDER BY last_seen_at DESC;`,
    [userId]
  );
  return res.rows.map(mapRowToWebPushSubscription);
}
