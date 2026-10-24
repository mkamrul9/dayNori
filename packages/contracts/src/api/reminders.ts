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
  'unavailable',
  'suppressed_local_schedule',
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
  clientMutationId: z.string().optional(),
});
export type CreateReminderRuleRequest = z.infer<typeof CreateReminderRuleRequestSchema>;

export const UpdateReminderRuleRequestSchema = z.object({
  baseRevision: z.number().int().nonnegative().optional(),
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
  clientMutationId: z.string().optional(),
});
export type UpdateReminderRuleRequest = z.infer<typeof UpdateReminderRuleRequestSchema>;

// --- Reminder Instance Schema ---

export const ReminderInstanceSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  ruleId: z.string().uuid(),
  ruleRevision: z.number().int(),
  deliveryGeneration: z.number().int().default(1),
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
  clientMutationId: z.string().optional(),
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
  deliveryGeneration: z.number().int().default(1),
  channel: ReminderChannelSchema,
  recipientUserId: z.string().uuid(),
  recipientDeviceId: z.string().uuid().nullable().optional().default(null),
  recipientSubscriptionId: z.string().uuid().nullable().optional().default(null),
  provider: z.enum(['in_app', 'fcm', 'expo_push', 'web_push']),
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

// --- Device Registration & Coordination (Phase 28) ---

export const DevicePlatformSchema = z.enum(['android', 'ios', 'web']);
export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;

export const DeviceTokenTypeSchema = z.enum(['fcm', 'expo_push', 'web_push', 'none']);
export type DeviceTokenType = z.infer<typeof DeviceTokenTypeSchema>;

export const RegisterDeviceRequestSchema = z.object({
  installationId: z.string().trim().min(1).max(128),
  platform: DevicePlatformSchema,
  pushToken: z.string().trim().min(1).max(512).nullable().optional(),
  tokenType: DeviceTokenTypeSchema.default('none'),
  capabilities: z.record(z.unknown()).optional().default({}),
});
export type RegisterDeviceRequest = z.infer<typeof RegisterDeviceRequestSchema>;

export const DeviceSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  installationId: z.string(),
  platform: DevicePlatformSchema,
  pushToken: z.string().nullable(),
  tokenType: DeviceTokenTypeSchema,
  capabilities: z.record(z.unknown()),
  isActive: z.boolean(),
  lastSeenAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Device = z.infer<typeof DeviceSchema>;

export const AcknowledgeDeviceScheduleRequestSchema = z.object({
  instanceId: z.string().uuid(),
  deviceId: z.string().uuid(),
  ruleRevision: z.number().int().positive(),
  deliveryGeneration: z.number().int().positive().default(1),
  nativeNotificationId: z.string().nullable().optional(),
  deliveryMode: z.enum(['local', 'push']),
  acknowledged: z.boolean().default(true),
});
export type AcknowledgeDeviceScheduleRequest = z.infer<typeof AcknowledgeDeviceScheduleRequestSchema>;

export const DeviceScheduleSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  instanceId: z.string().uuid(),
  deviceId: z.string().uuid(),
  ruleRevision: z.number().int(),
  deliveryGeneration: z.number().int(),
  nativeNotificationId: z.string().nullable(),
  deliveryMode: z.enum(['local', 'push']),
  acknowledged: z.boolean(),
  acknowledgedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DeviceSchedule = z.infer<typeof DeviceScheduleSchema>;

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

export const DeviceResponseSchema = z.object({
  data: DeviceSchema,
  meta: ResponseMetaSchema,
});
export type DeviceResponse = z.infer<typeof DeviceResponseSchema>;

export const DeviceListResponseSchema = z.object({
  data: z.array(DeviceSchema),
  meta: ResponseMetaSchema,
});
export type DeviceListResponse = z.infer<typeof DeviceListResponseSchema>;

export const DeviceScheduleResponseSchema = z.object({
  data: DeviceScheduleSchema,
  meta: ResponseMetaSchema,
});
export type DeviceScheduleResponse = z.infer<typeof DeviceScheduleResponseSchema>;

export const DeviceScheduleListResponseSchema = z.object({
  data: z.array(DeviceScheduleSchema),
  meta: ResponseMetaSchema,
});
export type DeviceScheduleListResponse = z.infer<typeof DeviceScheduleListResponseSchema>;

// --- Web Push Subscriptions (Phase 29) ---

export const RegisterWebPushSubscriptionRequestSchema = z.object({
  endpoint: z.string().url().max(1024),
  p256dh: z.string().min(1).max(256),
  auth: z.string().min(1).max(256),
  userAgent: z.string().max(512).optional(),
});
export type RegisterWebPushSubscriptionRequest = z.infer<typeof RegisterWebPushSubscriptionRequestSchema>;

export const WebPushSubscriptionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
  userAgent: z.string().nullable(),
  isActive: z.boolean(),
  lastSeenAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WebPushSubscription = z.infer<typeof WebPushSubscriptionSchema>;

export const WebPushSubscriptionResponseSchema = z.object({
  data: WebPushSubscriptionSchema,
  meta: ResponseMetaSchema,
});
export type WebPushSubscriptionResponse = z.infer<typeof WebPushSubscriptionResponseSchema>;

export const WebPushSubscriptionListResponseSchema = z.object({
  data: z.array(WebPushSubscriptionSchema),
  meta: ResponseMetaSchema,
});
export type WebPushSubscriptionListResponse = z.infer<typeof WebPushSubscriptionListResponseSchema>;

export const VapidPublicKeyResponseSchema = z.object({
  data: z.object({
    publicKey: z.string().min(1),
  }),
  meta: ResponseMetaSchema,
});
export type VapidPublicKeyResponse = z.infer<typeof VapidPublicKeyResponseSchema>;
