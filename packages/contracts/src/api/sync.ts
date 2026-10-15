import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';
import { ItemSchema } from './item.js';

export const SyncCommandTypeSchema = z.enum([
  'createItem',
  'updateItem',
  'archiveItem',
  'unarchiveItem',
  'pinItem',
  'unpinItem',
  'trashItem',
  'restoreItem',
  'createFolder',
  'updateFolder',
  'moveFolder',
  'reorderFolder',
  'archiveFolder',
  'unarchiveFolder',
  'pinFolder',
  'unpinFolder',
  'trashFolder',
  'restoreFolder',
]);

export type SyncCommandType = z.infer<typeof SyncCommandTypeSchema>;

/**
 * Strict canonical mutation command envelope
 */
export const SyncCommandSchema = z
  .object({
    operationId: z.string().uuid(),
    deviceId: z.string().min(1).max(128),
    workspaceId: z.string().uuid(),
    commandVersion: z.number().int().min(1).default(1),
    schemaVersion: z.number().int().min(1).default(1),
    command: SyncCommandTypeSchema,
    entityType: z.enum(['item', 'folder']),
    entityId: z.string().uuid(),
    baseRevision: z.number().int().nonnegative().default(0),
    dependencyOperationIds: z.array(z.string().uuid()).max(50).default([]),
    clientTimestamp: z.string().datetime(),
    payload: z.record(z.unknown()).default({}),
  })
  .strict();

export type SyncCommand = z.infer<typeof SyncCommandSchema>;

/**
 * Push request bounded to at most 50 commands
 */
export const SyncPushRequestSchema = z
  .object({
    commands: z.array(SyncCommandSchema).min(1).max(50),
  })
  .strict();

export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;

export const MutationResultStatusSchema = z.enum(['accepted', 'conflict', 'rejected']);
export type MutationResultStatus = z.infer<typeof MutationResultStatusSchema>;

export const MutationResultErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  currentServerRevision: z.number().int().optional(),
  currentServerState: z.record(z.unknown()).optional(),
});

export type MutationResultError = z.infer<typeof MutationResultErrorSchema>;

export const MutationResultSchema = z.object({
  operationId: z.string().uuid(),
  status: MutationResultStatusSchema,
  entityId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  seq: z.number().int().positive().nullable(),
  error: MutationResultErrorSchema.optional(),
});

export type MutationResult = z.infer<typeof MutationResultSchema>;

export const SyncPushResponseSchema = z.object({
  data: z.object({
    results: z.array(MutationResultSchema),
  }),
  meta: ResponseMetaSchema,
});

export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;

/**
 * Pull query parameters with limit bounded between 1 and 500
 */
export const SyncPullQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export type SyncPullQuery = z.infer<typeof SyncPullQuerySchema>;

export const ChangeRecordSchema = z.object({
  seq: z.number().int().positive(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  isTombstone: z.boolean(),
  operationId: z.string().uuid(),
  data: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});

export type ChangeRecord = z.infer<typeof ChangeRecordSchema>;

export const SyncPullResponseSchema = z.object({
  data: z.object({
    changes: z.array(ChangeRecordSchema),
    nextCursor: z.string().optional(),
    hasMore: z.boolean(),
    accessEpoch: z.string(),
  }),
  meta: ResponseMetaSchema,
});

export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;

export const SyncBootstrapQuerySchema = z.object({
  workspaceId: z.string().uuid(),
});

export type SyncBootstrapQuery = z.infer<typeof SyncBootstrapQuerySchema>;

export const SyncBootstrapResponseSchema = z.object({
  data: z.object({
    items: z.array(ItemSchema),
    watermarkCursor: z.string(),
    accessEpoch: z.string(),
  }),
  meta: ResponseMetaSchema,
});

export type SyncBootstrapResponse = z.infer<typeof SyncBootstrapResponseSchema>;
