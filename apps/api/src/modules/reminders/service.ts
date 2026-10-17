import type { PoolClient } from 'pg';
import crypto from 'node:crypto';
import type {
  ReminderRule,
  ReminderInstance,
  ReminderDelivery,
  CreateReminderRuleRequest,
  UpdateReminderRuleRequest,
  SnoozeReminderRequest,
  RecordDeliveryReceiptRequest,
} from '@daynori/contracts';
import {
  materializeReminderOccurrences,
  calculateSnoozeTime,
  isValidIanaTimezone,
} from '@daynori/domain';
import { insertOutboxIntent } from '../sync/repository.js';
import { NotFoundError, ValidationError, ConflictError } from '../../plugins/errorHandler.js';

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
  channel: 'in_app' | 'push' | 'local';
  recipient_user_id: string;
  provider: 'in_app' | 'fcm' | 'web_push';
  provider_message_id: string | null;
  status:
    | 'pending'
    | 'accepted'
    | 'failed'
    | 'delivered'
    | 'opened'
    | 'dropped_quiet_hours';
  redacted_title: string;
  redacted_body: string | null;
  attempt_count: number;
  last_attempt_at: Date | null;
  error_message: string | null;
  opened_at: Date | null;
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
    channel: row.channel,
    recipientUserId: row.recipient_user_id,
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

/**
 * Checks that the workspace is personal (reminders are currently private/personal only).
 */
export async function assertPersonalWorkspace(client: PoolClient, workspaceId: string): Promise<void> {
  const wsRes = await client.query<{ kind: string }>(
    `SELECT kind FROM app.workspaces WHERE id = $1;`,
    [workspaceId]
  );
  if (wsRes.rows.length === 0) {
    throw new NotFoundError('Workspace not found');
  }
  if (wsRes.rows[0]!.kind !== 'personal') {
    throw new ValidationError('Reminders are currently supported in personal workspaces only');
  }
}

/**
 * Loads target entity timing details to support occurrence materialization.
 */
export async function loadTargetTiming(
  client: PoolClient,
  workspaceId: string,
  targetType: 'task' | 'routine' | 'calendar_event',
  targetId: string
): Promise<{
  dueTimestamp: string | null;
  startDate: string | null;
  isDone: boolean;
  isDeleted: boolean;
}> {
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
      dueTimestamp,
      startDate: row.deadline_date,
      isDone,
      isDeleted,
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
      dueTimestamp: row.start_at ? row.start_at.toISOString() : null,
      startDate: row.start_date,
      isDone: row.is_archived,
      isDeleted: Boolean(row.deleted_at),
    };
  }

  if (targetType === 'routine') {
    const res = await client.query<{
      scheduled_time: string | null;
      active_from: string;
      is_archived: boolean;
      is_paused: boolean;
      deleted_at: Date | null;
    }>(
      `
      SELECT r.scheduled_time, r.active_from, r.is_archived, r.is_paused, i.deleted_at
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
      dueTimestamp: null,
      startDate: row.active_from,
      isDone: row.is_archived || row.is_paused,
      isDeleted: Boolean(row.deleted_at),
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

  // Materialize occurrences
  const occurrences = materializeReminderOccurrences({
    rule,
    target: {
      id: input.targetId,
      dueTimestamp: targetTiming.dueTimestamp,
      startDate: targetTiming.startDate,
      isDone: targetTiming.isDone,
      isDeleted: targetTiming.isDeleted,
    },
    horizonDays: 14,
    now: new Date(),
  });

  for (const occ of occurrences) {
    const instRes = await client.query<{ id: string }>(
      `
      INSERT INTO app.reminder_instances (
        workspace_id, rule_id, rule_revision, occurrence_key,
        target_type, target_id, scheduled_at, original_scheduled_at, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')
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
      // Enqueue durable leased job
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
    payload: { ruleId: rule.id, targetId: rule.targetId, targetType: rule.targetType },
  });

  return rule;
}

/**
 * Updates an existing reminder rule, increments revision, invalidates stale occurrences,
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

  const existingRes = await client.query<ReminderRuleDbRow>(
    `SELECT * FROM app.reminder_rules WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL;`,
    [ruleId, workspaceId]
  );
  if (existingRes.rows.length === 0) {
    throw new NotFoundError(`Reminder rule ${ruleId} not found`);
  }
  const current = mapRowToRule(existingRes.rows[0]!);

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
      target: {
        id: updatedRule.targetId,
        dueTimestamp: targetTiming.dueTimestamp,
        startDate: targetTiming.startDate,
        isDone: targetTiming.isDone,
        isDeleted: targetTiming.isDeleted,
      },
      horizonDays: 14,
      now: new Date(),
    });

    for (const occ of occurrences) {
      const instRes = await client.query<{ id: string }>(
        `
        INSERT INTO app.reminder_instances (
          workspace_id, rule_id, rule_revision, occurrence_key,
          target_type, target_id, scheduled_at, original_scheduled_at, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')
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
    throw new ConflictError(`Cannot snooze reminder with status '${current.status}'`);
  }

  const { snoozeUntil } = calculateSnoozeTime(current.scheduled_at, input.snoozeMinutes);

  const updateRes = await client.query<ReminderInstanceDbRow>(
    `
    UPDATE app.reminder_instances SET
      status = 'snoozed',
      snooze_until = $1,
      scheduled_at = $1,
      updated_at = now()
    WHERE id = $2 AND workspace_id = $3
    RETURNING *;
    `,
    [snoozeUntil, instanceId, workspaceId]
  );

  // Enqueue new background job for snoozed instant
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
 * Records receipt of a delivery (e.g. user-opened or provider-accepted).
 * When opened, updates the instance status to 'observed'.
 */
export async function recordDeliveryReceipt(
  client: PoolClient,
  workspaceId: string,
  deliveryId: string,
  input: RecordDeliveryReceiptRequest
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
  const nextStatus = input.status;

  const updateRes = await client.query<ReminderDeliveryDbRow>(
    `
    UPDATE app.reminder_deliveries SET
      status = $1,
      opened_at = CASE WHEN $1 = 'opened' THEN now() ELSE opened_at END,
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
      WHERE id = $1 AND workspace_id = $2;
      `,
      [current.instance_id, workspaceId]
    );
  }

  return mapRowToDelivery(updateRes.rows[0]!);
}

/**
 * Invalidates pending reminder instances for a given target entity.
 * Called when tasks are completed, routines are paused, or dates/targets change.
 */
export async function invalidateTargetReminders(
  client: PoolClient,
  workspaceId: string,
  targetType: 'task' | 'routine' | 'calendar_event',
  targetId: string,
  reason: string
): Promise<number> {
  const res = await client.query(
    `
    UPDATE app.reminder_instances SET
      status = 'invalidated',
      invalidated_reason = $1,
      invalidation_time = now(),
      updated_at = now()
    WHERE workspace_id = $2 AND target_type = $3 AND target_id = $4
      AND status IN ('scheduled', 'snoozed');
    `,
    [reason, workspaceId, targetType, targetId]
  );

  return res.rowCount ?? 0;
}
