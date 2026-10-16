import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

// --- Routine Domain Enums & Value Objects ---

export const RoutineFrequencySchema = z.enum(['daily', 'weekdays']);
export type RoutineFrequency = z.infer<typeof RoutineFrequencySchema>;

export const WeekdaySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);
export type Weekday = z.infer<typeof WeekdaySchema>;

export const RoutineOccurrenceStatusSchema = z.enum(['pending', 'done', 'skipped', 'cancelled']);
export type RoutineOccurrenceStatus = z.infer<typeof RoutineOccurrenceStatusSchema>;

export const RoutineOccurrenceTransitionSchema = z.object({
  status: RoutineOccurrenceStatusSchema.optional(),
  toStatus: RoutineOccurrenceStatusSchema.optional(),
  previousStatus: RoutineOccurrenceStatusSchema.optional(),
  fromStatus: RoutineOccurrenceStatusSchema.optional(),
  changedAt: z.string().datetime().optional(),
  transitionedAt: z.string().datetime().optional(),
  actorId: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
});
export type RoutineOccurrenceTransition = z.infer<typeof RoutineOccurrenceTransitionSchema>;

// --- Routine Template Entity ---

export const RoutineSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  folderId: z.string().uuid().nullable().default(null),
  title: z.string().min(1).max(255),
  details: z.string().max(10000).nullable().default(null),
  frequency: RoutineFrequencySchema.default('daily'),
  weekdays: z.array(WeekdaySchema).default([]),
  timezone: z.string().min(1).max(100),
  scheduledTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:mm 24h format')
    .nullable()
    .default(null),
  activeFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  activeTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
    .nullable()
    .default(null),
  isPaused: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  isPinned: z.boolean().default(false),
  scheduleRevision: z.number().int().positive().default(1),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  revision: z.number().int().nonnegative().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().default(null),
});
export type Routine = z.infer<typeof RoutineSchema>;

// --- Routine Occurrence Entity ---

export const RoutineOccurrenceSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  routineId: z.string().uuid(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  scheduleRevision: z.number().int().positive().default(1),
  plannedInstant: z.string().datetime().nullable().default(null),
  timezone: z.string().min(1).max(100),
  status: RoutineOccurrenceStatusSchema.default('pending'),
  completedAt: z.string().datetime().nullable().default(null),
  completedBy: z.string().nullable().default(null),
  history: z.array(RoutineOccurrenceTransitionSchema).default([]),
  serverRevision: z.number().int().nonnegative().default(1),
  revision: z.number().int().nonnegative().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RoutineOccurrence = z.infer<typeof RoutineOccurrenceSchema>;

// --- Request Schemas ---

export const CreateRoutineRequestSchema = z
  .object({
    id: z.string().uuid().optional(),
    folderId: z.string().uuid().nullable().optional(),
    title: z.string().min(1).max(255),
    details: z.string().max(10000).nullable().optional(),
    frequency: RoutineFrequencySchema.optional().default('daily'),
    weekdays: z.array(WeekdaySchema).optional().default([]),
    timezone: z.string().min(1).max(100),
    scheduledTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    activeFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    activeTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    isPinned: z.boolean().optional().default(false),
  })
  .strict();
export type CreateRoutineRequest = z.infer<typeof CreateRoutineRequestSchema>;

export const UpdateRoutineRequestSchema = z
  .object({
    folderId: z.string().uuid().nullable().optional(),
    title: z.string().min(1).max(255).optional(),
    details: z.string().max(10000).nullable().optional(),
    frequency: RoutineFrequencySchema.optional(),
    weekdays: z.array(WeekdaySchema).optional(),
    timezone: z.string().min(1).max(100).optional(),
    scheduledTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    activeFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    activeTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    isPaused: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    baseRevision: z.number().int().nonnegative(),
  })
  .strict();
export type UpdateRoutineRequest = z.infer<typeof UpdateRoutineRequestSchema>;

export const CompleteOccurrenceRequestSchema = z
  .object({
    baseRevision: z.number().int().nonnegative(),
    routineId: z.string().uuid().optional(),
    scheduledDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();
export type CompleteOccurrenceRequest = z.infer<typeof CompleteOccurrenceRequestSchema>;

export const SkipOccurrenceRequestSchema = z
  .object({
    baseRevision: z.number().int().nonnegative(),
    routineId: z.string().uuid().optional(),
    scheduledDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();
export type SkipOccurrenceRequest = z.infer<typeof SkipOccurrenceRequestSchema>;

export const ReopenOccurrenceRequestSchema = z
  .object({
    baseRevision: z.number().int().nonnegative(),
  })
  .strict();
export type ReopenOccurrenceRequest = z.infer<typeof ReopenOccurrenceRequestSchema>;

export const GenerateOccurrencesQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  routineId: z.string().uuid().optional(),
});
export type GenerateOccurrencesQuery = z.infer<typeof GenerateOccurrencesQuerySchema>;

export const RoutineListQuerySchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  includePaused: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v !== 'false'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
export type RoutineListQuery = z.infer<typeof RoutineListQuerySchema>;

// --- Response Schemas ---

export const RoutineResponseSchema = z.object({
  data: RoutineSchema,
  meta: ResponseMetaSchema,
});
export type RoutineResponse = z.infer<typeof RoutineResponseSchema>;

export const RoutineListResponseSchema = z.object({
  data: z.array(RoutineSchema),
  meta: ResponseMetaSchema,
  nextCursor: z.string().optional(),
});
export type RoutineListResponse = z.infer<typeof RoutineListResponseSchema>;

export const RoutineOccurrenceResponseSchema = z.object({
  data: RoutineOccurrenceSchema,
  meta: ResponseMetaSchema,
});
export type RoutineOccurrenceResponse = z.infer<typeof RoutineOccurrenceResponseSchema>;

export const RoutineOccurrenceListResponseSchema = z.object({
  data: z.array(RoutineOccurrenceSchema),
  meta: ResponseMetaSchema,
});
export type RoutineOccurrenceListResponse = z.infer<typeof RoutineOccurrenceListResponseSchema>;
