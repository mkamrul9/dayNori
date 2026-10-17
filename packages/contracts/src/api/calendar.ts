import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';
import { SecurityScopeSchema } from './organization.js';

// --- Calendar Event Entity Schema ---

export const CalendarEventSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  folderId: z.string().uuid().nullable().default(null),
  title: z.string().min(1).max(255),
  details: z.string().max(10000).nullable().default(null),
  allDay: z.boolean().default(false),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
    .nullable()
    .default(null),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
    .nullable()
    .default(null),
  startAt: z.string().datetime().nullable().default(null),
  endAt: z.string().datetime().nullable().default(null),
  timezone: z.string().min(1).default('UTC'),
  isArchived: z.boolean().default(false),
  securityScope: SecurityScopeSchema.default('standard'),
  revision: z.number().int().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().default(null),
});
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

// --- Request / Response Schemas ---

export const CreateCalendarEventRequestSchema = z.object({
  id: z.string().uuid().optional(),
  folderId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(255),
  details: z.string().max(10000).nullable().optional(),
  allDay: z.boolean().default(false),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
    .optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  timezone: z.string().min(1).default('UTC'),
});
export type CreateCalendarEventRequest = z.infer<typeof CreateCalendarEventRequestSchema>;

export const UpdateCalendarEventRequestSchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(255).optional(),
  details: z.string().max(10000).nullable().optional(),
  allDay: z.boolean().optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
    .nullable()
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
    .nullable()
    .optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  timezone: z.string().min(1).optional(),
  isArchived: z.boolean().optional(),
  expectedRevision: z.number().int().optional(),
});
export type UpdateCalendarEventRequest = z.infer<typeof UpdateCalendarEventRequestSchema>;

export const CalendarEventResponseSchema = z.object({
  data: CalendarEventSchema,
  meta: ResponseMetaSchema.optional(),
});
export type CalendarEventResponse = z.infer<typeof CalendarEventResponseSchema>;

// --- Calendar Feed Query & Read Model Schemas ---

export const CalendarFeedQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be formatted as YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be formatted as YYYY-MM-DD'),
  timezone: z.string().min(1).optional().default('UTC'),
  includeTasks: z
    .preprocess(
      (val) =>
        val === 'true' || val === true ? true : val === 'false' || val === false ? false : val,
      z.boolean().optional()
    )
    .default(true),
  includeRoutines: z
    .preprocess(
      (val) =>
        val === 'true' || val === true ? true : val === 'false' || val === false ? false : val,
      z.boolean().optional()
    )
    .default(true),
  includeEvents: z
    .preprocess(
      (val) =>
        val === 'true' || val === true ? true : val === 'false' || val === false ? false : val,
      z.boolean().optional()
    )
    .default(true),
  includeJournalIndicators: z
    .preprocess(
      (val) =>
        val === 'true' || val === true ? true : val === 'false' || val === false ? false : val,
      z.boolean().optional()
    )
    .default(true),
});
export type CalendarFeedQuery = z.infer<typeof CalendarFeedQuerySchema>;

export const CalendarTaskDeadlineItemSchema = z.object({
  sourceType: z.literal('task_deadline'),
  id: z.string(),
  taskId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  folderId: z.string().uuid().nullable(),
  title: z.string(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  status: z.enum(['todo', 'in_progress', 'completed', 'cancelled']),
  deadlineType: z.enum(['date', 'timed']),
  deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deadlineTime: z.string().datetime().optional(),
  deadlineZone: z.string().optional(),
  isOverdue: z.boolean(),
  tags: z.array(z.string()).default([]),
});
export type CalendarTaskDeadlineItem = z.infer<typeof CalendarTaskDeadlineItemSchema>;

export const CalendarRoutineOccurrenceItemSchema = z.object({
  sourceType: z.literal('routine_occurrence'),
  id: z.string(),
  routineId: z.string().uuid(),
  occurrenceId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  routineTitle: z.string(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedInstant: z.string().datetime().nullable(),
  timezone: z.string(),
  status: z.enum(['pending', 'done', 'skipped', 'cancelled']),
});
export type CalendarRoutineOccurrenceItem = z.infer<typeof CalendarRoutineOccurrenceItemSchema>;

export const CalendarPersonalEventItemSchema = z.object({
  sourceType: z.literal('calendar_event'),
  id: z.string(),
  eventId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  folderId: z.string().uuid().nullable(),
  title: z.string(),
  details: z.string().nullable().default(null),
  allDay: z.boolean(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startAt: z.string().datetime().nullable(),
  endAt: z.string().datetime().nullable(),
  timezone: z.string(),
});
export type CalendarPersonalEventItem = z.infer<typeof CalendarPersonalEventItemSchema>;

export const CalendarItemSchema = z.discriminatedUnion('sourceType', [
  CalendarTaskDeadlineItemSchema,
  CalendarRoutineOccurrenceItemSchema,
  CalendarPersonalEventItemSchema,
]);
export type CalendarItem = z.infer<typeof CalendarItemSchema>;

export const JournalDateIndicatorSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasEntry: z.boolean(),
  count: z.number().int(),
});
export type JournalDateIndicator = z.infer<typeof JournalDateIndicatorSchema>;

export const CalendarReadModelResponseSchema = z.object({
  data: z.object({
    startDate: z.string(),
    endDate: z.string(),
    timezone: z.string(),
    items: z.array(CalendarItemSchema),
    journalIndicators: z.record(z.string(), JournalDateIndicatorSchema),
  }),
  meta: ResponseMetaSchema.optional(),
});
export type CalendarReadModelResponse = z.infer<typeof CalendarReadModelResponseSchema>;
