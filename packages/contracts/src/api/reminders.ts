import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

// --- Reminder Channels, Recurrence & Behaviors ---

export const ReminderTargetTypeSchema = z.enum(['task', 'routine', 'calendar_event']);
export type ReminderTargetType = z.infer<typeof ReminderTargetTypeSchema>;

export const ReminderRecurrenceSchema = z.enum(['none', 'daily', 'weekly', 'weekdays']);
export type ReminderRecurrence = z.infer<typeof ReminderRecurrenceSchema>;

export const QuietHoursBehaviorSchema = z.enum(['defer', 'allow', 'drop']);
export type QuietHoursBehavior = z.infer<typeof QuietHoursBehaviorSchema>;

export const ReminderPrivacyLevelSchema = z.enum(['generic', 'detailed']);
export type ReminderPrivacyLevel = z.infer<typeof ReminderPrivacyLevelSchema>;

export const ReminderChannelSchema = z.enum(['in_app', 'push', 'local']);
export type ReminderChannel = z.infer<typeof ReminderChannelSchema>;

export const ReminderInstanceStatusSchema = z.enum([
  'scheduled',
  'snoozed',
  'processing',
  'dispatched',
  'invalidated',
  'dismissed',
  'observed',
]);
export type ReminderInstanceStatus = z.infer<typeof ReminderInstanceStatusSchema>;

export const ReminderDeliveryStatusSchema = z.enum([
  'pending',
  'accepted',
  'failed',
  'delivered',
  'opened',
  'dropped_quiet_hours',
]);
export type ReminderDeliveryStatus = z.infer<typeof ReminderDeliveryStatusSchema>;

// --- Reminder Rule Schema ---

export const ReminderRuleSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  targetType: ReminderTargetTypeSchema,
  targetId: z.string().uuid(),
  ruleRevision: z.number().int().default(1),
  offsetMinutes: z.number().int().nullable().default(null),
  scheduleTime: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:mm format')
    .nullable()
    .default(null),
  timezone: z.string().min(1).default('UTC'),
  recurrence: ReminderRecurrenceSchema.default('none'),
  quietHoursBehavior: QuietHoursBehaviorSchema.default('defer'),
  channels: z.array(ReminderChannelSchema).default(['in_app', 'push']),
  privacyLevel: ReminderPrivacyLevelSchema.default('generic'),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().default(null),
});
export type ReminderRule = z.infer<typeof ReminderRuleSchema>;

// --- Request Schemas ---

export const CreateReminderRuleRequestSchema = z.object({
  id: z.string().uuid().optional(),
  targetType: ReminderTargetTypeSchema,
  targetId: z.string().uuid(),
  offsetMinutes: z.number().int().nullable().optional(),
  scheduleTime: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:mm format')
    .nullable()
    .optional(),
  timezone: z.string().min(1).optional().default('UTC'),
  recurrence: ReminderRecurrenceSchema.optional().default('none'),
  quietHoursBehavior: QuietHoursBehaviorSchema.optional().default('defer'),
  channels: z.array(ReminderChannelSchema).optional().default(['in_app', 'push']),
  privacyLevel: ReminderPrivacyLevelSchema.optional().default('generic'),
});
export type CreateReminderRuleRequest = z.infer<typeof CreateReminderRuleRequestSchema>;

export const UpdateReminderRuleRequestSchema = z.object({
  offsetMinutes: z.number().int().nullable().optional(),
  scheduleTime: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:mm format')
    .nullable()
    .optional(),
  timezone: z.string().min(1).optional(),
  recurrence: ReminderRecurrenceSchema.optional(),
  quietHoursBehavior: QuietHoursBehaviorSchema.optional(),
  channels: z.array(ReminderChannelSchema).optional(),
  privacyLevel: ReminderPrivacyLevelSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateReminderRuleRequest = z.infer<typeof UpdateReminderRuleRequestSchema>;

// --- Reminder Instance Schema ---

export const ReminderInstanceSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  ruleId: z.string().uuid(),
  ruleRevision: z.number().int(),
  occurrenceKey: z.string().min(1),
  targetType: ReminderTargetTypeSchema,
  targetId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  originalScheduledAt: z.string().datetime(),
  status: ReminderInstanceStatusSchema,
  snoozeUntil: z.string().datetime().nullable().default(null),
  invalidatedReason: z.string().nullable().default(null),
  invalidationTime: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReminderInstance = z.infer<typeof ReminderInstanceSchema>;

export const SnoozeReminderRequestSchema = z.object({
  snoozeMinutes: z.number().int().min(5).max(1440).default(15),
});
export type SnoozeReminderRequest = z.infer<typeof SnoozeReminderRequestSchema>;

export const RecordDeliveryReceiptRequestSchema = z.object({
  status: z.enum(['delivered', 'opened']),
});
export type RecordDeliveryReceiptRequest = z.infer<typeof RecordDeliveryReceiptRequestSchema>;

// --- Reminder Delivery Schema ---

export const ReminderDeliverySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  instanceId: z.string().uuid(),
  channel: ReminderChannelSchema,
  recipientUserId: z.string().uuid(),
  provider: z.enum(['in_app', 'fcm', 'web_push']),
  providerMessageId: z.string().nullable().default(null),
  status: ReminderDeliveryStatusSchema,
  redactedTitle: z.string(),
  redactedBody: z.string().nullable().default(null),
  attemptCount: z.number().int().default(0),
  lastAttemptAt: z.string().datetime().nullable().default(null),
  errorMessage: z.string().nullable().default(null),
  openedAt: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReminderDelivery = z.infer<typeof ReminderDeliverySchema>;

// --- Response Payloads ---

export const ReminderRuleResponseSchema = z.object({
  data: ReminderRuleSchema,
  meta: ResponseMetaSchema,
});
export type ReminderRuleResponse = z.infer<typeof ReminderRuleResponseSchema>;

export const ReminderRuleListResponseSchema = z.object({
  data: z.array(ReminderRuleSchema),
  meta: ResponseMetaSchema,
});
export type ReminderRuleListResponse = z.infer<typeof ReminderRuleListResponseSchema>;

export const ReminderInstanceResponseSchema = z.object({
  data: ReminderInstanceSchema,
  meta: ResponseMetaSchema,
});
export type ReminderInstanceResponse = z.infer<typeof ReminderInstanceResponseSchema>;

export const ReminderInstanceListResponseSchema = z.object({
  data: z.array(ReminderInstanceSchema),
  meta: ResponseMetaSchema,
});
export type ReminderInstanceListResponse = z.infer<typeof ReminderInstanceListResponseSchema>;

export const ReminderDeliveryResponseSchema = z.object({
  data: ReminderDeliverySchema,
  meta: ResponseMetaSchema,
});
export type ReminderDeliveryResponse = z.infer<typeof ReminderDeliveryResponseSchema>;
