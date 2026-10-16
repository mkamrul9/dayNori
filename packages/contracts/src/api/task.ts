import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';
import { SecurityScopeSchema } from './organization.js';

// --- Task Domain Enums & Value Objects ---

export const TaskPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskStatusSchema = z.enum(['todo', 'in_progress', 'completed', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskDeadlineNoneSchema = z.object({
  type: z.literal('none'),
});
export type TaskDeadlineNone = z.infer<typeof TaskDeadlineNoneSchema>;

export const TaskDeadlineDateSchema = z.object({
  type: z.literal('date'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
});
export type TaskDeadlineDate = z.infer<typeof TaskDeadlineDateSchema>;

export const TaskDeadlineTimedSchema = z.object({
  type: z.literal('timed'),
  timestamp: z.string().datetime(),
  timezone: z.string().min(1, 'Timezone is required for timed deadlines'),
});
export type TaskDeadlineTimed = z.infer<typeof TaskDeadlineTimedSchema>;

export const TaskDeadlineSchema = z.discriminatedUnion('type', [
  TaskDeadlineNoneSchema,
  TaskDeadlineDateSchema,
  TaskDeadlineTimedSchema,
]);
export type TaskDeadline = z.infer<typeof TaskDeadlineSchema>;

export const TaskCompletionHistoryItemSchema = z.object({
  completedAt: z.string().datetime(),
  reopenedAt: z.string().datetime().optional(),
});
export type TaskCompletionHistoryItem = z.infer<typeof TaskCompletionHistoryItemSchema>;

// --- Task Entity ---

export const TaskSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  folderId: z.string().uuid().nullable(),
  title: z.string().min(1).max(255),
  details: z.string().max(10000).nullable().default(null),
  priority: TaskPrioritySchema.default('normal'),
  status: TaskStatusSchema.default('todo'),
  deadline: TaskDeadlineSchema.default({ type: 'none' }),
  completedAt: z.string().datetime().nullable().default(null),
  reopenedAt: z.string().datetime().nullable().default(null),
  completionHistory: z.array(TaskCompletionHistoryItemSchema).default([]),
  parentId: z.string().uuid().nullable().default(null),
  subtaskOrder: z.number().int().default(0),
  tags: z.array(z.string().max(50)).default([]),
  rank: z.string().default('00001000'),
  isArchived: z.boolean().default(false),
  isPinned: z.boolean().default(false),
  securityScope: SecurityScopeSchema.default('standard'),
  revision: z.number().int().nonnegative().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().default(null),
});
export type Task = z.infer<typeof TaskSchema>;

// --- Request Schemas ---

export const CreateTaskRequestSchema = z
  .object({
    id: z.string().uuid().optional(),
    folderId: z.string().uuid().nullable().optional(),
    title: z.string().min(1).max(255),
    details: z.string().max(10000).nullable().optional(),
    priority: TaskPrioritySchema.optional().default('normal'),
    status: TaskStatusSchema.optional().default('todo'),
    deadline: TaskDeadlineSchema.optional().default({ type: 'none' }),
    parentId: z.string().uuid().nullable().optional(),
    subtaskOrder: z.number().int().optional().default(0),
    tags: z.array(z.string().max(50)).optional().default([]),
    rank: z.string().optional(),
    isPinned: z.boolean().optional().default(false),
    securityScope: SecurityScopeSchema.optional().default('standard'),
  })
  .strict();
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

export const UpdateTaskRequestSchema = z
  .object({
    folderId: z.string().uuid().nullable().optional(),
    title: z.string().min(1).max(255).optional(),
    details: z.string().max(10000).nullable().optional(),
    priority: TaskPrioritySchema.optional(),
    status: TaskStatusSchema.optional(),
    deadline: TaskDeadlineSchema.nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
    subtaskOrder: z.number().int().optional(),
    tags: z.array(z.string().max(50)).optional(),
    rank: z.string().optional(),
    isPinned: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    baseRevision: z.number().int().nonnegative(),
  })
  .strict();
export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>;

export const CompleteTaskRequestSchema = z
  .object({
    completedAt: z.string().datetime().optional(),
    baseRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type CompleteTaskRequest = z.infer<typeof CompleteTaskRequestSchema>;

export const ReopenTaskRequestSchema = z
  .object({
    reopenedAt: z.string().datetime().optional(),
    baseRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ReopenTaskRequest = z.infer<typeof ReopenTaskRequestSchema>;

export const TrashTaskRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type TrashTaskRequest = z.infer<typeof TrashTaskRequestSchema>;

export const RestoreTaskRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type RestoreTaskRequest = z.infer<typeof RestoreTaskRequestSchema>;

export const TaskParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type TaskParams = z.infer<typeof TaskParamsSchema>;

export const TaskListQuerySchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  status: z.union([TaskStatusSchema, z.literal('incomplete'), z.literal('all')]).optional(),
  priority: TaskPrioritySchema.optional(),
  parentId: z.string().uuid().nullable().optional(),
  tag: z.string().optional(),
  filter: z.enum(['today', 'upcoming', 'overdue', 'undated', 'completed', 'all']).optional(),
  userTimezone: z.string().optional().default('UTC'),
  sortBy: z.enum(['deadline', 'priority', 'created', 'rank']).optional().default('deadline'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('asc'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>;

// --- Response Schemas ---

export const TaskResponseSchema = z.object({
  data: TaskSchema,
  meta: ResponseMetaSchema,
});
export type TaskResponse = z.infer<typeof TaskResponseSchema>;

export const TaskListResponseSchema = z.object({
  data: z.array(TaskSchema),
  meta: ResponseMetaSchema,
});
export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;
